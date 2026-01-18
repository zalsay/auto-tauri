package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"opencode-server/core/middleware"
	"opencode-server/core/omo"
	"opencode-server/core/repository"
)

type OmoHandler struct {
	orchestrator *omo.Orchestrator
	taskRepo     *repository.OmoTaskRepository
	stepRepo     *repository.OmoStepRepository
	planRepo     *repository.OmoPlanRepository
}

func NewOmoHandler(orchestrator *omo.Orchestrator, taskRepo *repository.OmoTaskRepository, stepRepo *repository.OmoStepRepository, planRepo *repository.OmoPlanRepository) *OmoHandler {
	return &OmoHandler{
		orchestrator: orchestrator,
		taskRepo:     taskRepo,
		stepRepo:     stepRepo,
		planRepo:     planRepo,
	}
}

type CreateTaskRequest struct {
	SessionID string `json:"sessionId" binding:"required"`
	Goal      string `json:"goal" binding:"required"`
	MaxSteps  int    `json:"maxSteps"`
}

type TaskResponse struct {
	ID          string `json:"id"`
	SessionID   string `json:"sessionId"`
	UserID      string `json:"userId"`
	Goal        string `json:"goal"`
	Status      string `json:"status"`
	CurrentStep int    `json:"currentStep"`
	MaxSteps    int    `json:"maxSteps"`
	Result      string `json:"result,omitempty"`
	Summary     string `json:"summary,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

type StepResponse struct {
	ID          string `json:"id"`
	TaskID      string `json:"taskId"`
	SessionID   string `json:"sessionId"`
	Agent       string `json:"agent"`
	StepNumber  int    `json:"stepNumber"`
	Thought     string `json:"thought"`
	Action      string `json:"action"`
	Observation string `json:"observation"`
	Result      string `json:"result,omitempty"`
	Status      string `json:"status"`
}

func (h *OmoHandler) CreateTask(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	task, err := h.orchestrator.CreateTask(c.Request.Context(), req.SessionID, userID, req.Goal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_task"})
		return
	}

	c.JSON(http.StatusCreated, TaskResponse{
		ID:          task.ID,
		SessionID:   task.SessionID,
		UserID:      task.UserID,
		Goal:        task.Goal,
		Status:      task.Status,
		CurrentStep: task.CurrentStep,
		MaxSteps:    task.MaxSteps,
		Result:      task.Result,
		Summary:     task.Summary,
		CreatedAt:   task.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}

func (h *OmoHandler) StartTask(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	taskID := c.Param("id")

	task, err := h.taskRepo.GetByID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task_not_found"})
		return
	}

	if task.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access_denied"})
		return
	}

	if err := h.orchestrator.StartExecution(c.Request.Context(), taskID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_start_task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "task_started",
		"taskId":  taskID,
	})
}

func (h *OmoHandler) GetTask(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	taskID := c.Param("id")

	task, err := h.taskRepo.GetByID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task_not_found"})
		return
	}

	if task.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access_denied"})
		return
	}

	c.JSON(http.StatusOK, TaskResponse{
		ID:          task.ID,
		SessionID:   task.SessionID,
		UserID:      task.UserID,
		Goal:        task.Goal,
		Status:      task.Status,
		CurrentStep: task.CurrentStep,
		MaxSteps:    task.MaxSteps,
		Result:      task.Result,
		Summary:     task.Summary,
		CreatedAt:   task.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}

func (h *OmoHandler) ListTasks(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	tasks, total := h.taskRepo.GetByUserID(userID, 100, 0)

	responses := make([]TaskResponse, len(tasks))
	for i, task := range tasks {
		responses[i] = TaskResponse{
			ID:          task.ID,
			SessionID:   task.SessionID,
			UserID:      task.UserID,
			Goal:        task.Goal,
			Status:      task.Status,
			CurrentStep: task.CurrentStep,
			MaxSteps:    task.MaxSteps,
			Result:      task.Result,
			Summary:     task.Summary,
			CreatedAt:   task.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"total": total,
	})
}

func (h *OmoHandler) GetTaskSteps(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	taskID := c.Param("id")

	task, err := h.taskRepo.GetByID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task_not_found"})
		return
	}

	if task.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access_denied"})
		return
	}

	steps, err := h.stepRepo.GetByTaskID(taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_get_steps"})
		return
	}

	responses := make([]StepResponse, len(steps))
	for i, step := range steps {
		responses[i] = StepResponse{
			ID:          step.ID,
			TaskID:      step.TaskID,
			SessionID:   step.SessionID,
			Agent:       step.Agent,
			StepNumber:  step.StepNumber,
			Thought:     step.Thought,
			Action:      step.Action,
			Observation: step.Observation,
			Result:      step.Result,
			Status:      step.Status,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"steps": responses,
		"count": len(responses),
	})
}

func (h *OmoHandler) DeleteTask(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	taskID := c.Param("id")

	task, err := h.taskRepo.GetByID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task_not_found"})
		return
	}

	if task.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access_denied"})
		return
	}

	if err := h.taskRepo.Delete(taskID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_delete_task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task_deleted"})
}

func (h *OmoHandler) GetAgents(c *gin.Context) {
	agents := []gin.H{
		{
			"name":        "manager",
			"description": "Planning and coordination agent. Breaks down goals into actionable steps and validates results.",
		},
		{
			"name":        "oracle",
			"description": "Information retrieval and knowledge agent. Searches, analyzes, and provides insights.",
		},
		{
			"name":        "builder",
			"description": "Code generation and file manipulation agent. Creates, edits, and manages files.",
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"agents": agents,
		"count":  len(agents),
	})
}

func SetupOmoRoutes(r *gin.Engine, orchestrator *omo.Orchestrator) {
	taskRepo := &repository.OmoTaskRepository{}
	stepRepo := &repository.OmoStepRepository{}
	planRepo := &repository.OmoPlanRepository{}

	omoHandler := NewOmoHandler(orchestrator, taskRepo, stepRepo, planRepo)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/omo/agents", omoHandler.GetAgents)
		api.POST("/omo/tasks", omoHandler.CreateTask)
		api.GET("/omo/tasks", omoHandler.ListTasks)
		api.GET("/omo/tasks/:id", omoHandler.GetTask)
		api.POST("/omo/tasks/:id/start", omoHandler.StartTask)
		api.GET("/omo/tasks/:id/steps", omoHandler.GetTaskSteps)
		api.DELETE("/omo/tasks/:id", omoHandler.DeleteTask)
	}
}
