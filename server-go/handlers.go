package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	sts20150401 "github.com/alibabacloud-go/sts-20150401/v2/client"
	"github.com/alibabacloud-go/tea/tea"
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
	ID             string  `json:"id"`
	Email          string  `json:"email"`
	Balance        int64   `json:"balance"`
	OrganizationID *string `json:"organizationId"`
	Role           string  `json:"role"`
	IsBlacklisted  bool    `json:"isBlacklisted"`
	LLMProvider    string  `json:"llmProvider"`
	LLMModel       string  `json:"llmModel"`
	LLMAPIKey      string  `json:"llmApiKey"`
	LLMBaseURL     string  `json:"llmBaseUrl"`
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
	Name         string `json:"name"`
	URL          string `json:"url"`
	Prompt       string `json:"prompt"`
	Type         string `json:"type"`
	Screenshot   *bool  `json:"screenshot"`
	Platform     string `json:"platform"`
	UseAIRewrite *bool  `json:"useAIRewrite"`
}

type ProjectUpdateRequest struct {
	Name         string  `json:"name"`
	URL          string  `json:"url"`
	Prompt       string  `json:"prompt"`
	Type         string  `json:"type"`
	Screenshot   *bool   `json:"screenshot"`
	Platform     string  `json:"platform"`
	UseAIRewrite *bool   `json:"useAIRewrite"`
	DevPlan      *string `json:"devPlan"`
	TestPlan     *string `json:"testPlan"`
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
		Output        string `json:"output"`
		ImageUrl      string `json:"imageUrl"`
		ScreenshotUrl string `json:"screenshotUrl"`
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
		ID:             user.ID,
		Email:          user.Email,
		Balance:        user.Balance,
		OrganizationID: user.OrganizationID,
		Role:           user.Role,
		IsBlacklisted:  user.IsBlacklisted,
		LLMProvider:    user.LLMProvider,
		LLMModel:       user.LLMModel,
		LLMAPIKey:      user.LLMAPIKey,
		LLMBaseURL:     user.LLMBaseURL,
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
	c.JSON(http.StatusCreated, AuthResponseUser{
		ID:            user.ID,
		Email:         user.Email,
		Balance:       user.Balance,
		Role:          user.Role,
		IsBlacklisted: user.IsBlacklisted,
		LLMProvider:   user.LLMProvider,
		LLMModel:      user.LLMModel,
		LLMAPIKey:     user.LLMAPIKey,
		LLMBaseURL:    user.LLMBaseURL,
	})
}

func loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	log.Printf("[loginHandler] Login attempt from %s, email=%s", c.ClientIP(), req.Email)
	user, err := GetUserByEmailWithCache(req.Email)
	if err != nil {
		log.Printf("[loginHandler] GetUserByEmailWithCache failed for email=%s: %v", req.Email, err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	log.Printf("[loginHandler] Retrieved user: %s, HashLen: %d", user.ID, len(user.PasswordHash))
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		log.Printf("[loginHandler] Password mismatch for email=%s. HashLen: %d, InputLen: %d, Error: %v", req.Email, len(user.PasswordHash), len(req.Password), err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	claims := jwt.MapClaims{"sub": user.ID, "exp": time.Now().Add(24 * time.Hour).Unix()}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString(jwtSecret)
	log.Printf("[loginHandler] Login success userID=%s, email=%s", user.ID, user.Email)
	c.JSON(http.StatusOK, AuthResponse{
		Token: tokenString,
		User: AuthResponseUser{
			ID:             user.ID,
			Email:          user.Email,
			Balance:        user.Balance,
			OrganizationID: user.OrganizationID,
			Role:           user.Role,
			IsBlacklisted:  user.IsBlacklisted,
			LLMProvider:    user.LLMProvider,
			LLMModel:       user.LLMModel,
			LLMAPIKey:      user.LLMAPIKey,
			LLMBaseURL:     user.LLMBaseURL,
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
		ID:       uuid.NewString(),
		UserID:   userID,
		Name:     req.Name,
		URL:      req.URL,
		Prompt:   req.Prompt,
		Type:     req.Type,
		Platform: req.Platform,
	}
	if req.Screenshot != nil {
		project.Screenshot = *req.Screenshot
	}
	if req.UseAIRewrite != nil {
		project.UseAIRewrite = *req.UseAIRewrite
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
	log.Printf("[updateProjectHandler] Received request for project %s: %+v", id, req)

	InvalidateProjectCache(id) // Invalidate cache on update

	updates := map[string]interface{}{
		"name":     req.Name,
		"url":      req.URL,
		"prompt":   req.Prompt,
		"type":     req.Type,
		"platform": req.Platform,
	}
	if req.Screenshot != nil {
		updates["screenshot"] = *req.Screenshot
	}
	if req.UseAIRewrite != nil {
		updates["use_ai_rewrite"] = *req.UseAIRewrite
	}
	if req.DevPlan != nil {
		updates["dev_plan"] = *req.DevPlan
	}
	if req.TestPlan != nil {
		updates["test_plan"] = *req.TestPlan
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

func getProjectHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	id := c.Param("id")

	// Try Cache First
	cachedProject, err := GetProjectFromCache(id)
	if err == nil && cachedProject != nil {
		// Verify ownership (optional but good practice if cache doesn't store user_id validation context)
		// Since cache stores full project, we can check UserID
		if cachedProject.UserID == userID {
			c.JSON(http.StatusOK, cachedProject)
			return
		}
	}

	var project Project
	if err := globalDB.Where("id = ? AND user_id = ?", id, userID).First(&project).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project_not_found"})
		return
	}

	// Set Cache
	SetProjectToCache(&project)

	c.JSON(http.StatusOK, project)
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
			ProjectID: &projectID,
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
			var imageUrlToSave string
			lines := strings.Split(req.Result, "\n")

			for _, line := range lines {
				var sidecarResult SidecarResult
				err := json.Unmarshal([]byte(line), &sidecarResult)
				if err == nil && strings.TrimSpace(sidecarResult.Data.Output) != "" {
					log.Printf("[completeTaskHandler] Found structured result with 'output' field on line: %s", line)
					contentToSave = sidecarResult.Data.Output
					if strings.TrimSpace(sidecarResult.Data.ImageUrl) != "" {
						imageUrlToSave = sidecarResult.Data.ImageUrl
					} else if strings.TrimSpace(sidecarResult.Data.ScreenshotUrl) != "" {
						imageUrlToSave = sidecarResult.Data.ScreenshotUrl
					}
					break
				}
			}

			if contentToSave != "" {
				log.Println("[completeTaskHandler] Successfully extracted 'output' field. Saving to material center.")
				if task.ProjectID != nil {
					var project Project
					if err := tx.Where("id = ?", *task.ProjectID).First(&project).Error; err == nil {
						material := Material{
							ID:        uuid.NewString(),
							UserID:    userID,
							ProjectID: task.ProjectID,
							Name:      fmt.Sprintf("Result: %s - %s", project.Name, time.Now().Format("2006-01-02 15:04")),
							Type:      "text",
							ImageUrls: imageUrlToSave,
							Content:   contentToSave,
						}
						if err := tx.Create(&material).Error; err != nil {
							log.Printf("[completeTaskHandler] ERROR: Failed to auto-save parsed material for task %s: %v", taskID, err)
						} else {
							log.Printf("[completeTaskHandler] SUCCESS: Parsed material saved for task %s.", taskID)
						}
					} else {
						log.Printf("[completeTaskHandler] ERROR: Failed to find project %s for auto-saving material", *task.ProjectID)
					}
				} else {
					// Handle case where there is no ProjectID (e.g. direct publish task)
					material := Material{
						ID:        uuid.NewString(),
						UserID:    userID,
						Name:      fmt.Sprintf("Result: Unnamed Task - %s", time.Now().Format("2006-01-02 15:04")),
						Type:      "text",
						ImageUrls: imageUrlToSave,
						Content:   contentToSave,
					}
					tx.Create(&material)
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

// OSSCredentialsResponse defines the structure for returning OSS credentials.
type OSSCredentialsResponse struct {
	Region          string `json:"region"`
	AccessKeyID     string `json:"accessKeyId"`
	AccessKeySecret string `json:"accessKeySecret"`
	Bucket          string `json:"bucket"`
}

func getOssCredentialsHandler(c *gin.Context) {
	// Ensure that the .env file in the server directory is loaded on startup
	// This is handled by godotenv.Load() in main.go
	creds := OSSCredentialsResponse{
		Region:          os.Getenv("OSS_REGION"),
		AccessKeyID:     os.Getenv("OSS_ACCESS_KEY_ID"),
		AccessKeySecret: os.Getenv("OSS_ACCESS_KEY_SECRET"),
		Bucket:          os.Getenv("OSS_BUCKET"),
	}

	// Basic validation to ensure they are not all empty
	if creds.Region == "" || creds.AccessKeyID == "" || creds.AccessKeySecret == "" || creds.Bucket == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "OSS credentials not configured on the server."})
		return
	}

	c.JSON(http.StatusOK, creds)
}

type MaterialCreateRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Content   string  `json:"content"`
	ProjectID *string `json:"projectId"`
	ImageUrls string  `json:"imageUrls"`
}

type PublishMaterialRequest struct {
	Platform string `json:"platform"`
	Title    string `json:"title"`
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
		ImageUrls: req.ImageUrls,
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
	log.Printf("[deleteMaterialHandler] UserID: %s, MaterialID: %s", userID, id)

	result := globalDB.Where("id = ? AND user_id = ?", id, userID).Delete(&Material{})
	if result.Error != nil {
		log.Printf("[deleteMaterialHandler] Delete failed: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete_failed"})
		return
	}
	if result.RowsAffected == 0 {
		log.Printf("[deleteMaterialHandler] No rows affected. Material not found or access denied.")
		c.JSON(http.StatusNotFound, gin.H{"error": "material_not_found_or_access_denied"})
		return
	}

	log.Printf("[deleteMaterialHandler] Successfully deleted material")
	c.JSON(http.StatusOK, gin.H{"message": "material_deleted"})
}

func updateMaterialHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	id := c.Param("id")

	var req struct {
		Name      string  `json:"name"`
		Type      string  `json:"type"`
		Content   string  `json:"content"`
		ProjectID *string `json:"projectId"`
		ImageUrls string  `json:"imageUrls"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	var material Material
	if err := globalDB.Where("id = ? AND user_id = ?", id, userID).First(&material).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "material_not_found"})
		return
	}

	// Update fields if provided
	if req.Name != "" {
		material.Name = req.Name
	}
	if req.Type != "" {
		material.Type = req.Type
	}
	if req.Content != "" {
		material.Content = req.Content
	}
	// Allow updating projectId (can be set to nil/empty or changed)
	if req.ProjectID != nil {
		if *req.ProjectID == "" {
			material.ProjectID = nil
		} else {
			material.ProjectID = req.ProjectID
		}
	}
	// Update imageUrls
	material.ImageUrls = req.ImageUrls

	if err := globalDB.Save(&material).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update_failed"})
		return
	}

	c.JSON(http.StatusOK, material)
}

func publishMaterialHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	materialID := c.Param("id")

	var req PublishMaterialRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[publishMaterialHandler] Error binding JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}
	log.Printf("[publishMaterialHandler] Received request: Platform=%s, Title=%s", req.Platform, req.Title)

	var material Material
	if err := globalDB.Where("id = ? AND user_id = ?", materialID, userID).First(&material).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "material_not_found"})
		return
	}

	taskID := uuid.NewString()
	taskCost := int64(0) // Initial cost is 0, will be deducted on completion

	err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		if user.Balance < taskCost {
			return errInsufficientBalance
		}

		task := Task{

			ID: taskID,

			ProjectID: material.ProjectID,

			UserID: userID,

			Prompt: material.Content, // Use material content as prompt/content

			Type: "xhs_publish", // Fixed type for now

			Status: "running",

			Cost: taskCost,
		}

		return tx.Create(&task).Error
	})

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"taskId":   taskID,
		"material": material,
		"platform": req.Platform,
		"title":    req.Title,
		"message":  "发布任务已启动",
	})
}

// getOSSTempTokenHandler returns OSS STS temporary credentials for frontend direct upload
// Uses Alibaba Cloud STS SDK to generate secure temporary tokens
func getOSSTempTokenHandler(c *gin.Context) {
	// Get OSS configuration from environment
	accessKeyID := os.Getenv("OSS_ACCESS_KEY_ID")
	accessKeySecret := os.Getenv("OSS_ACCESS_KEY_SECRET")
	bucket := os.Getenv("OSS_BUCKET")
	region := os.Getenv("OSS_REGION")
	roleArn := os.Getenv("OSS_ROLE_ARN") // RAM Role ARN for STS

	if accessKeyID == "" || accessKeySecret == "" || bucket == "" || region == "" || roleArn == "" {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "oss_not_configured",
			"message": "OSS环境变量未配置 (OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_REGION, OSS_ROLE_ARN)",
		})
		return
	}

	// Normalize region to get clean region ID (e.g., "ap-southeast-1")
	cleanRegion := region
	cleanRegion = strings.TrimPrefix(cleanRegion, "http://")
	cleanRegion = strings.TrimPrefix(cleanRegion, "https://")
	cleanRegion = strings.TrimSuffix(cleanRegion, ".aliyuncs.com")
	cleanRegion = strings.TrimPrefix(cleanRegion, "oss-")

	// Initialize STS Client
	config := &openapi.Config{
		AccessKeyId:     tea.String(accessKeyID),
		AccessKeySecret: tea.String(accessKeySecret),
	}
	config.Endpoint = tea.String("sts.aliyuncs.com")

	stsClient, err := sts20150401.NewClient(config)
	if err != nil {
		log.Printf("[getOSSTempTokenHandler] Failed to create STS client: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "sts_client_error",
			"message": "无法创建STS客户端",
		})
		return
	}

	// Request temporary credentials
	request := &sts20150401.AssumeRoleRequest{
		RoleArn:         tea.String(roleArn),
		RoleSessionName: tea.String("oss_upload_session"),
		DurationSeconds: tea.Int64(3600), // 1 hour validity
	}

	response, err := stsClient.AssumeRole(request)
	if err != nil {
		log.Printf("[getOSSTempTokenHandler] STS AssumeRole failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "sts_assume_role_error",
			"message": "获取STS临时凭证失败: " + err.Error(),
		})
		return
	}

	if response.Body == nil || response.Body.Credentials == nil {
		log.Printf("[getOSSTempTokenHandler] STS response is empty")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "sts_empty_response",
			"message": "STS返回空响应",
		})
		return
	}

	creds := response.Body.Credentials

	// Construct standard endpoint
	endpoint := fmt.Sprintf("oss-%s.aliyuncs.com", cleanRegion)

	log.Printf("[getOSSTempTokenHandler] STS credentials obtained successfully, expiration: %s", tea.StringValue(creds.Expiration))

	c.JSON(http.StatusOK, gin.H{
		"accessKeyId":     tea.StringValue(creds.AccessKeyId),
		"accessKeySecret": tea.StringValue(creds.AccessKeySecret),
		"stsToken":        tea.StringValue(creds.SecurityToken), // Frontend expects 'stsToken'
		"expiration":      tea.StringValue(creds.Expiration),
		"bucket":          bucket,
		"region":          "oss-" + cleanRegion,
		"endpoint":        endpoint,
	})
}

// getProjectMaterialsHandler returns materials associated with a project
func getProjectMaterialsHandler(c *gin.Context) {
	userID := c.MustGet("userID").(string)
	projectID := c.Param("id")

	var materials []Material
	globalDB.Where("project_id = ? AND user_id = ?", projectID, userID).Order("created_at desc").Find(&materials)

	c.JSON(http.StatusOK, gin.H{
		"count":     len(materials),
		"materials": materials,
	})
}
