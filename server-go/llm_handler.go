package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ============ Request/Response Types ============

type LLMChatRequest struct {
	Messages    []LLMMessage `json:"messages"`
	Model       string       `json:"model,omitempty"`
	Temperature float64      `json:"temperature,omitempty"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
}

type LLMMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type LLMChatResponse struct {
	Content      string `json:"content"`
	Model        string `json:"model"`
	PromptTokens int    `json:"promptTokens"`
	CompTokens   int    `json:"completionTokens"`
	TotalTokens  int    `json:"totalTokens"`
	Cost         int64  `json:"cost"`
}

// OpenAI-compatible response structure
type OpenAIResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// ============ Model Cost Configuration ============

// getModelCostRate fetches the cost rate for a model from Redis
// Returns points per 1000 tokens (e.g., 0.15 means 0.15 points per 1000 tokens)
func getModelCostRate(ctx context.Context, modelName string) float64 {
	defaultRate := 0.05 // Default: 0.05 points per 1000 tokens

	if redisClient == nil {
		return defaultRate
	}

	val, err := redisClient.Get(ctx, "llm:model_costs").Result()
	if err != nil {
		log.Printf("[LLM] Failed to get model costs from Redis: %v", err)
		return defaultRate
	}

	var costs map[string]float64
	if err := json.Unmarshal([]byte(val), &costs); err != nil {
		log.Printf("[LLM] Failed to parse model costs JSON: %v", err)
		return defaultRate
	}

	// Check exact match first
	if rate, ok := costs[modelName]; ok {
		return rate
	}

	// Check for default
	if rate, ok := costs["default"]; ok {
		return rate
	}

	return defaultRate
}

// calculateTokenCost calculates the cost in points for token usage
func calculateTokenCost(totalTokens int, rate float64) int64 {
	// Cost = totalTokens * rate / 1000, rounded up
	cost := float64(totalTokens) * rate / 1000.0
	return int64(cost + 0.5) // Round to nearest
}

// ============ LLM Chat Handler ============

func llmChatHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	ctx := context.Background()

	var req LLMChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[LLM] Error binding JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages_required"})
		return
	}

	// Get LLM configuration
	config := getLLMConfigInternal()

	// Use request model if provided, otherwise use system default
	modelToUse := config.Model
	if req.Model != "" {
		modelToUse = req.Model
	}

	// Set defaults
	temperature := req.Temperature
	if temperature == 0 {
		temperature = 0.7
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 2000
	}

	// Build request for LLM API
	llmReqBody := map[string]interface{}{
		"model":       modelToUse,
		"messages":    req.Messages,
		"temperature": temperature,
		"max_tokens":  maxTokens,
	}

	llmReqJSON, _ := json.Marshal(llmReqBody)
	log.Printf("[LLM] Calling %s with model %s", config.BaseURL, modelToUse)

	// Make HTTP request to LLM API
	httpReq, err := http.NewRequestWithContext(ctx, "POST", config.BaseURL+"/chat/completions", bytes.NewBuffer(llmReqJSON))
	if err != nil {
		log.Printf("[LLM] Failed to create request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "llm_request_failed"})
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+config.APIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[LLM] HTTP request failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "llm_request_failed", "details": err.Error()})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("[LLM] API returned error: %d - %s", resp.StatusCode, string(body))
		c.JSON(http.StatusBadGateway, gin.H{"error": "llm_api_error", "status": resp.StatusCode, "details": string(body)})
		return
	}

	// Parse response
	var llmResp OpenAIResponse
	if err := json.Unmarshal(body, &llmResp); err != nil {
		log.Printf("[LLM] Failed to parse response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "llm_response_parse_failed"})
		return
	}

	if len(llmResp.Choices) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "llm_no_choices"})
		return
	}

	content := llmResp.Choices[0].Message.Content
	usage := llmResp.Usage

	// Calculate cost
	rate := getModelCostRate(ctx, modelToUse)
	cost := calculateTokenCost(usage.TotalTokens, rate)

	log.Printf("[LLM] Usage: prompt=%d, completion=%d, total=%d, rate=%.4f, cost=%d",
		usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens, rate, cost)

	// Deduct balance if cost > 0
	if cost > 0 {
		err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
			var user User
			if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
				return err
			}

			if user.Balance < cost {
				return errInsufficientBalance
			}

			user.Balance -= cost
			if err := tx.Save(&user).Error; err != nil {
				return err
			}

			// Record transaction
			return tx.Create(&Transaction{
				ID:          uuid.NewString(),
				UserID:      userID,
				Amount:      -cost,
				Type:        "llm_usage",
				Description: fmt.Sprintf("LLM %s (%d tokens)", modelToUse, usage.TotalTokens),
			}).Error
		})

		if err != nil {
			if err == errInsufficientBalance {
				c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient_balance"})
				return
			}
			log.Printf("[LLM] Failed to deduct balance: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "billing_failed"})
			return
		}
	}

	// Return response
	c.JSON(http.StatusOK, LLMChatResponse{
		Content:      content,
		Model:        modelToUse,
		PromptTokens: usage.PromptTokens,
		CompTokens:   usage.CompletionTokens,
		TotalTokens:  usage.TotalTokens,
		Cost:         cost,
	})
}

// getLLMConfigInternal returns LLM config from env/Redis (internal helper)
func getLLMConfigInternal() LLMConfig {
	ctx := context.Background()

	config := LLMConfig{
		Provider: GetEnv("LLM_PROVIDER", "openrouter"),
		Model:    GetEnv("LLM_MODEL", "google/gemini-3-flash-preview"),
		APIKey:   GetEnv("LLM_API_KEY", ""),
		BaseURL:  GetEnv("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
	}

	// Override from Redis if available
	if redisClient != nil {
		val, err := redisClient.Get(ctx, "system:llm_config").Result()
		if err == nil {
			var redisConfig LLMConfig
			if err := json.Unmarshal([]byte(val), &redisConfig); err == nil {
				if redisConfig.Provider != "" {
					config.Provider = redisConfig.Provider
				}
				if redisConfig.Model != "" {
					config.Model = redisConfig.Model
				}
				if redisConfig.APIKey != "" {
					config.APIKey = redisConfig.APIKey
				}
				if redisConfig.BaseURL != "" {
					config.BaseURL = redisConfig.BaseURL
				}
			}
		}
	}

	return config
}
