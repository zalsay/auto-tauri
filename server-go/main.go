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
		auth.Use(blacklistMiddleware()) // Check if user is blacklisted
		{
			auth.GET("/auth/me", meHandler)
			auth.GET("/llm-config", getLLMConfigHandler)
			auth.GET("/oss-credentials", getOssCredentialsHandler)
			auth.POST("/credits/recharge", rechargeHandler)
			auth.POST("/users/change-password", changePasswordHandler)
			auth.PATCH("/users/settings", updateUserSettingsHandler)

			// Projects
			auth.POST("/projects", createProjectHandler)
			auth.GET("/projects", getProjectsHandler)
			auth.PUT("/projects/:id", updateProjectHandler)
			auth.DELETE("/projects/:id", deleteProjectHandler)
			auth.POST("/projects/:id/execute", executeProjectHandler)
			auth.GET("/projects/:id/materials", getProjectMaterialsHandler)
			auth.GET("/projects/:id", getProjectHandler) // Add route

			// Tasks
			auth.GET("/tasks", getTasksHandler)
			auth.PATCH("/tasks/:id/status", updateTaskStatusHandler)
			auth.POST("/tasks/:id/complete", completeTaskHandler)
			auth.DELETE("/tasks/:id", deleteTaskHandler)

			// Materials
			auth.POST("/materials", createMaterialHandler)
			auth.GET("/materials", getMaterialsHandler)
			auth.PUT("/materials/:id", updateMaterialHandler)
			auth.DELETE("/materials/:id", deleteMaterialHandler)
			auth.POST("/materials/:id/publish", publishMaterialHandler)

			// OSS Upload
			auth.GET("/oss/temp-token", getOSSTempTokenHandler)

			// LLM
			auth.POST("/llm/chat", llmChatHandler)

			// Organizations (for org_admin and super_admin)
			orgs := auth.Group("/organizations")
			{
				orgs.POST("", createOrganizationHandler)
				orgs.GET("", getOrganizationsHandler)
				orgs.GET("/:id", getOrganizationHandler)
				orgs.PUT("/:id", updateOrganizationHandler)
				orgs.DELETE("/:id", deleteOrganizationHandler)
				orgs.POST("/:id/recharge", rechargeOrganizationHandler)

				// Organization Members
				orgs.GET("/:id/members", getOrgMembersHandler)
				orgs.POST("/:id/members", addOrgMemberHandler)
				orgs.DELETE("/:id/members/:userId", removeOrgMemberHandler)

				// Billing Admin
				orgs.PUT("/:id/billing-admin", setBillingAdminHandler)

				// Organization Blacklist
				orgs.GET("/:id/blacklist", getOrgBlacklistHandler)
				orgs.POST("/:id/blacklist", addToOrgBlacklistHandler)
				orgs.DELETE("/:id/blacklist/:userId", removeFromOrgBlacklistHandler)
			}

			// Admin Routes (for super_admin only)
			admin := auth.Group("/admin")
			admin.Use(requireRole("super_admin"))
			{
				admin.PATCH("/users/:id/blacklist", setSystemBlacklistHandler)
			}

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
