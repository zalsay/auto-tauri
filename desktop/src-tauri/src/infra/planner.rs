use tokio::fs;
use std::path::Path;
use super::opencode_api::OpenCodeClient;

const SKILLS_DIR: &str = "../../_skills";

const LOCAL_SERVER_SKILLS_DIR: &str = "../../local-server/.opencode/skills";

/// Internal helper to read skill content
async fn read_skill_content_internal(skill_name: &str) -> Result<String, String> {
    let skill_path = Path::new(LOCAL_SERVER_SKILLS_DIR).join(skill_name).join("SKILL.md");

    if !skill_path.exists() {
        let fallback_path = Path::new(SKILLS_DIR).join(skill_name).join("SKILL.md");
        if !fallback_path.exists() {
            return Err(format!("Skill not found: {}", skill_name));
        }
        let content = fs::read_to_string(&fallback_path)
            .await
            .map_err(|e| format!("Failed to read skill file: {}", e))?;
        return Ok(content);
    }

    let content = fs::read_to_string(&skill_path)
        .await
        .map_err(|e| format!("Failed to read skill file: {}", e))?;

    Ok(content)
}

/// Tauri command to read skill content from frontend
#[tauri::command]
pub async fn read_skill_content(skill_name: String) -> Result<String, String> {
    read_skill_content_internal(&skill_name).await
}

/// Internal helper to save plan to file
async fn save_plan_to_file_internal(content: &str, project_path: &str, file_name: &str) -> Result<(), String> {
    let specs_dir = Path::new(project_path).join("specs");
    if !specs_dir.exists() {
        fs::create_dir_all(&specs_dir).await.map_err(|e| e.to_string())?;
    }
    let file_path = specs_dir.join(file_name);
    fs::write(&file_path, content).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Tauri command to save plan file from frontend
#[tauri::command]
pub async fn save_plan_file(content: String, project_path: String, file_name: String) -> Result<(), String> {
    save_plan_to_file_internal(&content, &project_path, &file_name).await
}

#[tauri::command]
pub async fn generate_dev_plan(task_description: String, project_path: String) -> Result<String, String> {
    let skill_content = read_skill_content("specification-planning".to_string()).await?;

    let prompt = format!(
        r#"请使用 specification-planning skill 来完成开发计划生成任务。

## Skill 名称
specification-planning

## Skill 定义
{}

## 用户需求
{}

## 任务要求
1. 先阅读并理解 skill 定义
2. 进行复杂度分析
3. 根据复杂度选择使用 Ralph 或 OpenCode 执行
4. 按照 skill 中定义的步骤生成 develop_plan.md
5. 直接输出生成的 develop_plan.md 内容，不需要解释

请开始执行。"#,
        skill_content,
        task_description
    );

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&prompt, "Generate Development Plan").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    save_plan_to_file_internal(&output, &project_path, "develop_plan.md").await?;

    Ok(output)
}

#[tauri::command]
pub async fn generate_test_plan(dev_plan_content: String, project_path: String) -> Result<String, String> {
    let prompt = format!(
        r#"请基于已生成的 develop_plan.md 生成 testing_plan.md。

## 开发计划内容
{}

## 任务要求
1. 以 QA 负责人的角色分析开发计划
2. 生成 testing_plan.md，包含：
   - Unit Tests: 需要测试的函数和 Mock 数据
   - Integration Tests: 模块协作验证方法
   - Manual Verification: 命令行检查步骤
   - Success Criteria: 完成标准清单
3. 直接输出生成的 testing_plan.md 内容，不需要解释

请开始执行。"#,
        dev_plan_content
    );

    let client = OpenCodeClient::new();
    let output = client.run_prompt(&prompt, "Generate Testing Plan").await
        .map_err(|e| format!("OpenCode API failed: {}", e))?;

    save_plan_to_file_internal(&output, &project_path, "testing_plan.md").await?;

    Ok(output)
}
