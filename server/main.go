package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env if exists
	godotenv.Load()

	// Initialize Database
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize Redis (Optional)
	initRedis()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api/v1")
	{
		// Auth
		api.POST("/auth/register", registerHandler)
		api.POST("/auth/login", loginHandler)

		// Protected Routes
		auth := api.Group("/")
		auth.Use(authMiddleware())
		{
			auth.GET("/auth/me", meHandler)
			auth.POST("/credits/recharge", rechargeHandler)
			auth.POST("/users/change-password", changePasswordHandler)
			auth.PATCH("/users/settings", updateUserSettingsHandler)

			// Projects
			auth.POST("/projects", createProjectHandler)
			auth.GET("/projects", getProjectsHandler)
			auth.PUT("/projects/:id", updateProjectHandler)
			auth.DELETE("/projects/:id", deleteProjectHandler)
			auth.POST("/projects/:id/execute", executeProjectHandler)

			// Tasks
			auth.GET("/tasks", getTasksHandler)
			auth.PATCH("/tasks/:id/status", updateTaskStatusHandler)
			auth.POST("/tasks/:id/complete", completeTaskHandler)
			auth.DELETE("/tasks/:id", deleteTaskHandler)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
