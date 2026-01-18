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

type OracleAgent struct {
	name        string
	description string
}

func NewOracleAgent() *OracleAgent {
	return &OracleAgent{
		name:        "oracle",
		description: "Information retrieval and knowledge agent. Searches, analyzes, and provides insights.",
	}
}

func (a *OracleAgent) Name() string {
	return a.name
}

func (a *OracleAgent) Description() string {
	return a.description
}

func (a *OracleAgent) Execute(ctx context.Context, step *model.OmoStep, task *model.OmoTask) (*omo.AgentResult, error) {
	thought := fmt.Sprintf("Searching for information related to: %s", task.Goal)
	action := "search"
	observation := fmt.Sprintf("Oracle Step %d: Gathering information", step.StepNumber)

	goal := strings.ToLower(task.Goal)
	var result string
	var searchResults []string
	var shouldFinish bool

	if strings.Contains(goal, "search") || strings.Contains(goal, "find") {
		query := extractQuery(goal)
		searchResults = append(searchResults, fmt.Sprintf("Searching for: %s", query))

		cmd := exec.Command("bash", "-c", fmt.Sprintf("grep -r '%s' . --include='*.go' --include='*.md' 2>/dev/null | head -10", escapeShell(query)))
		output, _ := cmd.Output()
		if len(output) > 0 {
			searchResults = append(searchResults, fmt.Sprintf("Found matches:\n%s", string(output)))
		} else {
			searchResults = append(searchResults, "No direct matches found in codebase")
		}

		result = fmt.Sprintf("Oracle completed search for '%s'", query)
		observation += fmt.Sprintf("\nSearch completed for query: %s", query)
	} else if strings.Contains(goal, "explain") || strings.Contains(goal, "what is") {
		topic := extractTopic(goal)
		result = fmt.Sprintf("Oracle analysis: %s\n\nThe topic '%s' relates to the current task workflow.", topic, topic)
		searchResults = append(searchResults, fmt.Sprintf("Analysis of: %s", topic))
		observation += "\nProvided explanation and context"
	} else if strings.Contains(goal, "list") || strings.Contains(goal, "show") {
		result = "Oracle listing available resources and information"
		cmd := exec.Command("bash", "-c", "find . -type f -name '*.go' 2>/dev/null | head -20")
		output, _ := cmd.Output()
		searchResults = append(searchResults, fmt.Sprintf("Go files in project:\n%s", string(output)))
		observation += "\nListed project resources"
	} else {
		result = fmt.Sprintf("Oracle analyzed: %s", task.Goal)
		searchResults = append(searchResults, "General analysis completed")
		observation += "\nProvided general information and context"
	}

	if step.StepNumber >= task.MaxSteps-1 {
		shouldFinish = true
	}

	time.Sleep(150 * time.Millisecond)

	return &omo.AgentResult{
		Success:      true,
		Thought:      thought,
		Action:       action,
		Observation:  observation,
		Result:       result,
		NextSteps:    []string{"builder"},
		ShouldFinish: shouldFinish,
		Metadata: map[string]string{
			"agent":         a.name,
			"phase":         "information_gathering",
			"searchResults": strings.Join(searchResults, "\n"),
		},
	}, nil
}

func extractQuery(goal string) string {
	goal = strings.ReplaceAll(goal, "search for", "")
	goal = strings.ReplaceAll(goal, "find", "")
	goal = strings.ReplaceAll(goal, "look up", "")
	return strings.TrimSpace(goal)
}

func extractTopic(goal string) string {
	goal = strings.ReplaceAll(goal, "explain", "")
	goal = strings.ReplaceAll(goal, "what is", "")
	goal = strings.ReplaceAll(goal, "tell me about", "")
	return strings.TrimSpace(goal)
}

func escapeShell(s string) string {
	return strings.ReplaceAll(s, "'", "'\\''")
}
