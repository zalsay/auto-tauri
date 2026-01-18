package server

import (
	"github.com/gin-gonic/gin"
	"opencode-server/core/config"
)

func SetupRoutes(r *gin.Engine, cfg *config.Config) {
	api := r.Group("/api/v1")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status":  "healthy",
				"service": "opencode-server",
			})
		})
	}
}
