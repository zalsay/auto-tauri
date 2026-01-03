package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var errInsufficientBalance = errors.New("insufficient_balance")
var errConcurrentOperation = errors.New("concurrent_operation")

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponseUser struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	Balance     int64  `json:"balance"`
	LLMProvider string `json:"llmProvider"`
	LLMModel    string `json:"llmModel"`
	LLMAPIKey   string `json:"llmApiKey"`
	LLMBaseURL  string `json:"llmBaseUrl"`
}

type AuthResponse struct {
	Token string           `json:"token"`
	User  AuthResponseUser `json:"user"`
}

type RechargeRequest struct {
	Amount      int64  `json:"amount"`
	Description string `json:"description"`
}

type ProjectCreateRequest struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	Prompt     string `json:"prompt"`
	Type       string `json:"type"`
	Screenshot *bool  `json:"screenshot"`
}

type ProjectUpdateRequest struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	Prompt     string `json:"prompt"`
	Type       string `json:"type"`
	Screenshot *bool  `json:"screenshot"`
}

type TaskStartResponse struct {
	TaskID  string  `json:"taskId"`
	Project Project `json:"project"`
	Message string  `json:"message"`
}

type TaskStatusUpdateRequest struct {
	Status string `json:"status"`
	Result string `json:"result"`
}

type TaskCompleteRequest struct {
	Status     string `json:"status"`
	Result     string `json:"result"`
	StepsCount int    `json:"stepsCount"`
}

// SidecarResult defines the structure for parsing the JSON result from the sidecar.
type SidecarResult struct {
	Data struct {
		Output string `json:"output"`
	} `json:"data"`
}

const costPerStep = int64(1)


type ChangePasswordRequest struct {
	OldPassword string `json:"oldPassword" binding:"required"`
	NewPassword string `json:"newPassword" binding:"required"`
}

type UserSettingsUpdateRequest struct {
	LLMProvider *string `json:"llmProvider"`
	LLMModel    *string `json:"llmModel"`
	LLMAPIKey   *string `json:"llmApiKey"`
	LLMBaseURL  *string `json:"llmBaseUrl"`
}

func runWithUserLockAndTx(userID string, fn func(tx *gorm.DB) error) error {
	exec := func() error {
		return globalDB.Transaction(func(tx *gorm.DB) error {
			return fn(tx)
		})
	}
	if redisClient == nil {
		return exec()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	key := "lock:user:" + userID
	ok, err := redisClient.SetNX(ctx, key, "1", 10*time.Second).Result()
	if err != nil {
		return err
	}
	if !ok {
		return errConcurrentOperation
	}
	defer redisClient.Del(ctx, key)
	return exec()
}

func meHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	user, err := GetUserWithCache(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	c.JSON(http.StatusOK, AuthResponseUser{
		ID:          user.ID,
		Email:       user.Email,
		Balance:     user.Balance,
		LLMProvider: user.LLMProvider,
		LLMModel:    user.LLMModel,
		LLMAPIKey:   user.LLMAPIKey,
		LLMBaseURL:  user.LLMBaseURL,
	})
}

func registerHandler(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	user := User{
		ID:           uuid.NewString(),
		Email:        req.Email,
		PasswordHash: string(hash),
		LLMProvider:  "TaskMaster",
		LLMModel:     "google/gemini-2.0-flash-exp:free",
		LLMBaseURL:   "https://openrouter.ai/api/v1",
		Balance:      1000,
	}
	if err := CreateUserWithCache(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_user"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	user, err := GetUserByEmailWithCache(req.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	claims := jwt.MapClaims{"sub": user.ID, "exp": time.Now().Add(24 * time.Hour).Unix()}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString(jwtSecret)
	c.JSON(http.StatusOK, AuthResponse{
		Token: tokenString,
		User: AuthResponseUser{
			ID:          user.ID,
			Email:       user.Email,
			Balance:     user.Balance,
			LLMProvider: user.LLMProvider,
			LLMModel:    user.LLMModel,
			LLMAPIKey:   user.LLMAPIKey,
			LLMBaseURL:  user.LLMBaseURL,
		},
	})
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatus(401)
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) { return jwtSecret, nil })
		if err != nil || token == nil {
			c.AbortWithStatus(401)
			return
		}
		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			c.Set("userID", claims["sub"].(string))
			c.Next()
		} else {
			c.AbortWithStatus(401)
		}
	}
}

func rechargeHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var req RechargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		user.Balance += req.Amount
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		return tx.Create(&Transaction{ID: uuid.NewString(), UserID: userID, Amount: req.Amount, Type: "recharge", Description: req.Description}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_recharge"})
		return
	}
	InvalidateUserCacheByID(userID)
	var user User
	globalDB.Where("id = ?", userID).First(&user)
	c.JSON(http.StatusOK, gin.H{"balance": user.Balance})
}

func changePasswordHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	var user User
	if err := globalDB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_old_password"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_hash_password"})
		return
	}

	if err := globalDB.Model(&user).Update("password_hash", string(newHash)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_password"})
		return
	}
	InvalidateUserCacheByID(userID)

	c.JSON(http.StatusOK, gin.H{"message": "password_changed"})
}

func updateUserSettingsHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var req UserSettingsUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	updates := make(map[string]interface{})
	if req.LLMProvider != nil {
		updates["llm_provider"] = *req.LLMProvider
	}
	if req.LLMModel != nil {
		updates["llm_model"] = *req.LLMModel
	}
	if req.LLMBaseURL != nil && *req.LLMBaseURL != "" {
		updates["llm_base_url"] = *req.LLMBaseURL
	}
	if req.LLMAPIKey != nil && *req.LLMAPIKey != "" {
		updates["llm_api_key"] = *req.LLMAPIKey
	}

	if err := globalDB.Model(&User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_settings"})
		return
	}
	InvalidateUserCacheByID(userID)

	c.JSON(http.StatusOK, gin.H{"message": "settings_updated"})
}

// Project Handlers
func createProjectHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var req ProjectCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	project := Project{
		ID:     uuid.NewString(),
		UserID: userID,
		Name:   req.Name,
		URL:    req.URL,
		Prompt: req.Prompt,
		Type:   req.Type,
	}
	if req.Screenshot != nil {
		project.Screenshot = *req.Screenshot
	}
	if err := globalDB.Create(&project).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_project"})
		return
	}
	c.JSON(http.StatusCreated, project)
}

func updateProjectHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	id := c.Param("id")
	var req ProjectUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	updates := map[string]interface{}{
		"name":   req.Name,
		"url":    req.URL,
		"prompt": req.Prompt,
		"type":   req.Type,
	}
	if req.Screenshot != nil {
		updates["screenshot"] = *req.Screenshot
	}

	if err := globalDB.Model(&Project{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_project"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "project_updated"})
}

func getProjectsHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var projects []Project
	globalDB.Where("user_id = ?", userID).Order("created_at desc").Find(&projects)
	c.JSON(http.StatusOK, projects)
}

func deleteProjectHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	id := c.Param("id")
	globalDB.Where("id = ? AND user_id = ?", id, userID).Delete(&Project{})
	c.JSON(http.StatusOK, gin.H{"message": "project_deleted"})
}

// Execution Handler
func executeProjectHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	projectID := c.Param("id")

	var project Project
	if err := globalDB.Where("id = ? AND user_id = ?", projectID, userID).First(&project).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project_not_found"})
		return
	}

	taskCost := int64(0)
	taskID := uuid.NewString()

	err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		if user.Balance < taskCost {
			return errInsufficientBalance
		}
		user.Balance -= taskCost
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		if err := tx.Create(&Transaction{ID: uuid.NewString(), UserID: userID, Amount: -taskCost, Type: "consume"}).Error; err != nil {
			return err
		}

		task := Task{
			ID:        taskID,
			ProjectID: projectID,
			UserID:    userID,
			Prompt:    project.Prompt,
			Type:      project.Type,
			Status:    "running",
			Cost:      taskCost,
		}
		return tx.Create(&task).Error
	})

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, TaskStartResponse{
		TaskID:  taskID,
		Project: project,
		Message: "任务启动中...",
	})
}

func getTasksHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var tasks []Task
	globalDB.Where("user_id = ?", userID).Order("created_at desc").Find(&tasks)
	c.JSON(http.StatusOK, tasks)
}

func updateTaskStatusHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	taskID := c.Param("id")
	var req TaskStatusUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	updates := map[string]interface{}{
		"status": req.Status,
	}
	if req.Result != "" {
		updates["result"] = req.Result
	}

	if err := globalDB.Model(&Task{}).Where("id = ? AND user_id = ?", taskID, userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_task_status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task_status_updated"})
}

func deleteTaskHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	taskID := c.Param("id")
	if err := globalDB.Where("id = ? AND user_id = ?", taskID, userID).Delete(&Task{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_delete_task"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "task_deleted"})
}

func completeTaskHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	taskID := c.Param("id")

	var req TaskCompleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	
	log.Printf("[completeTaskHandler] Received request for TaskID %s: %+v", taskID, req)


	stepsCount := int64(req.StepsCount)
	if stepsCount < 1 {
		stepsCount = 1
	}
	taskCost := stepsCount * costPerStep

	var finalBalance int64

	err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		if user.Balance < taskCost {
			return errInsufficientBalance
		}

		user.Balance -= taskCost
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		finalBalance = user.Balance

		if err := tx.Create(&Transaction{
			ID:          uuid.NewString(),
			UserID:      userID,
			Amount:      -taskCost,
			Type:        "consume",
			Description: fmt.Sprintf("Task %s (%d steps)", taskID, req.StepsCount),
		}).Error; err != nil {
			return err
		}

		var task Task
		if err := tx.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
			return err
		}

		updates := map[string]interface{}{
			"status": req.Status,
			"cost":   taskCost,
		}
		if req.Result != "" {
			updates["result"] = req.Result
		}
		if err := tx.Model(&task).Updates(updates).Error; err != nil {
			return err
		}

		// Auto-save result to material center for any successful task with a result
		log.Printf("[completeTaskHandler] Condition check: req.Status=='completed' is %t, req.Result!=\"\" is %t", req.Status == "completed", req.Result != "")
		if req.Status == "completed" && req.Result != "" {
			
			var contentToSave string
			lines := strings.Split(req.Result, "\n")

			for _, line := range lines {
				var sidecarResult SidecarResult
				err := json.Unmarshal([]byte(line), &sidecarResult)
				if err == nil && strings.TrimSpace(sidecarResult.Data.Output) != "" {
					log.Printf("[completeTaskHandler] Found structured result with 'output' field on line: %s", line)
					contentToSave = sidecarResult.Data.Output
					break // Found what we need, stop searching
				}
			}
			
			if contentToSave != "" {
				log.Println("[completeTaskHandler] Successfully extracted 'output' field. Saving to material center.")
				var project Project
				if err := tx.Where("id = ?", task.ProjectID).First(&project).Error; err == nil {
					material := Material{
						ID:        uuid.NewString(),
						UserID:    userID,
						ProjectID: &task.ProjectID,
						Name:      fmt.Sprintf("Result: %s - %s", project.Name, time.Now().Format("2006-01-02 15:04")),
						Type:      "text",
						Content:   contentToSave,
					}
					if err := tx.Create(&material).Error; err != nil {
						log.Printf("[completeTaskHandler] ERROR: Failed to auto-save parsed material for task %s: %v", taskID, err)
					} else {
						log.Printf("[completeTaskHandler] SUCCESS: Parsed material saved for task %s.", taskID)
					}
				} else {
					log.Printf("[completeTaskHandler] ERROR: Failed to find project %s for auto-saving material", task.ProjectID)
				}
			} else {
				log.Println("[completeTaskHandler] Result was present, but a structured result with a non-empty 'output' field was not found. Skipping material save.")
			}
		} else {
			log.Println("[completeTaskHandler] Condition not met. Skipping material save.")
		}


		return nil
	})

	if err != nil {
		if err == errInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient_balance"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_complete_task"})
		return
	}

	InvalidateUserCacheByID(userID)

	c.JSON(http.StatusOK, gin.H{
		"message":    "task_completed",
		"cost":       taskCost,
		"balance":    finalBalance,
		"stepsCount": req.StepsCount,
	})
}

func getLLMConfigHandler(c *gin.Context) {
	// Default config
	config := LLMConfig{
		Provider: "TaskMaster",
		Model:    "google/gemini-2.0-flash-exp:free",
		BaseURL:  "https://openrouter.ai/api/v1",
		APIKey:   "",
	}

	if redisClient != nil {
		ctx := context.Background()
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

	c.JSON(http.StatusOK, config)
}

// Material Handlers
type MaterialCreateRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Content   string  `json:"content"`
	ProjectID *string `json:"projectId"`
}

func createMaterialHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var req MaterialCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	material := Material{
		ID:        uuid.NewString(),
		UserID:    userID,
		Name:      req.Name,
		Type:      req.Type,
		Content:   req.Content,
		ProjectID: req.ProjectID,
	}
	if err := globalDB.Create(&material).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_material"})
		return
	}
	c.JSON(http.StatusCreated, material)
}

func getMaterialsHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	var materials []Material
	globalDB.Where("user_id = ?", userID).Order("created_at desc").Find(&materials)
	c.JSON(http.StatusOK, materials)
}

func deleteMaterialHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	id := c.Param("id")
	globalDB.Where("id = ? AND user_id = ?", id, userID).Delete(&Material{})
	c.JSON(http.StatusOK, gin.H{"message": "material_deleted"})
}
