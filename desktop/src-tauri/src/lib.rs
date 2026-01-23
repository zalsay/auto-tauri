// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

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

use infra::planner::{generate_dev_plan, generate_test_plan, read_skill_content, save_plan_file};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
            supplement_plan_from_prd,
            supplement_test_plan_from_prd,
            parse_development_steps,
            mark_step_completed,
            mark_step_skipped,
            reset_steps
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
