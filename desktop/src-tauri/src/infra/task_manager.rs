use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use lazy_static::lazy_static;
use tokio::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};
use super::opencode_api::OpenCodeClient;

const SKILLS_DIR: &str = "../../_skills";
const LOCAL_SERVER_SKILLS_DIR: &str = "../../local-server/.opencode/skills";
const TASKS_DIR: &str = "../../tasks";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisTask {
    pub id: String,
    pub project_name: String,
    pub project_path: String,
    pub status: TaskStatus,
    pub progress: u8,
    pub message: String,
    pub dev_plan: String,
    pub test_plan: String,
    pub created_at: u64,
    pub updated_at: u64,
}

lazy_static! {
    static ref TASK_MANAGER: Mutex<TaskManager> = Mutex::new(TaskManager::new());
}

struct TaskManager {
    tasks: HashMap<String, AnalysisTask>,
}

impl TaskManager {
    fn new() -> Self {
        Self {
            tasks: HashMap::new(),
        }
    }

    fn add_task(&mut self, task: AnalysisTask) {
        self.tasks.insert(task.id.clone(), task);
    }

    fn get_task(&self, id: &str) -> Option<AnalysisTask> {
        self.tasks.get(id).cloned()
    }

    fn update_task(&mut self, id: &str, update: impl FnOnce(&mut AnalysisTask)) {
        if let Some(task) = self.tasks.get_mut(id) {
            update(task);
            task.updated_at = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs();
        }
    }

    fn remove_task(&mut self, id: &str) {
        self.tasks.remove(id);
    }
}

fn get_task_id(project_path: &str) -> String {
    format!("task_{}", project_path.replace("/", "_").replace(":", "_"))
}

async fn read_skill_content_internal(skill_name: &str) -> Result<String, String> {
    let skill_path = Path::new(LOCAL_SERVER_SKILLS_DIR).join(skill_name).join("SKILL.md");
    if !skill_path.exists() {
        let fallback_path = Path::new(SKILLS_DIR).join(skill_name).join("SKILL.md");
        if !fallback_path.exists() {
            return Err(format!("Skill not found: {}", skill_name));
        }
        let content = fs::read_to_string(&fallback_path).await.map_err(|e| format!("Failed to read skill file: {}", e))?;
        return Ok(content);
    }
    let content = fs::read_to_string(&skill_path).await.map_err(|e| format!("Failed to read skill file: {}", e))?;
    Ok(content)
}

async fn save_plan_to_file_internal(content: &str, project_path: &str, file_name: &str) -> Result<(), String> {
    let specs_dir = Path::new(project_path).join("specs");
    if !specs_dir.exists() {
        fs::create_dir_all(&specs_dir).await.map_err(|e| e.to_string())?;
    }
    let file_path = specs_dir.join(file_name);
    fs::write(&file_path, content).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Start analysis task in background
#[tauri::command]
pub async fn start_analysis_task(project_name: String, project_path: String, task_description: String) -> Result<String, String> {
    let task_id = get_task_id(&project_path);

    {
        let mut manager = TASK_MANAGER.lock().unwrap();
        if let Some(task) = manager.get_task(&task_id) {
            if task.status == TaskStatus::Running {
                return Err("Analysis is already running".to_string());
            }
        }
    }

    let skill_content = read_skill_content_internal("specification-planning").await?;

    let task = AnalysisTask {
        id: task_id.clone(),
        project_name,
        project_path: project_path.clone(),
        status: TaskStatus::Pending,
        progress: 0,
        message: "准备开始分析...".to_string(),
        dev_plan: String::new(),
        test_plan: String::new(),
        created_at: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs(),
        updated_at: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs(),
    };

    {
        let mut manager = TASK_MANAGER.lock().unwrap();
        manager.add_task(task);
    }

    let task_id_clone = task_id.clone();
    tokio::spawn(async move {
        run_analysis_background(&task_id_clone, &project_path, &skill_content, &task_description).await;
    });

    Ok(task_id)
}

async fn run_analysis_background(task_id: &str, project_path: &str, skill_content: &str, task_description: &str) {
    let client = OpenCodeClient::new();

    {
        let mut manager = TASK_MANAGER.lock().unwrap();
        manager.update_task(task_id, |task| {
            task.status = TaskStatus::Running;
            task.message = "正在生成开发计划...".to_string();
            task.progress = 10;
        });
    }

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
2. 按照 skill 中定义的步骤生成 develop_plan.md
3. 直接输出生成的 develop_plan.md 内容，不需要解释

请开始执行。"#,
        skill_content,
        task_description
    );

    let dev_plan_result = client.run_prompt(&prompt, "Generate Development Plan").await;

    match dev_plan_result {
        Ok(dev_plan) => {
            {
                let mut manager = TASK_MANAGER.lock().unwrap();
                manager.update_task(task_id, |task| {
                    task.dev_plan = dev_plan.clone();
                    task.progress = 50;
                    task.message = "开发计划生成完成，正在生成测试计划...".to_string();
                });
            }

            if let Err(e) = save_plan_to_file_internal(&dev_plan, project_path, "develop_plan.md").await {
                eprintln!("Failed to save dev plan: {}", e);
            }

            let test_prompt = format!(
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
                dev_plan
            );

            let test_plan_result = client.run_prompt(&test_prompt, "Generate Testing Plan").await;

            match test_plan_result {
                Ok(test_plan) => {
                    {
                        let mut manager = TASK_MANAGER.lock().unwrap();
                        manager.update_task(task_id, |task| {
                            task.test_plan = test_plan.clone();
                            task.status = TaskStatus::Completed;
                            task.progress = 100;
                            task.message = "分析完成！".to_string();
                        });
                    }

                    if let Err(e) = save_plan_to_file_internal(&test_plan, project_path, "testing_plan.md").await {
                        eprintln!("Failed to save test plan: {}", e);
                    }
                }
                Err(e) => {
                    let mut manager = TASK_MANAGER.lock().unwrap();
                    manager.update_task(task_id, |task| {
                        task.status = TaskStatus::Failed;
                        task.message = format!("生成测试计划失败: {}", e);
                    });
                }
            }
        }
        Err(e) => {
            let mut manager = TASK_MANAGER.lock().unwrap();
            manager.update_task(task_id, |task| {
                task.status = TaskStatus::Failed;
                task.message = format!("生成开发计划失败: {}", e);
            });
        }
    }
}

/// Get task status by project path
#[tauri::command]
pub async fn get_task_status(project_path: String) -> Result<Option<AnalysisTask>, String> {
    let task_id = get_task_id(&project_path);
    let manager = TASK_MANAGER.lock().unwrap();
    Ok(manager.get_task(&task_id))
}

/// Get task status by task ID
#[tauri::command]
pub async fn get_task_by_id(task_id: String) -> Result<Option<AnalysisTask>, String> {
    let manager = TASK_MANAGER.lock().unwrap();
    Ok(manager.get_task(&task_id))
}

/// Cancel running task
#[tauri::command]
pub async fn cancel_task(project_path: String) -> Result<bool, String> {
    let task_id = get_task_id(&project_path);
    let mut manager = TASK_MANAGER.lock().unwrap();
    if let Some(task) = manager.get_task(&task_id) {
        if task.status == TaskStatus::Running {
            manager.update_task(&task_id, |task| {
                task.status = TaskStatus::Failed;
                task.message = "用户取消".to_string();
            });
            return Ok(true);
        }
    }
    Ok(false)
}
