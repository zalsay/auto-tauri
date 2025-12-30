package main

import (
	"log/slog"
	"net/http"
	"time"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

var globalDB *gorm.DB
var jwtSecret []byte
var redisClient *redis.Client

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func setupRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.Use(corsMiddleware())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "auto-tauri-server",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := r.Group("/api/v1")
	authGroup := api.Group("/auth")
	authGroup.POST("/register", registerHandler)
	authGroup.POST("/login", loginHandler)
	authGroup.GET("/me", authMiddleware(), meHandler)

	creditsGroup := api.Group("/credits")
	creditsGroup.Use(authMiddleware())
	creditsGroup.POST("/recharge", rechargeHandler)

	tasksGroup := api.Group("/tasks")
	tasksGroup.Use(authMiddleware())
	tasksGroup.POST("/start", startTaskHandler)

	return r
}

func main() {
	if err := LoadEnv(); err != nil {
		slog.Error(fmt.Sprintf("warning: cannot load env file: %v", err))
	}

	database, err := InitDatabase()
	if err != nil {
		slog.Error(fmt.Sprintf("failed to init database: %v", err))
		return
	}

	globalDB = database
	secret := GetEnv("JWT_SECRET", "auto-tauri-dev-secret")
	jwtSecret = []byte(secret)
	client, err := InitRedis()
	if err != nil {
		slog.Error(fmt.Sprintf("failed to init redis: %v", err))
	}
	redisClient = client

	if err := AutoMigrate(database); err != nil {
		slog.Error(fmt.Sprintf("failed to migrate database: %v", err))	
	}

	r := setupRouter()
	port := GetEnv("SERVER_PORT", "8080")
	if err := r.Run(":" + port); err != nil {
		slog.Error(fmt.Sprintf("failed to start server: %v", err))
	} 
	slog.Info(fmt.Sprintf("server started on port %s", port))
	
}
