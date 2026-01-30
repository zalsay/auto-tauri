// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[macro_use]
extern crate log;
extern crate env_logger;

mod infra;

use infra::doctor::{check_system_health, install_tool_in_terminal};
use infra::opencode::{
    get_opencode_status as get_status_impl, spawn_opencode_task as spawn_task_impl, update_opencode_config,
    get_opencode_config, OpenCodeStatus, OpenCodeTaskRequest, OpenCodeTaskResult, OpenCodeConfig,
    get_coding_master_config, CodingMasterConfig,
};
use infra::ralph::{
    get_ralph_progress, is_ralph_active, open_terminal_at, sync_ralph_plan, RalphProgress,
};
use infra::router::{smart_dispatch_task, DispatchResult};
use infra::parser::{extract_tasks_from_prd, supplement_plan_from_prd, supplement_test_plan_from_prd, parse_development_steps, mark_step_completed, mark_step_skipped, reset_steps, DevelopmentProgress, DevelopmentStep, StepStatus};

use infra::planner::{generate_dev_plan, generate_test_plan, read_skill_content, save_plan_file, read_plan_file, check_plan_files, PlanFilesStatus};
use infra::task_manager::{start_analysis_task, get_task_status, get_task_by_id, cancel_task, AnalysisTask, TaskStatus};
use infra::llm::{init_llm_service, llm_chat, llm_chat_with_system, get_llm_config_file, save_llm_config_file, LLMMessage, LLMResponse};
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

/// Execute sandbox command with isolated environment
#[tauri::command]
async fn execute_sandbox_command(
    sandbox_id: String,
    command: String,
    working_dir: String,
    session_id: String,
) -> Result<serde_json::Value, String> {
    use tokio::process::Command as AsyncCommand;

    info!("Sandbox [{}] executing: {} in {}", sandbox_id, command, working_dir);

    let sandbox_dir = format!("/tmp/sandbox/{}", sandbox_id);

    let _ = std::fs::create_dir_all(&sandbox_dir);

    let full_command = format!(
        r#"export SANDBOX_ID="{}" && export SANDBOX_SESSION="{}" && export SANDBOX_ROOT="{}" && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd "{}" && {}"#,
        sandbox_id, session_id, sandbox_dir, working_dir, command
    );

    let output = AsyncCommand::new("bash")
        .arg("-c")
        .arg(&full_command)
        .current_dir(&working_dir)
        .env("SANDBOX_ID", &sandbox_id)
        .env("SANDBOX_SESSION", &session_id)
        .env("SANDBOX_ROOT", &sandbox_dir)
        .env_remove("PYTHONPATH")
        .env_remove("NODE_PATH")
        .output()
        .await
        .map_err(|e| format!("执行命令失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    let mut result = serde_json::json!({
        "success": exit_code == 0,
        "exitCode": exit_code,
        "sandboxId": sandbox_id,
        "sessionId": session_id,
        "workingDir": working_dir
    });

    if !stdout.is_empty() {
        result["output"] = serde_json::Value::String(stdout.clone());
    }

    if !stderr.is_empty() {
        result["error"] = serde_json::Value::String(stderr.clone());
    }

    if stdout.is_empty() && stderr.is_empty() {
        result["output"] = serde_json::Value::String("命令执行完成（无输出）".to_string());
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

/// Read file content
#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))
}

/// Generate opencode config from coding master config
#[tauri::command]
async fn generate_opencode_config() -> Result<String, String> {
    // Read coding master config
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = std::path::PathBuf::from(&home).join(".opencode").join("config.json");
    
    println!("[generate_opencode_config] Reading config from: {}", config_path.display());
    
    let (api_key, model, small_model) = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        
        println!("[generate_opencode_config] Config content length: {}", content.len());
        
        let config: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))?;
        
        // Debug: print the config structure
        println!("[generate_opencode_config] Full config: {}", content);

        // Extract Anthropic API key
        let api_key = if let Some(providers) = config.get("provider").and_then(|p| p.as_object()) {
            println!("[generate_opencode_config] Providers: {:?}", providers.keys().collect::<Vec<_>>());
            if let Some(anthropic) = providers.get("anthropic") {
                println!("[generate_opencode_config] Anthropic config: {}", anthropic);
                if let Some(key) = anthropic.as_object()
                    .and_then(|o| o.get("api_key"))
                    .and_then(|k| k.as_str())
                {
                    key.to_string()
                } else {
                    "YOUR_ANTHROPIC_API_KEY_HERE".to_string()
                }
            } else {
                "YOUR_ANTHROPIC_API_KEY_HERE".to_string()
            }
        } else {
            "YOUR_ANTHROPIC_API_KEY_HERE".to_string()
        };

        // Extract model from config
        let model = config.get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("anthropic/claude-3-5-sonnet-20241022")
            .to_string();
        
        let small_model = config.get("small_model")
            .and_then(|m| m.as_str())
            .unwrap_or("anthropic/claude-3-haiku-20240307")
            .to_string();

        println!("[generate_opencode_config] Extracted - api_key: {}, model: {}, small_model: {}", 
            api_key.chars().take(10).collect::<String>(), model, small_model);

        (api_key, model, small_model)
    } else {
        println!("[generate_opencode_config] Config file does not exist!");
        (
            "YOUR_ANTHROPIC_API_KEY_HERE".to_string(),
            "anthropic/claude-3-5-sonnet-20241022".to_string(),
            "anthropic/claude-3-haiku-20240307".to_string()
        )
    };

    // Generate opencode config
    let opencode_config = serde_json::json!({
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "anthropic": {
                "apiKey": api_key
            },
            "openai": {}
        },
        "model": model,
        "small_model": small_model
    });

    // Save to opencode config path
    let opencode_config_path = std::path::PathBuf::from(&home)
        .join(".config")
        .join("opencode")
        .join("config.json");
    
    // Create directory if not exists
    if let Some(parent) = opencode_config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let config_content = serde_json::to_string_pretty(&opencode_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&opencode_config_path, &config_content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(format!("Generated opencode config at: {}\n\nModel: {}\nSmall Model: {}\n\nConfig:\n{}",
        opencode_config_path.display(), model, small_model, config_content))
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
            get_coding_master_config,
            generate_opencode_config,
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
            execute_opencode_command,
            execute_sandbox_command,
            init_llm_service,
            llm_chat,
            llm_chat_with_system,
            get_llm_config_file,
            save_llm_config_file,
            read_file_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
