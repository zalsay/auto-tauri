//! AI Router - Smart task dispatcher that routes tasks to the appropriate agent.
//!
//! Uses OpenCode API to analyze task complexity and determines whether to use:
//! - Ralph: For complex, multi-file, or architectural tasks
//! - OpenCode: For simple, single-file, or specific fixes

use serde::{Deserialize, Serialize};

use super::opencode_api::OpenCodeClient;
use super::ralph::sync_ralph_plan;
use super::opencode::{spawn_opencode_task, OpenCodeTaskRequest};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Ralph,
    OpenCode,
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentType::Ralph => write!(f, "Ralph"),
            AgentType::OpenCode => write!(f, "OpenCode"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchResult {
    pub agent: AgentType,
    pub message: String,
    pub success: bool,
}

pub async fn classify_task(task_description: &str) -> Result<AgentType, String> {
    let system_prompt = r#"你是技术负责人。分析以下编码任务。
如果需要创建新文件、修改架构或跨文件规划，回复 'RALPH'。
如果是简单的修复、拼写错误、注释或单个函数重构，回复 'OPENCODE'。
仅回复 'RALPH' 或 'OPENCODE'。"#;

    let full_prompt = format!("任务描述: {}. {}", task_description, system_prompt);

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&full_prompt, "Task Classification").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    let output_upper = output.to_uppercase();

    if output_upper.contains("RALPH") {
        Ok(AgentType::Ralph)
    } else if output_upper.contains("OPENCODE") {
        Ok(AgentType::OpenCode)
    } else {
        Ok(AgentType::OpenCode)
    }
}

#[tauri::command]
pub async fn smart_dispatch_task(
    project_path: String,
    task_description: String,
    file_path: Option<String>,
) -> Result<DispatchResult, String> {
    let agent = classify_task(&task_description).await?;

    match agent {
        AgentType::Ralph => {
            let tasks = vec![task_description.clone()];
            sync_ralph_plan(project_path, tasks)?;

            Ok(DispatchResult {
                agent: AgentType::Ralph,
                message: format!("任务复杂，已添加到 Ralph 计划: {}", task_description),
                success: true,
            })
        }
        AgentType::OpenCode => {
            let file = file_path.unwrap_or_else(|| ".".to_string());
            let request = OpenCodeTaskRequest {
                file_path: file.clone(),
                prompt: task_description.clone(),
                working_dir: ".".to_string(),
            };

            let result = spawn_opencode_task(request).await?;

            Ok(DispatchResult {
                agent: AgentType::OpenCode,
                message: if result.success {
                    format!("快速修复完成: {}", file)
                } else {
                    format!("OpenCode 任务失败: {}", result.error.unwrap_or_default())
                },
                success: result.success,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_type_display() {
        assert_eq!(AgentType::Ralph.to_string(), "Ralph");
        assert_eq!(AgentType::OpenCode.to_string(), "OpenCode");
    }
}
