package omo

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"opencode-server/core/model"
	"opencode-server/core/repository"
	"opencode-server/pkg/sse"
)

type Agent interface {
	Name() string
	Description() string
	Execute(ctx context.Context, step *model.OmoStep, task *model.OmoTask) (*AgentResult, error)
}

type AgentResult struct {
	Success      bool              `json:"success"`
	Thought      string            `json:"thought"`
	Action       string            `json:"action"`
	Observation  string            `json:"observation"`
	Result       string            `json:"result,omitempty"`
	NextSteps    []string          `json:"nextSteps,omitempty"`
	ShouldFinish bool              `json:"shouldFinish"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

type Orchestrator struct {
	taskRepo *repository.OmoTaskRepository
	stepRepo *repository.OmoStepRepository
	planRepo *repository.OmoPlanRepository
	broker   *sse.Broker
	agents   map[string]Agent
	maxSteps int
}

func NewOrchestrator(taskRepo *repository.OmoTaskRepository, stepRepo *repository.OmoStepRepository, planRepo *repository.OmoPlanRepository, broker *sse.Broker) *Orchestrator {
	return &Orchestrator{
		taskRepo: taskRepo,
		stepRepo: stepRepo,
		planRepo: planRepo,
		broker:   broker,
		agents:   make(map[string]Agent),
		maxSteps: 50,
	}
}

func (o *Orchestrator) RegisterAgent(agent Agent) {
	o.agents[agent.Name()] = agent
}

func (o *Orchestrator) CreateTask(ctx context.Context, sessionID, userID, goal string) (*model.OmoTask, error) {
	task := &model.OmoTask{
		ID:        uuid.NewString(),
		SessionID: sessionID,
		UserID:    userID,
		Goal:      goal,
		Status:    "planning",
		MaxSteps:  o.maxSteps,
	}

	if err := o.taskRepo.Create(task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	o.broadcastEvent(sessionID, "task_created", task)

	return task, nil
}

func (o *Orchestrator) StartExecution(ctx context.Context, taskID string) error {
	task, err := o.taskRepo.GetByID(taskID)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	task.Status = "executing"
	o.taskRepo.Update(task)

	o.broadcastEvent(task.SessionID, "task_started", task)

	go o.runSisyphusLoop(ctx, task)

	return nil
}

func (o *Orchestrator) runSisyphusLoop(ctx context.Context, task *model.OmoTask) {
	defer func() {
		task.Status = "completed"
		if err := o.taskRepo.Update(task); err != nil {
			log.Printf("Failed to update task status: %v", err)
		}
		o.broadcastEvent(task.SessionID, "task_completed", task)
	}()

	for task.CurrentStep < task.MaxSteps {
		select {
		case <-ctx.Done():
			task.Status = "cancelled"
			return
		default:
		}

		step := &model.OmoStep{
			ID:         uuid.NewString(),
			TaskID:     task.ID,
			SessionID:  task.SessionID,
			StepNumber: task.CurrentStep + 1,
			Status:     "pending",
		}

		if err := o.stepRepo.Create(step); err != nil {
			log.Printf("Failed to create step: %v", err)
			continue
		}

		result, err := o.executeStep(ctx, step, task)
		if err != nil {
			log.Printf("Step execution failed: %v", err)
			step.Status = "error"
			step.Result = err.Error()
			o.stepRepo.Update(step)
			continue
		}

		step.Thought = result.Thought
		step.Action = result.Action
		step.Observation = result.Observation
		step.Result = result.Result
		step.Status = "completed"
		if err := o.stepRepo.Update(step); err != nil {
			log.Printf("Failed to update step: %v", err)
		}

		task.CurrentStep++
		o.taskRepo.Update(task)

		o.broadcastEvent(task.SessionID, "step_completed", gin.H{
			"taskId":   task.ID,
			"step":     step,
			"result":   result,
			"progress": fmt.Sprintf("%d/%d", task.CurrentStep, task.MaxSteps),
		})

		if result.ShouldFinish {
			task.Result = result.Result
			task.Summary = fmt.Sprintf("Task completed in %d steps", task.CurrentStep)
			return
		}

		time.Sleep(500 * time.Millisecond)
	}

	task.Status = "max_steps_exceeded"
	task.Summary = fmt.Sprintf("Task reached maximum steps (%d)", task.MaxSteps)
}

func (o *Orchestrator) executeStep(ctx context.Context, step *model.OmoStep, task *model.OmoTask) (*AgentResult, error) {
	agents := o.selectAgents(task.Goal, step.StepNumber)

	for _, agentName := range agents {
		agent, ok := o.agents[agentName]
		if !ok {
			continue
		}

		o.broadcastEvent(task.SessionID, "agent_thinking", gin.H{
			"taskId":  task.ID,
			"step":    step.StepNumber,
			"agent":   agentName,
			"thought": "Analyzing task and planning action...",
		})

		result, err := agent.Execute(ctx, step, task)
		if err != nil {
			log.Printf("Agent %s failed: %v", agentName, err)
			continue
		}

		o.broadcastEvent(task.SessionID, "agent_acted", gin.H{
			"taskId":      task.ID,
			"step":        step.StepNumber,
			"agent":       agentName,
			"action":      result.Action,
			"observation": result.Observation,
		})

		return result, nil
	}

	return &AgentResult{
		Success:     false,
		Thought:     "No agent could handle this step",
		Observation: "All agents failed to process this step",
	}, fmt.Errorf("no agent available for step")
}

func (o *Orchestrator) selectAgents(goal string, stepNumber int) []string {
	if stepNumber == 1 {
		return []string{"manager"}
	}

	if contains(goal, []string{"search", "find", "lookup", "query", "retrieve"}) {
		return []string{"oracle", "builder"}
	}

	if contains(goal, []string{"create", "write", "edit", "modify", "generate", "build"}) {
		return []string{"builder", "oracle"}
	}

	if contains(goal, []string{"review", "check", "verify", "validate", "analyze"}) {
		return []string{"oracle", "manager"}
	}

	return []string{"builder", "oracle", "manager"}
}

func (o *Orchestrator) broadcastEvent(sessionID, eventType string, data interface{}) {
	event := sse.NewEvent(eventType, data)
	event.ID = uuid.NewString()
	o.broker.SendToClient(sessionID, event)
}

func contains(s string, substrings []string) bool {
	lowerS := s
	for _, sub := range substrings {
		if len(lowerS) >= len(sub) {
			return true
		}
	}
	return false
}

func ToJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}
