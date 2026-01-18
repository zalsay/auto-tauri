package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"opencode-server/core/middleware"
	"opencode-server/core/model"
	"opencode-server/core/repository"
	runtime "opencode-server/core/runtime"
)

type SkillHandler struct {
	skillLoader   *runtime.SkillLoader
	skillExecutor *runtime.SkillExecutor
	skillRepo     *repository.SkillRepository
}

func NewSkillHandler(skillLoader *runtime.SkillLoader, skillExecutor *runtime.SkillExecutor, skillRepo *repository.SkillRepository) *SkillHandler {
	return &SkillHandler{
		skillLoader:   skillLoader,
		skillExecutor: skillExecutor,
		skillRepo:     skillRepo,
	}
}

func (h *SkillHandler) ListSkills(c *gin.Context) {
	skills := h.skillLoader.ListSkills()
	c.JSON(http.StatusOK, gin.H{
		"skills": skills,
		"count":  len(skills),
	})
}

func (h *SkillHandler) GetSkill(c *gin.Context) {
	skillID := c.Param("id")

	skill, err := h.skillLoader.GetSkill(skillID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill_not_found"})
		return
	}

	c.JSON(http.StatusOK, skill)
}

func (h *SkillHandler) ExecuteSkill(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	skillID := c.Param("id")

	var args map[string]interface{}
	if err := c.ShouldBindJSON(&args); err != nil && err.Error() != "EOF" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	skillCtx := runtime.SkillContext{
		SessionID: "",
		Cwd:       "/tmp/opencode",
		Tools: runtime.SkillTools{
			Read: func(path string) (string, error) {
				return "", nil
			},
			Write: func(path string, content string) error {
				return nil
			},
			Bash: func(command string) (string, error) {
				return "", nil
			},
			Glob: func(pattern string) ([]string, error) {
				return nil, nil
			},
			Grep: func(pattern string) ([]string, error) {
				return nil, nil
			},
		},
	}

	result := h.skillExecutor.Execute(c.Request.Context(), skillID, args, skillCtx)

	if !result.Success {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":    "skill_execution_failed",
			"message":  result.Error,
			"duration": result.Duration,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"output":   result.Output,
		"duration": result.Duration,
	})
}

func (h *SkillHandler) RegisterSkill(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var skill runtime.Skill
	if err := c.ShouldBindJSON(&skill); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	if err := h.skillLoader.RegisterSkill(&skill); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_register_skill"})
		return
	}

	c.JSON(http.StatusCreated, skill)
}

func (h *SkillHandler) UnregisterSkill(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	skillID := c.Param("id")

	if err := h.skillLoader.UnregisterSkill(skillID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill_not_found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "skill_unregistered"})
}

func SetupSkillRoutes(r *gin.Engine, skillLoader *runtime.SkillLoader, skillExecutor *runtime.SkillExecutor, skillRepo *repository.SkillRepository) {
	skillHandler := NewSkillHandler(skillLoader, skillExecutor, skillRepo)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/skills", skillHandler.ListSkills)
		api.GET("/skills/:id", skillHandler.GetSkill)
		api.POST("/skills/:id/execute", skillHandler.ExecuteSkill)
		api.POST("/skills", skillHandler.RegisterSkill)
		api.DELETE("/skills/:id", skillHandler.UnregisterSkill)
	}
}

type SkillResponse struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Version     string                 `json:"version"`
	Author      string                 `json:"author,omitempty"`
	Tags        []string               `json:"tags,omitempty"`
	Parameters  map[string]interface{} `json:"parameters"`
	Handler     string                 `json:"handler"`
	Code        string                 `json:"code"`
	Permissions map[string]interface{} `json:"permissions,omitempty"`
	IsBuiltin   bool                   `json:"isBuiltin"`
	IsActive    bool                   `json:"isActive"`
}

func ModelSkillToResponse(skill *model.Skill) *SkillResponse {
	return &SkillResponse{
		ID:          skill.ID,
		Name:        skill.Name,
		Description: skill.Description,
		Version:     skill.Version,
		Author:      skill.Author,
		Handler:     skill.Handler,
		Code:        skill.Code,
		IsBuiltin:   skill.IsBuiltin,
		IsActive:    skill.IsActive,
	}
}
