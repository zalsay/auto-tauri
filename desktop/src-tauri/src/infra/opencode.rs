//! OpenCode Integration - Lightweight parallel task executor.
//!
//! Manages rapid, parallel tasks (refactors, comments, fixes) using OpenCode CLI.
//! Features:
//! - Worker pool with semaphore-based concurrency control
//! - File-level locking to prevent concurrent modifications
//! - Streaming output via Tauri events

use std::collections::HashSet;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};

use super::env::fix_path_env;

/// Maximum concurrent OpenCode tasks
const MAX_CONCURRENT_TASKS: usize = 3;

/// Global state for OpenCode runner
pub struct OpenCodeRunner {
    /// Semaphore to limit concurrent tasks
    semaphore: Arc<Semaphore>,
    /// Set of currently locked files
    locked_files: Arc<Mutex<HashSet<String>>>,
    /// Active task count
    active_tasks: Arc<Mutex<usize>>,
}

impl Default for OpenCodeRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenCodeRunner {
    pub fn new() -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_TASKS)),
            locked_files: Arc::new(Mutex::new(HashSet::new())),
            active_tasks: Arc::new(Mutex::new(0)),
        }
    }

    /// Try to acquire a lock on a file for editing
    pub async fn try_lock_file(&self, file_path: &str) -> bool {
        let mut locked = self.locked_files.lock().await;
        if locked.contains(file_path) {
            false
        } else {
            locked.insert(file_path.to_string());
            true
        }
    }

    /// Release the lock on a file
    pub async fn unlock_file(&self, file_path: &str) {
        let mut locked = self.locked_files.lock().await;
        locked.remove(file_path);
    }

    /// Get current status
    pub async fn get_status(&self) -> OpenCodeStatus {
        let active = *self.active_tasks.lock().await;
        let locked_files: Vec<String> = self.locked_files.lock().await.iter().cloned().collect();
        OpenCodeStatus {
            active_tasks: active,
            max_concurrent: MAX_CONCURRENT_TASKS,
            locked_files,
        }
    }
}

/// Status of the OpenCode runner
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeStatus {
    pub active_tasks: usize,
    pub max_concurrent: usize,
    pub locked_files: Vec<String>,
}

/// Result of an OpenCode task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeTaskResult {
    pub success: bool,
    pub file_path: String,
    pub output: String,
    pub error: Option<String>,
}

/// Request to spawn an OpenCode task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeTaskRequest {
    pub file_path: String,
    pub prompt: String,
    pub working_dir: String,
}

// Global runner instance
lazy_static::lazy_static! {
    pub static ref OPENCODE_RUNNER: OpenCodeRunner = OpenCodeRunner::new();
}

/// Spawns an OpenCode task with file isolation.
///
/// Returns immediately with task ID. Use events to track progress.
pub async fn spawn_opencode_task(
    request: OpenCodeTaskRequest,
) -> Result<OpenCodeTaskResult, String> {
    let runner = &*OPENCODE_RUNNER;

    // Check file lock
    if !runner.try_lock_file(&request.file_path).await {
        return Err(format!(
            "File is already being edited: {}",
            request.file_path
        ));
    }

    // Acquire semaphore permit
    let permit = runner
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| format!("Failed to acquire worker permit: {}", e))?;

    // Increment active task count
    {
        let mut active = runner.active_tasks.lock().await;
        *active += 1;
    }

    // Build the OpenCode command
    let fixed_path = fix_path_env();
    let prompt = format!(
        "Context: {}. Task: {}. ONLY modify this file.",
        request.file_path, request.prompt
    );

    let mut cmd = Command::new("opencode");
    cmd.args(["--prompt", &prompt, "--non-interactive", "--auto-apply"])
        .current_dir(&request.working_dir)
        .env("PATH", fixed_path)
        .env("FORCE_COLOR", "1")
        .env("CI", "true")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd.spawn().map_err(|e| {
        // Release lock on spawn failure
        let file_path = request.file_path.clone();
        tokio::spawn(async move {
            OPENCODE_RUNNER.unlock_file(&file_path).await;
        });
        format!("Failed to spawn opencode: {}", e)
    })?;

    // Capture stdout
    let stdout = child.stdout.take();
    let mut output_lines = Vec::new();

    if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            output_lines.push(line);
        }
    }

    // Wait for process to complete
    let status = child.wait().await.map_err(|e| format!("Process wait failed: {}", e))?;

    // Cleanup
    runner.unlock_file(&request.file_path).await;
    {
        let mut active = runner.active_tasks.lock().await;
        *active = active.saturating_sub(1);
    }
    drop(permit);

    let output = output_lines.join("\n");

    if status.success() {
        Ok(OpenCodeTaskResult {
            success: true,
            file_path: request.file_path,
            output,
            error: None,
        })
    } else {
        Ok(OpenCodeTaskResult {
            success: false,
            file_path: request.file_path,
            output,
            error: Some(format!("OpenCode exited with status: {}", status)),
        })
    }
}

/// Get current OpenCode runner status
pub async fn get_opencode_status() -> OpenCodeStatus {
    OPENCODE_RUNNER.get_status().await
}


// ==================== Configuration Management ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfigProvider {
    // Allows flexible JSON structure for providers
    #[serde(flatten)]
    pub providers: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfig {
    #[serde(default)]
    pub provider: Option<serde_json::Value>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(rename = "small_model")]
    pub small_model: Option<String>,
    #[serde(rename = "expert_model")]
    pub expert_model: Option<serde_json::Value>,
}

/// Update ~/.opencode/config.json with new settings
#[tauri::command]
pub async fn update_opencode_config(config_json: String) -> Result<(), String> {
    use std::path::PathBuf;
    use tokio::fs;
    
    // Parse validation
    let _: OpenCodeConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid JSON config: {}", e))?;

    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_dir = PathBuf::from(&home).join(".opencode");
    
    println!("[update_opencode_config] Config path: {}", config_dir.display());
    
    // Ensure dir exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).await
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        println!("[update_opencode_config] Created config directory");
    }

    let config_path = config_dir.join("config.json");
    
    // Write config
    fs::write(&config_path, &config_json).await
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    println!("[update_opencode_config] Config saved successfully. Size: {} bytes", config_json.len());
    
    // Verify by reading back
    let verify = fs::read_to_string(&config_path).await
        .map_err(|e| format!("Failed to verify config: {}", e))?;
    println!("[update_opencode_config] Verified config: {} bytes", verify.len());

    Ok(())
}

/// Read ~/.opencode/config.json
#[tauri::command]
pub async fn get_opencode_config() -> Result<OpenCodeConfig, String> {
    use std::path::PathBuf;

    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = PathBuf::from(home).join(".opencode").join("config.json");

    if !config_path.exists() {
        // Return default empty config
        return Ok(OpenCodeConfig {
            provider: None,
            model: None,
            small_model: None,
            expert_model: None,
        });
    }

    let content = tokio::fs::read_to_string(&config_path).await
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let config: OpenCodeConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON config: {}", e))?;

    Ok(config)
}

/// Coding Master Configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingMasterConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub small_model: String,
    pub expert_provider: String,
    pub expert_api_key: String,
    pub expert_model: String,
}

/// Get Coding Master configuration for Agent use
#[tauri::command]
pub async fn get_coding_master_config() -> Result<CodingMasterConfig, String> {
    use std::path::PathBuf;
    use tokio::fs;

    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = PathBuf::from(&home).join(".opencode").join("config.json");

    println!("[get_coding_master_config] Reading from: {}", config_path.display());

    if !config_path.exists() {
        println!("[get_coding_master_config] Config file does not exist, returning defaults");
        // Return default config if no config file exists
        return Ok(CodingMasterConfig {
            provider: "anthropic".to_string(),
            api_key: "".to_string(),
            model: "anthropic/claude-3-5-sonnet-20241022".to_string(),
            small_model: "anthropic/claude-3-haiku-20240307".to_string(),
            expert_provider: "anthropic".to_string(),
            expert_api_key: "".to_string(),
            expert_model: "anthropic/claude-sonnet-4-20250514".to_string(),
        });
    }

    let content = fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read config: {}", e))?;

    println!("[get_coding_master_config] Read {} bytes", content.len());

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid config: {}", e))?;

    // Extract provider section
    let provider = config["provider"].clone();

    // Extract main model settings
    let main_model = config["model"].as_str().unwrap_or("anthropic/claude-3-5-sonnet-20241022");
    let small_model = config["small_model"].as_str().unwrap_or("anthropic/claude-3-haiku-20240307");

    // Extract expert model settings
    let expert_model_config = config.get("expert_model").and_then(|e| e.as_object());
    let expert_provider = expert_model_config
        .and_then(|e| e.get("provider"))
        .and_then(|p| p.as_str())
        .unwrap_or("anthropic");
    let expert_model = expert_model_config
        .and_then(|e| e.get("model"))
        .and_then(|m| m.as_str())
        .unwrap_or("anthropic/claude-sonnet-4-20250514");

    // Extract API keys based on provider type
    let get_api_key = |provider_name: &str| -> String {
        if let Some(p) = provider.as_object() {
            if let Some(provider_config) = p.get(provider_name) {
                return provider_config
                    .as_object()
                    .and_then(|c| c.get("api_key"))
                    .and_then(|k| k.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();
            }
        }
        if let Some(arr) = provider.as_array() {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if let Some(name) = obj.get("name").and_then(|n| n.as_str()) {
                        if name == provider_name {
                            return obj
                                .get("api_key")
                                .and_then(|k| k.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_default();
                        }
                    }
                }
            }
        }
        "".to_string()
    };

    Ok(CodingMasterConfig {
        provider: "anthropic".to_string(),
        api_key: get_api_key("anthropic"),
        model: main_model.to_string(),
        small_model: small_model.to_string(),
        expert_provider: expert_provider.to_string(),
        expert_api_key: get_api_key(expert_provider),
        expert_model: expert_model.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_file_locking() {
        let runner = OpenCodeRunner::new();

        // First lock should succeed
        assert!(runner.try_lock_file("/path/to/file.rs").await);

        // Second lock on same file should fail
        assert!(!runner.try_lock_file("/path/to/file.rs").await);

        // Different file should succeed
        assert!(runner.try_lock_file("/path/to/other.rs").await);

        // Unlock and retry
        runner.unlock_file("/path/to/file.rs").await;
        assert!(runner.try_lock_file("/path/to/file.rs").await);
    }

    #[tokio::test]
    async fn test_status() {
        let runner = OpenCodeRunner::new();
        let status = runner.get_status().await;

        assert_eq!(status.active_tasks, 0);
        assert_eq!(status.max_concurrent, MAX_CONCURRENT_TASKS);
        assert!(status.locked_files.is_empty());
    }
}
