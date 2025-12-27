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
	ID      string `json:"id"`
	Email   string `json:"email"`
	Balance int64  `json:"balance"`
}

type AuthResponse struct {
	Token string           `json:"token"`
	User  AuthResponseUser `json:"user"`
}

type RechargeRequest struct {
	Amount      int64  `json:"amount"`
	Description string `json:"description"`
}

type TaskStartRequest struct {
	Prompt string `json:"prompt"`
}

type TaskStartResponse struct {
	TaskID  string `json:"task_id"`
	Message string `json:"message"`
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
	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var user User
	if err := globalDB.Where("id = ?", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_load_user"})
		return
	}
	c.JSON(http.StatusOK, AuthResponseUser{
		ID:      user.ID,
		Email:   user.Email,
		Balance: user.Balance,
	})
}

func registerHandler(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	if req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email_and_password_required"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_hash_password"})
		return
	}
	id := uuid.NewString()
	user := User{
		ID:           id,
		Email:        req.Email,
		PasswordHash: string(hash),
		Balance:      0,
	}
	if err := globalDB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_user"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":      user.ID,
		"email":   user.Email,
		"balance": user.Balance,
	})
}

func loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	var user User
	if err := globalDB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_query_user"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_sign_token"})
		return
	}
	resp := AuthResponse{
		Token: tokenString,
		User: AuthResponseUser{
			ID:      user.ID,
			Email:   user.Email,
			Balance: user.Balance,
		},
	}
	c.JSON(http.StatusOK, resp)
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization_required"})
			return
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid_authorization_header"})
			return
		}
		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("invalid_signing_method")
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid_token_claims"})
			return
		}
		userIDValue, ok := claims["sub"].(string)
		if !ok || userIDValue == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid_token_subject"})
			return
		}
		c.Set("userID", userIDValue)
		c.Next()
	}
}

func rechargeHandler(c *gin.Context) {
	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req RechargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount_must_be_positive"})
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
		tr := Transaction{
			ID:          uuid.NewString(),
			UserID:      user.ID,
			Amount:      req.Amount,
			Type:        "recharge",
			Description: req.Description,
		}
		return tx.Create(&tr).Error
	})
	if err != nil {
		if errors.Is(err, errConcurrentOperation) {
			c.JSON(http.StatusConflict, gin.H{"error": "concurrent_operation"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_recharge"})
		return
	}
	var user User
	if err := globalDB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_load_user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"balance": user.Balance,
	})
}

func startTaskHandler(c *gin.Context) {
	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req TaskStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	if req.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prompt_required"})
		return
	}
	taskCost := int64(10)
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
		tr := Transaction{
			ID:     uuid.NewString(),
			UserID: user.ID,
			Amount: -taskCost,
			Type:   "consume",
		}
		if err := tx.Create(&tr).Error; err != nil {
			return err
		}
		task := Task{
			ID:     taskID,
			UserID: user.ID,
			Prompt: req.Prompt,
			Status: "pending",
			Cost:   taskCost,
		}
		return tx.Create(&task).Error
	})
	if err != nil {
		if errors.Is(err, errInsufficientBalance) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient_balance"})
			return
		}
		if errors.Is(err, errConcurrentOperation) {
			c.JSON(http.StatusConflict, gin.H{"error": "concurrent_operation"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_start_task"})
		return
	}
	resp := TaskStartResponse{
		TaskID:  taskID,
		Message: "扣费成功，任务启动中...",
	}
	c.JSON(http.StatusOK, resp)
}
