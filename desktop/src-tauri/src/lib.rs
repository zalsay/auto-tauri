// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[macro_use]
extern crate log;
extern crate env_logger;

mod infra;

use infra::doctor::{check_system_health, install_tool_in_terminal};
use infra::opencode::{
    get_opencode_status as get_status_impl, spawn_opencode_task as spawn_task_impl, update_opencode_config,
    get_opencode_config, OpenCodeStatus, OpenCodeTaskRequest, OpenCodeTaskResult, OpenCodeConfig,
};
use infra::ralph::{
    get_ralph_progress, is_ralph_active, open_terminal_at, sync_ralph_plan, RalphProgress,
};
use infra::router::{smart_dispatch_task, DispatchResult};
use infra::parser::{extract_tasks_from_prd, supplement_plan_from_prd, supplement_test_plan_from_prd, parse_development_steps, mark_step_completed, mark_step_skipped, reset_steps, DevelopmentProgress, DevelopmentStep, StepStatus};

use infra::planner::{generate_dev_plan, generate_test_plan, read_skill_content, save_plan_file, read_plan_file, check_plan_files, PlanFilesStatus};
use infra::task_manager::{start_analysis_task, get_task_status, get_task_by_id, cancel_task, AnalysisTask, TaskStatus};
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Execute a shell command and return output
#[tauri::command]
async fn execute_command(command: String, working_dir: String) -> Result<String, String> {
    use tokio::process::Command;

    info!("Executing command: {} in {}", command, working_dir);

    let output = Command::new("bash")
        .arg("-c")
        .arg(&command)
        .current_dir(working_dir)
        .output()
        .await
        .map_err(|e| format!("执行命令失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let mut result = String::new();

    if !stdout.is_empty() {
        result.push_str(&stdout);
    }

    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push_str("\n");
        }
        result.push_str(&format!("Error: {}", stderr));
    }

    if result.is_empty() {
        result = "命令执行完成（无输出）".to_string();
    }

    Ok(result)
}

/// Execute a command and stream output to frontend via events
#[tauri::command]
async fn execute_command_stream(
    window: tauri::Window,
    command: String,
    working_dir: String,
    event_id: String,
) -> Result<(), String> {
    use tokio::process::Command as AsyncCommand;
    use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};

    info!("Streaming command: {} in {}", command, working_dir);

    let mut child = AsyncCommand::new("bash")
        .arg("-c")
        .arg(&command)
        .current_dir(working_dir)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("启动命令失败: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = AsyncBufReader::new(stdout);

    let mut line = String::new();
    while let Ok(n) = reader.read_line(&mut line).await {
        if n == 0 {
            break;
        }
        let output = line.trim().to_string();
        if !output.is_empty() {
            let _ = window.emit(&event_id, serde_json::json!({
                "type": "output",
                "content": output
            }));
        }
        line.clear();
    }

    let status = child.wait().await.map_err(|e| format!("等待命令完成失败: {}", e))?;
    let exit_code = status.code().unwrap_or(-1);

    let _ = window.emit(&event_id, serde_json::json!({
        "type": "complete",
        "exit_code": exit_code
    }));

    Ok(())
}

/// Execute opencode command and stream output to frontend
#[tauri::command]
async fn execute_opencode_command(
    window: tauri::Window,
    prompt: String,
    working_dir: String,
    event_id: String,
) -> Result<(), String> {
    use tokio::process::Command as AsyncCommand;
    use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};

    info!("Executing opencode command in {}", working_dir);

    let escaped_prompt = prompt.replace("\"", "\\\"").replace("\n", "\\n");

    let opencode_cmd = format!(
        r#"export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd "{}" && opencode --title "AI Coding" --model openai --prompt "{}""#,
        working_dir,
        escaped_prompt
    );

    let mut child = AsyncCommand::new("bash")
        .arg("-c")
        .arg(&opencode_cmd)
        .current_dir(&working_dir)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("启动 opencode 失败: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_reader = AsyncBufReader::new(stdout);
    let mut stderr_reader = AsyncBufReader::new(stderr);

    let mut stdout_line = String::new();
    let mut stderr_line = String::new();

    loop {
        tokio::select! {
            stdout_result = stdout_reader.read_line(&mut stdout_line) => {
                match stdout_result {
                    Ok(n) if n > 0 => {
                        let output = stdout_line.trim().to_string();
                        if !output.is_empty() {
                            let _ = window.emit(&event_id, serde_json::json!({
                                "type": "output",
                                "content": output
                            }));
                        }
                        stdout_line.clear();
                    }
                    _ => {}
                }
            }
            stderr_result = stderr_reader.read_line(&mut stderr_line) => {
                match stderr_result {
                    Ok(n) if n > 0 => {
                        let output = stderr_line.trim().to_string();
                        if !output.is_empty() {
                            let _ = window.emit(&event_id, serde_json::json!({
                                "type": "output",
                                "content": output
                            }));
                        }
                        stderr_line.clear();
                    }
                    _ => {}
                }
            }
            else => break,
        }
    }

    let status = child.wait().await.map_err(|e| format!("等待命令完成失败: {}", e))?;
    let exit_code = status.code().unwrap_or(-1);

    let _ = window.emit(&event_id, serde_json::json!({
        "type": "complete",
        "exit_code": exit_code
    }));

    Ok(())
}

/// Spawn an OpenCode task for a specific file
#[tauri::command]
async fn spawn_opencode_task(
    file_path: String,
    prompt: String,
    working_dir: String,
) -> Result<OpenCodeTaskResult, String> {
    let request = OpenCodeTaskRequest {
        file_path,
        prompt,
        working_dir,
    };
    spawn_task_impl(request).await
}

/// Get current OpenCode runner status
#[tauri::command]
async fn get_opencode_status() -> OpenCodeStatus {
    get_status_impl().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_system_health,
            install_tool_in_terminal,
            spawn_opencode_task,
            get_opencode_status,
            update_opencode_config,
            get_opencode_config,
            sync_ralph_plan,
            get_ralph_progress,
            open_terminal_at,
            is_ralph_active,
            smart_dispatch_task,
            extract_tasks_from_prd,
            generate_dev_plan,
            generate_test_plan,
            read_skill_content,
            save_plan_file,
            read_plan_file,
            check_plan_files,
            supplement_plan_from_prd,
            supplement_test_plan_from_prd,
            parse_development_steps,
            mark_step_completed,
            mark_step_skipped,
            reset_steps,
            start_analysis_task,
            get_task_status,
            get_task_by_id,
            cancel_task,
            execute_command,
            execute_command_stream,
            execute_opencode_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
