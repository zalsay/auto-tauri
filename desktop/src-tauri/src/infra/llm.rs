//! Unified LLM Integration Module
//!
//! Provides a consistent interface for calling various LLM providers with Anthropic message format.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::fs;

/// Message role types (Anthropic format)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// A single message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMMessage {
    pub role: MessageRole,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Request structure for LLM calls
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRequest {
    pub model: String,
    pub messages: Vec<LLMMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

/// Response structure from LLM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMResponse {
    pub id: String,
    pub model: String,
    pub content: String,
    pub success: bool,
}

/// LLM Configuration storage
#[derive(Default, Clone)]
struct LLMConfig {
    anthropic_api_key: Option<String>,
    anthropic_model: Option<String>,
    openai_base_url: Option<String>,
    openai_api_key: Option<String>,
    openai_model: Option<String>,
}

static LLM_CONFIG: AtomicBool = AtomicBool::new(false);
static mut LLM_CONFIG_DATA: Option<LLMConfig> = None;

/// Thread-safe config getter
fn get_llm_config() -> LLMConfig {
    if !LLM_CONFIG.load(Ordering::SeqCst) {
        return LLMConfig::default();
    }
    unsafe { LLM_CONFIG_DATA.clone().unwrap_or_default() }
}

/// Initialize LLM config
fn set_llm_config(config: LLMConfig) {
    unsafe {
        LLM_CONFIG_DATA = Some(config);
    }
    LLM_CONFIG.store(true, Ordering::SeqCst);
}

/// Anthropic Claude API client
async fn call_anthropic(
    messages: Vec<LLMMessage>,
    model: String,
    max_tokens: Option<u32>,
) -> Result<LLMResponse, String> {
    // Read config from ~/.opencode/config.json
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = PathBuf::from(home).join(".opencode").join("config.json");

    let config_content = if config_path.exists() {
        fs::read_to_string(&config_path).await.ok()
    } else {
        None
    };

    let mut api_key = String::new();

    if let Some(content) = config_content {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(providers) = config.get("provider").and_then(|p| p.as_object()) {
                // Try anthropic first
                if let Some(anthropic) = providers.get("anthropic") {
                    if let Some(api_key_str) = anthropic.as_object()
                        .and_then(|o| o.get("api_key"))
                        .and_then(|k| k.as_str())
                    {
                        api_key = api_key_str.to_string();
                    }
                }
            }
        }
    }

    if api_key.is_empty() {
        return Err("Anthropic API key not configured in ~/.opencode/config.json".to_string());
    }

    // Store model for later use
    let model_for_body = model.clone();

    // Format messages for Anthropic
    let messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|msg| {
            let role = match msg.role {
                MessageRole::System => "user",
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::Tool => "user",
            };
            serde_json::json!({
                "role": role,
                "content": msg.content
            })
        })
        .collect();

    let mut body = serde_json::json!({
        "model": model_for_body,
        "messages": messages_json,
        "max_tokens": max_tokens.unwrap_or(4096),
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error: {}", error_text));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = result["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("text"))
        .and_then(|text| text.as_str())
        .unwrap_or("")
        .to_string();

    let response_model = result["model"].as_str().unwrap_or("unknown").to_string();
    let id = result["id"].as_str().unwrap_or("unknown").to_string();

    Ok(LLMResponse {
        id,
        model: response_model,
        content,
        success: true,
    })
}

/// OpenAI Compatible API client
async fn call_openai(
    messages: Vec<LLMMessage>,
    model: String,
    max_tokens: Option<u32>,
) -> Result<LLMResponse, String> {
    // Read config from ~/.opencode/config.json
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = PathBuf::from(home).join(".opencode").join("config.json");

    let config_content = if config_path.exists() {
        fs::read_to_string(&config_path).await.ok()
    } else {
        None
    };

    let mut base_url = "https://api.openai.com/v1".to_string();
    let mut api_key = String::new();
    let mut config_model = "gpt-4o".to_string();

    if let Some(content) = &config_content {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(content) {
            // Get provider config
            if let Some(providers) = config.get("provider").and_then(|p| p.as_object()) {
                for (_provider_name, provider_config) in providers {
                    if let Some(config_obj) = provider_config.as_object() {
                        if let Some(key) = config_obj.get("api_key").and_then(|k| k.as_str()) {
                            api_key = key.to_string();
                        }
                    }
                }
            }

            // Get base URL
            base_url = config.get("openai_base_url")
                .and_then(|b| b.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

            // Get model
            config_model = config.get("model")
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "gpt-4o".to_string());
        }
    }

    // Use model from parameter, or from config
    let selected_model = if model.is_empty() {
        config_model
    } else {
        model
    };

    if api_key.is_empty() {
        return Err("API key not configured in ~/.opencode/config.json".to_string());
    }

    let messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|msg| {
            serde_json::json!({
                "role": match msg.role {
                    MessageRole::System => "system",
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                    MessageRole::Tool => "user",
                },
                "content": msg.content
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": selected_model,
        "messages": messages_json,
        "max_tokens": max_tokens.unwrap_or(4096),
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/chat/completions", base_url))
        .header("authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error: {}", error_text));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = result["choices"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let response_model = result["model"].as_str().unwrap_or("unknown").to_string();
    let id = result["id"].as_str().unwrap_or("unknown").to_string();

    Ok(LLMResponse {
        id,
        model: response_model,
        content,
        success: true,
    })
}

/// Initialize LLM service with configuration
#[tauri::command]
pub async fn init_llm_service(
    anthropic_api_key: Option<String>,
    anthropic_model: Option<String>,
    openai_base_url: Option<String>,
    openai_api_key: Option<String>,
    openai_model: Option<String>,
) -> Result<(), String> {
    let config = LLMConfig {
        anthropic_api_key,
        anthropic_model,
        openai_base_url,
        openai_api_key,
        openai_model,
    };

    set_llm_config(config);

    info!("[LLM] Service initialized");
    Ok(())
}

/// Unified chat command
#[tauri::command]
pub async fn llm_chat(
    messages_json: String,
    model: String,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<serde_json::Value, String> {
    let messages: Vec<LLMMessage> = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Failed to parse messages: {}", e))?;

    // Route to appropriate provider
    let is_anthropic = !model.is_empty() && (model.starts_with("claude") || model.starts_with("anthropic"));

    let response = if is_anthropic {
        call_anthropic(messages, model, max_tokens).await
    } else {
        call_openai(messages, model, max_tokens).await
    };

    match response {
        Ok(resp) => Ok(serde_json::json!({
            "success": true,
            "response": resp.content,
            "model": resp.model,
            "id": resp.id,
        })),
        Err(e) => Err(e),
    }
}

/// Simple chat with system prompt
#[tauri::command]
pub async fn llm_chat_with_system(
    system: String,
    user_message: String,
    model: String,
) -> Result<serde_json::Value, String> {
    let messages = vec![
        LLMMessage {
            role: MessageRole::System,
            content: system,
            name: None,
        },
        LLMMessage {
            role: MessageRole::User,
            content: user_message,
            name: None,
        },
    ];

    llm_chat(serde_json::to_string(&messages).map_err(|e| e.to_string())?, model, Some(4096), Some(0.7)).await
}

/// Read config file
#[tauri::command]
pub async fn get_llm_config_file() -> Result<serde_json::Value, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = PathBuf::from(home).join(".auto-tauri").join("llm_config.json");

    if !config_path.exists() {
        return Ok(serde_json::json!({
            "anthropicConfigured": false,
            "openaiConfigured": false,
        }));
    }

    let content = fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid config format: {}", e))?;

    Ok(serde_json::json!({
        "anthropicConfigured": config.get("anthropicApiKey").is_some(),
        "openaiConfigured": config.get("openaiApiKey").is_some(),
    }))
}

/// Save config file
#[tauri::command]
pub async fn save_llm_config_file(config_json: String) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_dir = PathBuf::from(home).join(".auto-tauri");

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).await
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let config_path = config_dir.join("llm_config.json");

    // Validate JSON
    let config_json_clone = config_json.clone();
    let _: serde_json::Value = serde_json::from_str(&config_json_clone)
        .map_err(|e| format!("Invalid JSON config: {}", e))?;

    fs::write(&config_path, &config_json).await
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Also update runtime config
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid config format: {}", e))?;

    let runtime_config = LLMConfig {
        anthropic_api_key: config["anthropicApiKey"].as_str().map(|s| s.to_string()),
        anthropic_model: config["anthropicModel"].as_str().map(|s| s.to_string()),
        openai_base_url: config["openaiBaseUrl"].as_str().map(|s| s.to_string()),
        openai_api_key: config["openaiApiKey"].as_str().map(|s| s.to_string()),
        openai_model: config["openaiModel"].as_str().map(|s| s.to_string()),
    };
    set_llm_config(runtime_config);

    Ok(())
}
