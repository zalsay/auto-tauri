package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

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

	return r
}

func main() {
	if err := LoadEnv(); err != nil {
		log.Printf("warning: cannot load env file: %v", err)
	}

	db, err := InitDatabase()
	if err != nil {
		log.Fatalf("failed to init database: %v", err)
	}

	if err := AutoMigrate(db); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	r := setupRouter()
	port := GetEnv("SERVER_PORT", "8080")
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
