package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"opencode-server/core/middleware"
	"opencode-server/core/repository"
	"opencode-server/core/service"
)

type SessionHandler struct {
	sessionSvc *service.SessionService
}

func NewSessionHandler(sessionSvc *service.SessionService) *SessionHandler {
	return &SessionHandler{
		sessionSvc: sessionSvc,
	}
}

type CreateSessionRequest struct {
	Agent      string                 `json:"agent" binding:"required"`
	ModelID    string                 `json:"modelId" binding:"required"`
	ProviderID string                 `json:"providerId" binding:"required"`
	System     string                 `json:"system"`
	Tools      map[string]interface{} `json:"tools"`
	MaxSteps   int                    `json:"maxSteps"`
	Cwd        string                 `json:"cwd"`
}

func (h *SessionHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req CreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	resp, err := h.sessionSvc.Create(userID, &service.CreateSessionRequest{
		Agent:      req.Agent,
		ModelID:    req.ModelID,
		ProviderID: req.ProviderID,
		System:     req.System,
		Tools:      req.Tools,
		MaxSteps:   req.MaxSteps,
		Cwd:        req.Cwd,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *SessionHandler) Get(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")
	resp, err := h.sessionSvc.GetByID(sessionID, userID)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *SessionHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	sessions, total, err := h.sessionSvc.ListByUserID(userID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  sessions,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *SessionHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")
	err := h.sessionSvc.Delete(sessionID, userID)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "session_deleted"})
}

func (h *SessionHandler) Abort(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")
	err := h.sessionSvc.Abort(sessionID, userID)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "session_aborted"})
}

func (h *SessionHandler) AddMessage(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")
	var req service.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	resp, err := h.sessionSvc.AddMessage(sessionID, userID, &req)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *SessionHandler) GetMessages(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}

	messages, total, err := h.sessionSvc.GetMessages(sessionID, userID, page, pageSize)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  messages,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func SetupSessionRoutes(r *gin.Engine, db *gorm.DB) {
	sessionRepo := repository.NewSessionRepository(db)
	messageRepo := repository.NewMessageRepository(db)
	toolCallRepo := repository.NewToolCallRepository(db)
	sessionSvc := service.NewSessionService(sessionRepo, messageRepo, toolCallRepo)
	sessionHandler := NewSessionHandler(sessionSvc)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.POST("/sessions", sessionHandler.Create)
		api.GET("/sessions", sessionHandler.List)
		api.GET("/sessions/:id", sessionHandler.Get)
		api.DELETE("/sessions/:id", sessionHandler.Delete)
		api.POST("/sessions/:id/abort", sessionHandler.Abort)
		api.POST("/sessions/:id/messages", sessionHandler.AddMessage)
		api.GET("/sessions/:id/messages", sessionHandler.GetMessages)
	}
}
