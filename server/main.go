package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

var globalDB *gorm.DB
var jwtSecret []byte
var redisClient *redis.Client

func setupRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

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
		log.Printf("warning: cannot load env file: %v", err)
	}

	database, err := InitDatabase()
	if err != nil {
		log.Fatalf("failed to init database: %v", err)
	}

	globalDB = database
	secret := GetEnv("JWT_SECRET", "auto-tauri-dev-secret")
	jwtSecret = []byte(secret)
	client, err := InitRedis()
	if err != nil {
		log.Fatalf("failed to init redis: %v", err)
	}
	redisClient = client

	if err := AutoMigrate(database); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	r := setupRouter()
	port := GetEnv("SERVER_PORT", "8080")
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
