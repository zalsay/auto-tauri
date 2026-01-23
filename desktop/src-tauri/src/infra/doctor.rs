//! System Doctor - checks for required CLI tools and installation helpers.
//!
//! Provides commands to check system health (tool availability) and
//! launch terminal-based installers.

use serde::{Deserialize, Serialize};
use std::process::Command;

use super::env::fix_path_env;

/// Represents the installation status of required tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHealth {
    pub git_installed: bool,
    pub git_path: Option<String>,
    pub node_installed: bool,
    pub node_path: Option<String>,
    pub ralph_installed: bool,
    pub ralph_path: Option<String>,
    pub opencode_installed: bool,
    pub opencode_path: Option<String>,
}

/// Checks if all required tools are available on the system.
///
/// Uses the fixed PATH to locate tools that might not be in the
/// default GUI environment path.
#[tauri::command]
pub fn check_system_health() -> SystemHealth {
    let fixed_path = fix_path_env();

    SystemHealth {
        git_installed: check_tool_exists("git", &fixed_path).is_some(),
        git_path: check_tool_exists("git", &fixed_path),
        node_installed: check_tool_exists("node", &fixed_path).is_some(),
        node_path: check_tool_exists("node", &fixed_path),
        ralph_installed: check_tool_exists("ralph", &fixed_path).is_some(),
        ralph_path: check_tool_exists("ralph", &fixed_path),
        opencode_installed: check_tool_exists("opencode", &fixed_path).is_some(),
        opencode_path: check_tool_exists("opencode", &fixed_path),
    }
}

/// Checks if a tool exists in PATH and returns its location.
fn check_tool_exists(tool_name: &str, path_env: &str) -> Option<String> {
    let which_cmd = if cfg!(windows) { "where" } else { "which" };

    let output = Command::new(which_cmd)
        .arg(tool_name)
        .env("PATH", path_env)
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()?
            .trim()
            .to_string();
        Some(path)
    } else {
        None
    }
}

/// Opens the system terminal and runs an installation script for the specified tool.
///
/// This spawns a new terminal window to avoid permission issues when
/// running install scripts inside the Tauri app.
#[tauri::command]
pub fn install_tool_in_terminal(tool_name: String) -> Result<String, String> {
    let install_command = match tool_name.as_str() {
        "ralph" => {
            // Ralph installation - using git clone and install script
            "echo 'Installing Ralph...' && \
             git clone https://github.com/ralphcli/ralph.git ~/.ralph-install && \
             cd ~/.ralph-install && ./install.sh && \
             rm -rf ~/.ralph-install && \
             echo 'Ralph installed! Press Enter to close.' && read"
        }
        "opencode" => {
            // OpenCode installation - using curl
            "echo 'Installing OpenCode...' && \
             curl -fsSL https://opencode.dev/install.sh | bash && \
             echo 'OpenCode installed! Press Enter to close.' && read"
        }
        "node" => {
            // Node.js via nvm
            "echo 'Installing Node.js via nvm...' && \
             curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
             source ~/.nvm/nvm.sh && nvm install --lts && \
             echo 'Node.js installed! Press Enter to close.' && read"
        }
        _ => return Err(format!("Unknown tool: {}", tool_name)),
    };

    spawn_terminal_with_command(install_command)
}

/// Spawns the system's default terminal with a command.
fn spawn_terminal_with_command(command: &str) -> Result<String, String> {
    let result = if cfg!(target_os = "macos") {
        // macOS: Use osascript to open Terminal.app
        Command::new("osascript")
            .arg("-e")
            .arg(format!(
                r#"tell application "Terminal"
                    activate
                    do script "{}"
                end tell"#,
                command.replace("\"", "\\\"")
            ))
            .spawn()
    } else if cfg!(target_os = "linux") {
        // Linux: Try common terminal emulators
        let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];

        let mut last_err = None;
        let mut success = false;

        for term in terminals {
            let spawn_result = match term {
                "gnome-terminal" => Command::new(term).arg("--").arg("bash").arg("-c").arg(command).spawn(),
                "konsole" => Command::new(term).arg("-e").arg("bash").arg("-c").arg(command).spawn(),
                "xfce4-terminal" => Command::new(term).arg("-e").arg(format!("bash -c '{}'", command)).spawn(),
                "xterm" => Command::new(term).arg("-e").arg("bash").arg("-c").arg(command).spawn(),
                _ => continue,
            };

            match spawn_result {
                Ok(_) => {
                    success = true;
                    break;
                }
                Err(e) => last_err = Some(e),
            }
        }

        if success {
            Ok(std::process::Child::from(std::process::Command::new("true").spawn().unwrap()))
        } else {
            Err(last_err.unwrap_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No terminal found")))
        }
    } else if cfg!(windows) {
        // Windows: Use cmd /c start
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", command])
            .spawn()
    } else {
        return Err("Unsupported platform".to_string());
    };

    result
        .map(|_| format!("Terminal opened for {} installation", command))
        .map_err(|e| format!("Failed to open terminal: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_system_health() {
        let health = check_system_health();
        // git should typically be installed on dev machines
        // This test just ensures the function runs without panic
        println!("System health: {:?}", health);
    }
}
