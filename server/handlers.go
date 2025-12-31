package main

import (
	"context"
	"errors"
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
	Name   string `json:"name"`
	URL    string `json:"url"`
	Prompt string `json:"prompt"`
	Type   string `json:"type"`
}

type ProjectUpdateRequest struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Prompt string `json:"prompt"`
	Type   string `json:"type"`
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
	var user User
	if err := globalDB.Where("id = ?", userID).First(&user).Error; err != nil {
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
		LLMModel:     "google/gemini-3-flash-preview",
		LLMBaseURL:   "https://openrouter.ai/api/v1",
	}
	if err := globalDB.Create(&user).Error; err != nil {
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
	var user User
	if err := globalDB.Where("email = ?", req.Email).First(&user).Error; err != nil {
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
		token, _ := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) { return jwtSecret, nil })
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
	c.ShouldBindJSON(&req)
	runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		tx.Where("id = ?", userID).First(&user)
		user.Balance += req.Amount
		tx.Save(&user)
		tx.Create(&Transaction{ID: uuid.NewString(), UserID: userID, Amount: req.Amount, Type: "recharge", Description: req.Description})
		return nil
	})
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

	taskCost := int64(10)
	taskID := uuid.NewString()

	err := runWithUserLockAndTx(userID, func(tx *gorm.DB) error {
		var user User
		tx.Where("id = ?", userID).First(&user)
		if user.Balance < taskCost {
			return errInsufficientBalance
		}
		user.Balance -= taskCost
		tx.Save(&user)
		tx.Create(&Transaction{ID: uuid.NewString(), UserID: userID, Amount: -taskCost, Type: "consume"})
		
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