package agents

import (
	"context"
	"fmt"
	"strings"
	"time"

	"opencode-server/core/model"
	"opencode-server/core/omo"
)

type ManagerAgent struct {
	name        string
	description string
}

func NewManagerAgent() *ManagerAgent {
	return &ManagerAgent{
		name:        "manager",
		description: "Planning and coordination agent. Breaks down goals into actionable steps and validates results.",
	}
}

func (a *ManagerAgent) Name() string {
	return a.name
}

func (a *ManagerAgent) Description() string {
	return a.description
}

func (a *ManagerAgent) Execute(ctx context.Context, step *model.OmoStep, task *model.OmoTask) (*omo.AgentResult, error) {
	thought := fmt.Sprintf("Analyzing task goal: %s", task.Goal)
	action := "planning"
	observation := fmt.Sprintf("Step %d: Manager agent planning execution strategy", step.StepNumber)

	goal := strings.ToLower(task.Goal)

	var nextSteps []string
	var shouldFinish bool
	var result string

	if strings.Contains(goal, "create") || strings.Contains(goal, "build") || strings.Contains(goal, "make") {
		result = fmt.Sprintf("Manager planning: Create new resource based on goal '%s'", task.Goal)
		nextSteps = []string{"builder", "oracle"}
		observation += "\nIdentified: Creation task. Delegating to Builder agent."
	} else if strings.Contains(goal, "find") || strings.Contains(goal, "search") || strings.Contains(goal, "get") {
		result = fmt.Sprintf("Manager planning: Search for information about '%s'", task.Goal)
		nextSteps = []string{"oracle", "builder"}
		observation += "\nIdentified: Search task. Delegating to Oracle agent."
	} else if strings.Contains(goal, "analyze") || strings.Contains(goal, "review") || strings.Contains(goal, "check") {
		result = fmt.Sprintf("Manager planning: Review and analyze '%s'", task.Goal)
		nextSteps = []string{"oracle", "manager"}
		observation += "\nIdentified: Analysis task. Delegating to Oracle agent."
	} else if strings.Contains(goal, "fix") || strings.Contains(goal, "repair") || strings.Contains(goal, "resolve") {
		result = fmt.Sprintf("Manager planning: Fix issue described in '%s'", task.Goal)
		nextSteps = []string{"builder", "oracle"}
		observation += "\nIdentified: Fix task. Delegating to Builder agent."
	} else {
		result = fmt.Sprintf("Manager planning: Execute task '%s'", task.Goal)
		nextSteps = []string{"builder"}
		observation += "\nGeneral task. Delegating to Builder agent."
	}

	if step.StepNumber >= task.MaxSteps-1 {
		shouldFinish = true
		result += "\nManager Note: Approaching maximum steps. Finalizing execution."
	}

	time.Sleep(100 * time.Millisecond)

	return &omo.AgentResult{
		Success:      true,
		Thought:      thought,
		Action:       action,
		Observation:  observation,
		Result:       result,
		NextSteps:    nextSteps,
		ShouldFinish: shouldFinish,
		Metadata: map[string]string{
			"agent": a.name,
			"phase": "planning",
		},
	}, nil
}
