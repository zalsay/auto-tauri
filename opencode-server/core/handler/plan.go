package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"opencode-server/core/middleware"
	"opencode-server/core/service"
)

type PlanHandler struct {
	planSvc *service.PlanService
}

func NewPlanHandler(planSvc *service.PlanService) *PlanHandler {
	return &PlanHandler{
		planSvc: planSvc,
	}
}

type GeneratePlanRequest struct {
	SessionID  string `json:"sessionId" binding:"required"`
	Goal       string `json:"goal" binding:"required"`
	Context    string `json:"context,omitempty"`
	ModelID    string `json:"modelId,omitempty"`
	ProviderID string `json:"providerId,omitempty"`
}

func (h *PlanHandler) GeneratePlan(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req GeneratePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	if req.Goal == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "goal_is_required", "message": "Goal cannot be empty"})
		return
	}

	if len(req.Goal) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "goal_too_short", "message": "Goal must be at least 3 characters"})
		return
	}

	plan, err := h.planSvc.GeneratePlan(userID, &service.GeneratePlanRequest{
		SessionID:  req.SessionID,
		Goal:       req.Goal,
		Context:    req.Context,
		ModelID:    req.ModelID,
		ProviderID: req.ProviderID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_generate_plan", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"plan":    plan.Plan,
		"planId":  plan.ID,
		"goal":    plan.Goal,
		"summary": plan.Summary,
	})
}

func (h *PlanHandler) GetPlan(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	planID := c.Param("id")

	plan, err := h.planSvc.GetPlan(planID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plan_not_found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":    plan.Plan,
		"planId":  plan.ID,
		"goal":    plan.Goal,
		"summary": plan.Summary,
		"created": plan.CreatedAt,
	})
}

func (h *PlanHandler) GetLatestPlan(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Query("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId_required"})
		return
	}

	plan, err := h.planSvc.GetLatestPlan(sessionID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plan_not_found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":    plan.Plan,
		"planId":  plan.ID,
		"goal":    plan.Goal,
		"summary": plan.Summary,
		"created": plan.CreatedAt,
	})
}

func (h *PlanHandler) CheckPlan(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Query("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId_required"})
		return
	}

	hasPlan, err := h.planSvc.HasPlan(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "check_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hasPlan": hasPlan,
	})
}

func (h *PlanHandler) GetPlanPreview(c *gin.Context) {
	goal := c.Query("goal")
	if goal == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "goal_required"})
		return
	}

	plan := h.planSvc.AnalyzeAndGeneratePlan(goal)

	c.JSON(http.StatusOK, gin.H{
		"plan":    plan,
		"goal":    goal,
		"preview": true,
	})
}

func SetupPlanRoutes(r *gin.Engine, planSvc *service.PlanService) {
	planHandler := NewPlanHandler(planSvc)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.POST("/task/plan", planHandler.GeneratePlan)
		api.GET("/task/plan/:id", planHandler.GetPlan)
		api.GET("/task/plan", planHandler.GetLatestPlan)
		api.GET("/task/plan/check", planHandler.CheckPlan)
	}

	preview := r.Group("/api/v1/preview")
	{
		preview.GET("/task/plan", planHandler.GetPlanPreview)
	}
}
