//! Unified Process Runner - spawns CLI agents with correct environment.
//!
//! Provides utilities for spawning external processes with the fixed PATH
//! and appropriate environment variables for AI coding tools.

use std::process::{Child, Command, Stdio};
use std::path::Path;

use super::env::fix_path_env;

/// Configuration for spawning an agent process.
#[derive(Debug, Clone)]
pub struct AgentProcessConfig {
    /// The command/binary to run
    pub command: String,
    /// Command arguments
    pub args: Vec<String>,
    /// Working directory for the process
    pub working_dir: String,
    /// Whether to enable colored output
    pub force_color: bool,
    /// Whether to run in CI mode (non-interactive)
    pub ci_mode: bool,
}

impl Default for AgentProcessConfig {
    fn default() -> Self {
        Self {
            command: String::new(),
            args: Vec::new(),
            working_dir: String::from("."),
            force_color: true,
            ci_mode: true,
        }
    }
}

/// Spawns an agent process with the fixed environment.
///
/// This function configures the process with:
/// - Fixed PATH (includes Homebrew, nvm, cargo, etc.)
/// - FORCE_COLOR=1 for ANSI color support in logs
/// - CI=true to prevent interactive prompts
/// - Proper working directory for project context
///
/// Returns the spawned Child process for monitoring.
pub fn spawn_agent_process(config: AgentProcessConfig) -> Result<Child, String> {
    let fixed_path = fix_path_env();

    if !Path::new(&config.working_dir).exists() {
        return Err(format!("Working directory does not exist: {}", config.working_dir));
    }

    let mut cmd = Command::new(&config.command);

    cmd.args(&config.args)
        .current_dir(&config.working_dir)
        .env("PATH", fixed_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if config.force_color {
        cmd.env("FORCE_COLOR", "1");
        cmd.env("TERM", "xterm-256color");
    }

    if config.ci_mode {
        cmd.env("CI", "true");
        cmd.env("NONINTERACTIVE", "1");
    }

    cmd.spawn().map_err(|e| format!("Failed to spawn process '{}': {}", config.command, e))
}

/// Spawns an agent process and returns stdout/stderr as strings.
///
/// This is a convenience function for quick one-shot commands.
pub fn run_agent_command(command: &str, args: &[&str], working_dir: &str) -> Result<(String, String), String> {
    let config = AgentProcessConfig {
        command: command.to_string(),
        args: args.iter().map(|s| s.to_string()).collect(),
        working_dir: working_dir.to_string(),
        ..Default::default()
    };

    let child = spawn_agent_process(config)?;
    let output = child.wait_with_output().map_err(|e| format!("Failed to wait for process: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok((stdout, stderr))
}

/// Creates a Command builder pre-configured with the fixed environment.
///
/// Use this when you need more control over the process spawning.
pub fn create_agent_command(command: &str, working_dir: &str) -> Command {
    let fixed_path = fix_path_env();

    let mut cmd = Command::new(command);
    cmd.current_dir(working_dir)
        .env("PATH", fixed_path)
        .env("FORCE_COLOR", "1")
        .env("CI", "true");

    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_agent_process_invalid_dir() {
        let config = AgentProcessConfig {
            command: "echo".to_string(),
            args: vec!["test".to_string()],
            working_dir: "/nonexistent/path/12345".to_string(),
            ..Default::default()
        };

        let result = spawn_agent_process(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_run_agent_command_echo() {
        let result = run_agent_command("echo", &["hello"], ".");
        assert!(result.is_ok());
        let (stdout, _) = result.unwrap();
        assert!(stdout.contains("hello"));
    }
}
