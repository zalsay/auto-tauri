use reqwest;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const OPENCODE_SERVER_URL: &str = "http://127.0.0.1:54096";

#[derive(Debug, Serialize)]
struct CreateSessionRequest {
    title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct MessagePart {
    #[serde(rename = "type")]
    r#type: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    snapshot: String,
}

#[derive(Debug, Deserialize)]
struct SessionResponse {
    id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct MessageInfo {
    id: String,
    #[serde(rename = "sessionID")]
    session_id: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct MessageResponse {
    info: MessageInfo,
    parts: Vec<MessagePart>,
}

pub struct OpenCodeClient {
    client: reqwest::Client,
}

impl OpenCodeClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        let response = self
            .client
            .get(format!("{}/global/health", OPENCODE_SERVER_URL))
            .send()
            .await
            .map_err(|e| format!("Health check failed: {}", e))?;

        if response.status().is_success() {
            Ok(true)
        } else {
            Err(format!("Server returned status: {}", response.status()))
        }
    }

    pub async fn create_session(&self, title: &str) -> Result<String, String> {
        let request = CreateSessionRequest {
            title: title.to_string(),
        };

        let response = self
            .client
            .post(format!("{}/session", OPENCODE_SERVER_URL))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to create session: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Create session failed: {}", response.status()));
        }

        let session: SessionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse session response: {}", e))?;

        Ok(session.id)
    }

    pub async fn send_message(&self, session_id: &str, text: &str) -> Result<String, String> {
        let request = serde_json::json!({
            "parts": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        });

        let response: MessageResponse = self
            .client
            .post(format!(
                "{}/session/{}/message",
                OPENCODE_SERVER_URL, session_id
            ))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send message: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Failed to parse message response: {}", e))?;

        let result = response
            .parts
            .iter()
            .filter(|p| p.r#type == "text" && !p.text.is_empty())
            .map(|p| p.text.clone())
            .collect::<Vec<_>>()
            .join("\n");

        Ok(result)
    }

    pub async fn run_prompt(&self, prompt: &str, title: &str) -> Result<String, String> {
        let session_id = self.create_session(title).await?;
        self.send_message(&session_id, prompt).await
    }
}

impl Default for OpenCodeClient {
    fn default() -> Self {
        Self::new()
    }
}
