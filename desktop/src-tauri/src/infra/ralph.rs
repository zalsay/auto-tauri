//! Ralph Integration - Manage complex architectural coding sessions.
//!
//! Provides:
//! - Plan synchronization to `.ralph/@fix_plan.md`
//! - Progress monitoring by parsing plan and logs
//! - Terminal launcher for manual Ralph execution

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

/// Ralph progress status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphProgress {
    pub total: usize,
    pub completed: usize,
    pub percent: f32,
    pub last_log: String,
    pub is_active: bool,
}

/// Check if Ralph is currently active in the given project.
///
/// Checks for:
/// 1. Lock file at `.ralph/ralph.lock`
/// 2. Recent log file modification (within 10 seconds)
#[tauri::command]
pub fn is_ralph_active(project_path: String) -> bool {
    let ralph_dir = Path::new(&project_path).join(".ralph");
    
    // Check for lock file
    let lock_path = ralph_dir.join("ralph.lock");
    if lock_path.exists() {
        return true;
    }
    
    // Check log file modification time
    let log_path = ralph_dir.join("logs").join("ralph.log");
    if log_path.exists() {
        if let Ok(metadata) = fs::metadata(&log_path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = std::time::SystemTime::now().duration_since(modified) {
                    if duration.as_secs() < 10 {
                        return true;
                    }
                }
            }
        }
    }
    
    false
}

/// Synchronize a task plan to Ralph's plan file.
///
/// Creates `.ralph/@fix_plan.md` with the given tasks formatted as markdown checkboxes.
#[tauri::command]
pub fn sync_ralph_plan(project_path: String, tasks: Vec<String>) -> Result<String, String> {
    let ralph_dir = Path::new(&project_path).join(".ralph");
    
    // Create .ralph directory if it doesn't exist
    if !ralph_dir.exists() {
        fs::create_dir_all(&ralph_dir)
            .map_err(|e| format!("Failed to create .ralph directory: {}", e))?;
    }

    // Format tasks as markdown checkboxes
    let content = tasks
        .iter()
        .map(|task| format!("- [ ] {}", task))
        .collect::<Vec<_>>()
        .join("\n");

    // Add header
    let full_content = format!("# Fix Plan\n\n{}\n", content);

    // Write to plan file
    let plan_path = ralph_dir.join("@fix_plan.md");
    fs::write(&plan_path, &full_content)
        .map_err(|e| format!("Failed to write plan file: {}", e))?;

    Ok(plan_path.to_string_lossy().to_string())
}

/// Get Ralph progress by parsing the plan file and reading logs.
#[tauri::command]
pub fn get_ralph_progress(project_path: String) -> Result<RalphProgress, String> {
    let ralph_dir = Path::new(&project_path).join(".ralph");
    let plan_path = ralph_dir.join("@fix_plan.md");
    let log_path = ralph_dir.join("logs").join("ralph.log");

    // Parse plan file
    let (total, completed) = if plan_path.exists() {
        let content = fs::read_to_string(&plan_path)
            .map_err(|e| format!("Failed to read plan file: {}", e))?;
        
        let mut total = 0;
        let mut completed = 0;
        
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("- [ ]") {
                total += 1;
            } else if trimmed.starts_with("- [x]") || trimmed.starts_with("- [X]") {
                total += 1;
                completed += 1;
            }
        }
        
        (total, completed)
    } else {
        (0, 0)
    };

    // Calculate percentage
    let percent = if total > 0 {
        (completed as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    // Read last log entry (last 500 bytes)
    let last_log = if log_path.exists() {
        read_tail(&log_path, 500).unwrap_or_else(|_| "Waiting for logs...".to_string())
    } else {
        "No logs yet...".to_string()
    };

    // Check if Ralph is active (simple heuristic: log file modified recently)
    let is_active = if log_path.exists() {
        if let Ok(metadata) = fs::metadata(&log_path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = std::time::SystemTime::now().duration_since(modified) {
                    duration.as_secs() < 10 // Active if log modified in last 10 seconds
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    Ok(RalphProgress {
        total,
        completed,
        percent,
        last_log,
        is_active,
    })
}

/// Read the last N bytes of a file and return the last non-empty line.
fn read_tail(path: &Path, bytes: u64) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let file_size = file.metadata()?.len();
    
    let start = if file_size > bytes {
        file_size - bytes
    } else {
        0
    };
    
    file.seek(SeekFrom::Start(start))?;
    
    let mut buffer = String::new();
    file.read_to_string(&mut buffer)?;
    
    // Get last non-empty line
    let last_line = buffer
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .to_string();
    
    Ok(last_line)
}

/// Open system terminal at the specified path.
#[tauri::command]
pub fn open_terminal_at(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", path.to_str().unwrap_or(".")])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", &format!("cd /d {}", path.display())])
            .spawn()
            .map_err(|e| format!("Failed to open CMD: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators
        let terminals = ["gnome-terminal", "konsole", "xterm", "x-terminal-emulator"];
        let mut opened = false;
        
        for terminal in terminals {
            let result = Command::new(terminal)
                .current_dir(path)
                .spawn();
            
            if result.is_ok() {
                opened = true;
                break;
            }
        }
        
        if !opened {
            return Err("No supported terminal emulator found".to_string());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_sync_ralph_plan() {
        let temp_dir = env::temp_dir().join("ralph_test");
        let _ = fs::remove_dir_all(&temp_dir);
        
        let tasks = vec![
            "Refactor authentication module".to_string(),
            "Add unit tests".to_string(),
            "Update documentation".to_string(),
        ];

        let result = sync_ralph_plan(temp_dir.to_string_lossy().to_string(), tasks);
        assert!(result.is_ok());

        let plan_path = temp_dir.join(".ralph").join("@fix_plan.md");
        assert!(plan_path.exists());

        let content = fs::read_to_string(&plan_path).unwrap();
        assert!(content.contains("- [ ] Refactor authentication module"));
        assert!(content.contains("- [ ] Add unit tests"));
        assert!(content.contains("- [ ] Update documentation"));

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_get_ralph_progress_empty() {
        let temp_dir = env::temp_dir().join("ralph_test_empty");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let result = get_ralph_progress(temp_dir.to_string_lossy().to_string());
        assert!(result.is_ok());
        
        let progress = result.unwrap();
        assert_eq!(progress.total, 0);
        assert_eq!(progress.completed, 0);
        assert_eq!(progress.percent, 0.0);

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_get_ralph_progress_with_plan() {
        let temp_dir = env::temp_dir().join("ralph_test_plan");
        let _ = fs::remove_dir_all(&temp_dir);
        
        let ralph_dir = temp_dir.join(".ralph");
        fs::create_dir_all(&ralph_dir).unwrap();

        let plan_content = "# Fix Plan\n\n- [ ] Task 1\n- [x] Task 2\n- [ ] Task 3\n- [x] Task 4\n";
        fs::write(ralph_dir.join("@fix_plan.md"), plan_content).unwrap();

        let result = get_ralph_progress(temp_dir.to_string_lossy().to_string());
        assert!(result.is_ok());
        
        let progress = result.unwrap();
        assert_eq!(progress.total, 4);
        assert_eq!(progress.completed, 2);
        assert_eq!(progress.percent, 50.0);

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
