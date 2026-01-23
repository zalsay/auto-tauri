//! PRD Parser - Extracts actionable tasks from Product Requirement Documents.
//!
//! Uses OpenCode API to analyze the PRD content and break it down into atomic technical tasks.

use std::fs;
use std::path::Path;
use std::process::Command as StdCommand;

use serde::{Deserialize, Serialize};

use super::opencode_api::OpenCodeClient;

/// Extract tasks from a PRD file (Markdown or Text).
///
/// Reads the file and uses OpenCode API to parse it into a JSON list of tasks.
#[tauri::command]
pub async fn extract_tasks_from_prd(file_path: String) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let truncated_content = if content.len() > 20000 {
        format!("{}... (truncated)", &content[..20000])
    } else {
        content
    };

    let system_prompt = "你是资深产品经理。阅读以下 PRD 内容。将其分解为原子的、可执行的技术任务。仅返回原始 JSON 字符串数组。";

    let full_prompt = format!("{} {}", truncated_content, system_prompt);

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&full_prompt, "Extract PRD Tasks").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    let clean_json = output.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let tasks: Vec<String> = serde_json::from_str(clean_json)
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    Ok(tasks)
}

/// Supplement existing development plan with new requirements from PRD.
#[tauri::command]
pub async fn supplement_plan_from_prd(
    prd_file_path: String,
    project_path: String,
) -> Result<String, String> {
    let prd_content = fs::read_to_string(&prd_file_path)
        .map_err(|e| format!("Failed to read PRD file: {}", e))?;

    let develop_plan_path = Path::new(&project_path)
        .join("specs")
        .join("develop_plan.md");

    let existing_dev_plan = if develop_plan_path.exists() {
        fs::read_to_string(&develop_plan_path)
            .map_err(|e| format!("Failed to read develop_plan.md: {}", e))?
    } else {
        "暂无现有开发计划".to_string()
    };

    let prompt = format!(
        "现有开发计划: {}. 新增PRD: {}. 分析PRD中新增的功能需求，以 [新增功能] 标题追加到现有计划末尾。如果没有新增内容返回 '无新增需求'。",
        existing_dev_plan, prd_content
    );

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&prompt, "Supplement Plan from PRD").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    if output.contains("无新增需求") || output.trim().is_empty() {
        return Ok("无新增需求".to_string());
    }

    let supplements = output.trim().to_string();
    let full_supplemented_plan = format!("{}\n\n[新增功能]\n{}", existing_dev_plan, supplements);

    if let Some(parent) = develop_plan_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(&develop_plan_path, &full_supplemented_plan)
        .map_err(|e| format!("Failed to write supplemented plan: {}", e))?;

    Ok(full_supplemented_plan)
}

/// Supplement existing test plan with new test cases from PRD.
#[tauri::command]
pub async fn supplement_test_plan_from_prd(
    prd_file_path: String,
    project_path: String,
) -> Result<String, String> {
    let prd_content = fs::read_to_string(&prd_file_path)
        .map_err(|e| format!("Failed to read PRD file: {}", e))?;

    let test_plan_path = Path::new(&project_path)
        .join("specs")
        .join("testing_plan.md");

    let existing_test_plan = if test_plan_path.exists() {
        fs::read_to_string(&test_plan_path)
            .map_err(|e| format!("Failed to read testing_plan.md: {}", e))?
    } else {
        "暂无现有测试计划".to_string()
    };

    let prompt = format!(
        "现有测试计划: {}. 新增PRD: {}. 分析新功能需要的测试用例，追加到现有测试计划末尾。如果没有新增测试需求返回 '无新增测试需求'。",
        existing_test_plan, prd_content
    );

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&prompt, "Supplement Test Plan from PRD").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    if output.contains("无新增测试需求") || output.trim().is_empty() {
        return Ok("无新增测试需求".to_string());
    }

    let supplements = output.trim().to_string();
    let full_supplemented_plan = format!("{}\n\n[新增测试]\n{}", existing_test_plan, supplements);

    if let Some(parent) = test_plan_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(&test_plan_path, &full_supplemented_plan)
        .map_err(|e| format!("Failed to write supplemented test plan: {}", e))?;

    Ok(full_supplemented_plan)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevelopmentStep {
    pub id: usize,
    pub title: String,
    pub content: String,
    pub status: StepStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Pending,
    InProgress,
    Completed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevelopmentProgress {
    pub total_steps: usize,
    pub completed_steps: usize,
    pub skipped_steps: usize,
    pub steps: Vec<DevelopmentStep>,
    pub percent: f64,
}

/// Parse Step-by-Step Implementation section and extract individual steps.
#[tauri::command]
pub async fn parse_development_steps(project_path: String) -> Result<DevelopmentProgress, String> {
    let dev_plan_path = Path::new(&project_path)
        .join("specs")
        .join("develop_plan.md");

    if !dev_plan_path.exists() {
        return Err("develop_plan.md not found".to_string());
    }

    let content = fs::read_to_string(&dev_plan_path)
        .map_err(|e| format!("Failed to read develop_plan.md: {}", e))?;

    let steps_json_path = Path::new(&project_path)
        .join("specs")
        .join("dev_steps.json");

    let existing_steps: Vec<DevelopmentStep> = if steps_json_path.exists() {
        let json_content = fs::read_to_string(&steps_json_path)
            .map_err(|e| format!("Failed to read steps JSON: {}", e))?;
        serde_json::from_str(&json_content)
            .map_err(|e| format!("Failed to parse steps JSON: {}", e))?
    } else {
        Vec::new()
    };

    let step_pattern = regex::Regex::new(r"(?s)###\s+Step\s+(\d+)[:\s]*([^\n]*)\n(.*?)(?=###\s+Step\s+\d+|$)").unwrap();

    let mut steps = Vec::new();
    let mut step_id = 1;

    for cap in step_pattern.captures_iter(&content) {
        let existing_step = existing_steps.iter().find(|s| s.id == step_id);

        let status = match existing_step {
            Some(s) => s.status.clone(),
            None => StepStatus::Pending,
        };

        let title = cap.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_else(|| format!("Step {}", step_id));
        let step_content = cap.get(3).map(|m| m.as_str().trim().to_string()).unwrap_or_default();

        steps.push(DevelopmentStep {
            id: step_id,
            title,
            content: step_content,
            status,
        });

        step_id += 1;
    }

    let completed_steps = steps.iter().filter(|s| matches!(s.status, StepStatus::Completed)).count();
    let skipped_steps = steps.iter().filter(|s| matches!(s.status, StepStatus::Skipped)).count();
    let total_steps = steps.len();
    let percent = if total_steps > 0 { (completed_steps as f64 / total_steps as f64) * 100.0 } else { 0.0 };

    let progress = DevelopmentProgress {
        total_steps,
        completed_steps,
        skipped_steps,
        steps,
        percent,
    };

    let progress_json = serde_json::to_string(&progress.steps)
        .map_err(|e| format!("Failed to serialize steps: {}", e))?;

    fs::write(&steps_json_path, &progress_json)
        .map_err(|e| format!("Failed to write steps JSON: {}", e))?;

    Ok(progress)
}

/// Mark a development step as completed.
#[tauri::command]
pub async fn mark_step_completed(project_path: String, step_id: usize) -> Result<DevelopmentProgress, String> {
    update_step_status(project_path, step_id, StepStatus::Completed).await
}

/// Mark a development step as skipped.
#[tauri::command]
pub async fn mark_step_skipped(project_path: String, step_id: usize) -> Result<DevelopmentProgress, String> {
    update_step_status(project_path, step_id, StepStatus::Skipped).await
}

/// Mark all steps as pending.
#[tauri::command]
pub async fn reset_steps(project_path: String) -> Result<DevelopmentProgress, String> {
    let steps_json_path = Path::new(&project_path)
        .join("specs")
        .join("dev_steps.json");

    if !steps_json_path.exists() {
        return parse_development_steps(project_path).await;
    }

    let mut steps: Vec<DevelopmentStep> = {
        let json_content = fs::read_to_string(&steps_json_path)
            .map_err(|e| format!("Failed to read steps JSON: {}", e))?;
        serde_json::from_str(&json_content)
            .map_err(|e| format!("Failed to parse steps JSON: {}", e))?
    };

    for step in &mut steps {
        step.status = StepStatus::Pending;
    }

    let progress_json = serde_json::to_string(&steps)
        .map_err(|e| format!("Failed to serialize steps: {}", e))?;

    fs::write(&steps_json_path, &progress_json)
        .map_err(|e| format!("Failed to write steps JSON: {}", e))?;

    parse_development_steps(project_path).await
}

async fn update_step_status(project_path: String, step_id: usize, status: StepStatus) -> Result<DevelopmentProgress, String> {
    let steps_json_path = Path::new(&project_path)
        .join("specs")
        .join("dev_steps.json");

    let mut steps: Vec<DevelopmentStep> = if steps_json_path.exists() {
        let json_content = fs::read_to_string(&steps_json_path)
            .map_err(|e| format!("Failed to read steps JSON: {}", e))?;
        serde_json::from_str(&json_content)
            .map_err(|e| format!("Failed to parse steps JSON: {}", e))?
    } else {
        return Err("Steps not found. Please run parse_development_steps first.".to_string());
    };

    if let Some(step) = steps.iter_mut().find(|s| s.id == step_id) {
        step.status = status;
    }

    let progress_json = serde_json::to_string(&steps)
        .map_err(|e| format!("Failed to serialize steps: {}", e))?;

    fs::write(&steps_json_path, &progress_json)
        .map_err(|e| format!("Failed to write steps JSON: {}", e))?;

    parse_development_steps(project_path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_extract_tasks_from_prd() {
        let temp_file = "/tmp/test_prd.md";
        let prd_content = r#"
# 用户管理系统 PRD

## 功能需求
1. 用户注册
2. 用户登录
3. 用户信息修改
4. 管理员功能
"#;

        std::fs::write(temp_file, prd_content).unwrap();

        let result = extract_tasks_from_prd(temp_file.to_string()).await;

        std::fs::remove_file(temp_file).ok();

        assert!(result.is_ok());
        let tasks = result.unwrap();
        assert!(!tasks.is_empty());
    }
}
