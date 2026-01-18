package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"
	"opencode-server/core/config"
	"opencode-server/core/handler"
	"opencode-server/core/middleware"
	"opencode-server/core/model"
	"opencode-server/core/omo"
	"opencode-server/core/omo/agents"
	"opencode-server/core/repository"
	runtime "opencode-server/core/runtime"
	"opencode-server/core/service"
	"opencode-server/core/storage"
	"opencode-server/pkg/sse"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	if err := storage.InitDB(&cfg.Database); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer storage.CloseDB()

	db := storage.GetDB()
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	if err := storage.InitOSS(&cfg.OSS); err != nil {
		log.Fatalf("Failed to initialize OSS: %v", err)
	}

	middleware.InitAuth(cfg.Auth.JWT.Secret)

	sse.InitBroker()
	broker := sse.GetBroker()

	r := gin.Default()

	r.Use(gin.Recovery())

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

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "healthy",
			"service": "opencode-server",
		})
	})

	handler.SetupSessionRoutes(r, db)
	handler.SetupSSERoutes(r, broker)

	toolCallRepo := repository.NewToolCallRepository(db)
	handler.SetupToolRoutes(r, toolCallRepo)

	skillRepo := repository.NewSkillRepository(db)
	skillLoader := runtime.NewSkillLoader("./skills/builtin", "./skills/custom")
	if err := skillLoader.Load(); err != nil {
		log.Printf("Warning: Failed to load skills: %v", err)
	}
	skillExecutor := runtime.NewSkillExecutor(skillLoader)
	handler.SetupSkillRoutes(r, skillLoader, skillExecutor, skillRepo)

	omoTaskRepo := repository.NewOmoTaskRepository(db)
	omoStepRepo := repository.NewOmoStepRepository(db)
	omoPlanRepo := repository.NewOmoPlanRepository(db)
	orchestrator := omo.NewOrchestrator(omoTaskRepo, omoStepRepo, omoPlanRepo, broker)
	orchestrator.RegisterAgent(agents.NewManagerAgent())
	orchestrator.RegisterAgent(agents.NewOracleAgent())
	orchestrator.RegisterAgent(agents.NewBuilderAgent())

	handler.SetupOmoRoutes(r, orchestrator)

	planRepo := repository.NewTaskPlanRepository(db)
	planSvc := service.NewPlanService(planRepo)
	handler.SetupPlanRoutes(r, planSvc)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Server starting on port %s", cfg.Server.Port)
		if err := r.Run(":" + cfg.Server.Port); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")
}
