//! Environment utilities for fixing PATH on different OS platforms.
//!
//! Tauri apps often can't find CLI tools because the GUI environment
//! inherits a limited PATH. This module reconstructs a full PATH.

use std::env;
use std::path::PathBuf;

/// Returns a fixed PATH environment variable with common tool locations appended.
///
/// This function detects the OS and appends paths that are commonly missing
/// in GUI application environments (Homebrew, nvm, cargo, etc.).
pub fn fix_path_env() -> String {
    let current_path = env::var("PATH").unwrap_or_default();
    let home = env::var("HOME").unwrap_or_else(|_| String::from("/root"));

    let mut paths: Vec<String> = current_path
        .split(if cfg!(windows) { ';' } else { ':' })
        .map(String::from)
        .collect();

    // Common paths to append based on OS
    let additional_paths: Vec<PathBuf> = if cfg!(target_os = "macos") {
        vec![
            Some(PathBuf::from("/usr/local/bin")),
            Some(PathBuf::from("/opt/homebrew/bin")),          // Apple Silicon Homebrew
            Some(PathBuf::from("/opt/homebrew/sbin")),
            Some(PathBuf::from(format!("{}/.cargo/bin", home))),
            Some(PathBuf::from(format!("{}/.local/bin", home))),
            // nvm paths - try to detect active version
            detect_nvm_node_path(&home),
        ]
        .into_iter()
        .flatten()
        .collect()
    } else if cfg!(target_os = "linux") {
        vec![
            Some(PathBuf::from("/usr/local/bin")),
            Some(PathBuf::from(format!("{}/.cargo/bin", home))),
            Some(PathBuf::from(format!("{}/.local/bin", home))),
            detect_nvm_node_path(&home),
        ]
        .into_iter()
        .flatten()
        .collect()
    } else if cfg!(windows) {
        // Windows paths
        let userprofile = env::var("USERPROFILE").unwrap_or_default();
        vec![
            PathBuf::from(format!(r"{}\.cargo\bin", userprofile)),
            PathBuf::from(format!(r"{}\AppData\Local\Programs\nodejs", userprofile)),
        ]
    } else {
        vec![]
    };

    // Append paths that don't already exist
    for path in additional_paths {
        let path_str = path.to_string_lossy().to_string();
        if !path_str.is_empty() && !paths.contains(&path_str) && path.exists() {
            paths.push(path_str);
        }
    }

    let separator = if cfg!(windows) { ";" } else { ":" };
    paths.join(separator)
}

/// Attempts to detect the nvm-managed Node.js path.
///
/// nvm stores Node versions under ~/.nvm/versions/node/vX.X.X/bin.
/// This function tries to find the "current" or "default" symlink,
/// or falls back to the highest installed version.
fn detect_nvm_node_path(home: &str) -> Option<PathBuf> {
    let nvm_dir = PathBuf::from(format!("{}/.nvm/versions/node", home));

    if !nvm_dir.exists() {
        return None;
    }

    // Check for "current" or "default" alias first
    let current_alias = PathBuf::from(format!("{}/.nvm/alias/default", home));
    if current_alias.exists() {
        if let Ok(version) = std::fs::read_to_string(&current_alias) {
            let version = version.trim();
            let node_bin = nvm_dir.join(version).join("bin");
            if node_bin.exists() {
                return Some(node_bin);
            }
        }
    }

    // Fallback: find highest version directory
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();

        // Sort by version (simple lexicographic, works for vX.Y.Z format)
        versions.sort();

        if let Some(latest) = versions.last() {
            let bin_path = latest.join("bin");
            if bin_path.exists() {
                return Some(bin_path);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fix_path_env_returns_non_empty() {
        let fixed = fix_path_env();
        assert!(!fixed.is_empty(), "Fixed PATH should not be empty");
    }

    #[test]
    fn test_fix_path_env_contains_original() {
        let original = env::var("PATH").unwrap_or_default();
        let fixed = fix_path_env();

        // Original paths should be preserved
        for path in original.split(':').take(3) {
            if !path.is_empty() {
                assert!(
                    fixed.contains(path),
                    "Fixed PATH should contain original path: {}",
                    path
                );
            }
        }
    }
}
