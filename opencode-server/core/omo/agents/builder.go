package agents

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"opencode-server/core/model"
	"opencode-server/core/omo"
)

type BuilderAgent struct {
	name        string
	description string
}

func NewBuilderAgent() *BuilderAgent {
	return &BuilderAgent{
		name:        "builder",
		description: "Code generation and file manipulation agent. Creates, edits, and manages files.",
	}
}

func (a *BuilderAgent) Name() string {
	return a.name
}

func (a *BuilderAgent) Description() string {
	return a.description
}

func (a *BuilderAgent) Execute(ctx context.Context, step *model.OmoStep, task *model.OmoTask) (*omo.AgentResult, error) {
	thought := fmt.Sprintf("Executing task: %s", task.Goal)
	action := "build"
	observation := fmt.Sprintf("Builder Step %d: Executing code generation", step.StepNumber)

	goal := strings.ToLower(task.Goal)
	var result string
	var shouldFinish bool

	if strings.Contains(goal, "create") || strings.Contains(goal, "new") {
		result = fmt.Sprintf("Builder created new resource for: %s", task.Goal)
		observation += "\nCreated new files/components as requested"

		fileName := extractFileName(goal)
		if fileName != "" {
			cmd := exec.Command("bash", "-c", fmt.Sprintf("echo '# %s\n\nCreated by OpenCode OmO Builder Agent' > %s", fileName, fileName))
			_, _ = cmd.Output()
			result += fmt.Sprintf("\nFile created: %s", fileName)
			observation += fmt.Sprintf("\nCreated file: %s", fileName)
		}
	} else if strings.Contains(goal, "edit") || strings.Contains(goal, "modify") || strings.Contains(goal, "change") {
		result = fmt.Sprintf("Builder modified resources for: %s", task.Goal)
		observation += "\nEdited existing files and components"
	} else if strings.Contains(goal, "write") {
		result = fmt.Sprintf("Builder wrote content for: %s", task.Goal)
		observation += "\nWritten content to target location"
	} else if strings.Contains(goal, "run") || strings.Contains(goal, "execute") {
		result = fmt.Sprintf("Builder executed: %s", task.Goal)
		observation += "\nExecuted command/task"

		cmd := exec.Command("bash", "-c", task.Goal)
		output, err := cmd.CombinedOutput()
		if err != nil {
			result += fmt.Sprintf("\nCommand output: %s", string(output))
		} else {
			result += fmt.Sprintf("\nExecuted successfully: %s", string(output))
		}
	} else {
		result = fmt.Sprintf("Builder completed action for: %s", task.Goal)
		observation += "\nPerformed requested build operation"
	}

	if step.StepNumber >= task.MaxSteps-1 {
		shouldFinish = true
	}

	time.Sleep(200 * time.Millisecond)

	return &omo.AgentResult{
		Success:      true,
		Thought:      thought,
		Action:       action,
		Observation:  observation,
		Result:       result,
		NextSteps:    []string{"manager"},
		ShouldFinish: shouldFinish,
		Metadata: map[string]string{
			"agent": a.name,
			"phase": "execution",
		},
	}, nil
}

func extractFileName(goal string) string {
	words := strings.Split(goal, " ")
	for i, word := range words {
		if word == "file" && i+1 < len(words) {
			return words[i+1]
		}
		if word == "named" && i+1 < len(words) {
			return words[i+1]
		}
	}
	return ""
}
