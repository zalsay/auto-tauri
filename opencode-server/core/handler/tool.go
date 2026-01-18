package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"opencode-server/core/middleware"
	"opencode-server/core/model"
	"opencode-server/core/repository"
)

type ToolHandler struct {
	toolCallRepo *repository.ToolCallRepository
}

func NewToolHandler(toolCallRepo *repository.ToolCallRepository) *ToolHandler {
	return &ToolHandler{
		toolCallRepo: toolCallRepo,
	}
}

type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

var builtinTools = []ToolDefinition{
	{
		Name:        "bash",
		Description: "Execute a bash command and return the output",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"command": map[string]interface{}{
					"type":        "string",
					"description": "The bash command to execute",
				},
			},
			"required": []string{"command"},
		},
	},
	{
		Name:        "read",
		Description: "Read the contents of a file",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"path": map[string]interface{}{
					"type":        "string",
					"description": "Path to the file to read",
				},
			},
			"required": []string{"path"},
		},
	},
	{
		Name:        "write",
		Description: "Write content to a file",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"path": map[string]interface{}{
					"type":        "string",
					"description": "Path to the file to write",
				},
				"content": map[string]interface{}{
					"type":        "string",
					"description": "Content to write to the file",
				},
			},
			"required": []string{"path", "content"},
		},
	},
	{
		Name:        "edit",
		Description: "Edit a file by replacing text",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"path": map[string]interface{}{
					"type":        "string",
					"description": "Path to the file to edit",
				},
				"find": map[string]interface{}{
					"type":        "string",
					"description": "Text to find",
				},
				"replace": map[string]interface{}{
					"type":        "string",
					"description": "Text to replace with",
				},
			},
			"required": []string{"path", "find", "replace"},
		},
	},
	{
		Name:        "glob",
		Description: "Find files matching a glob pattern",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"pattern": map[string]interface{}{
					"type":        "string",
					"description": "Glob pattern (e.g., **/*.go)",
				},
			},
			"required": []string{"pattern"},
		},
	},
	{
		Name:        "grep",
		Description: "Search for text in files",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"pattern": map[string]interface{}{
					"type":        "string",
					"description": "Regular expression pattern to search for",
				},
				"path": map[string]interface{}{
					"type":        "string",
					"description": "Path to search in (default: current directory)",
				},
			},
			"required": []string{"pattern"},
		},
	},
}

func (h *ToolHandler) ListTools(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"tools": builtinTools,
		"count": len(builtinTools),
	})
}

func (h *ToolHandler) ExecuteTool(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Tool      string                 `json:"tool" binding:"required"`
		SessionID string                 `json:"sessionId"`
		MessageID string                 `json:"messageId"`
		Args      map[string]interface{} `json:"args"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "details": err.Error()})
		return
	}

	toolCall := &model.ToolCall{
		ID:        uuid.NewString(),
		SessionID: req.SessionID,
		MessageID: req.MessageID,
		Tool:      req.Tool,
		CallID:    uuid.NewString(),
		State:     "running",
		Input:     toJSON(req.Args),
		StartTime: time.Now(),
	}

	h.toolCallRepo.Create(toolCall)

	result, err := h.executeTool(req.Tool, req.Args)
	toolCall.EndTime = time.Now()

	if err != nil {
		toolCall.State = "error"
		toolCall.Error = err.Error()
		toolCall.Output = result
		h.toolCallRepo.UpdateState(toolCall.ID, "error", result, err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success":    false,
			"toolCallId": toolCall.ID,
			"error":      err.Error(),
			"output":     result,
		})
		return
	}

	toolCall.State = "completed"
	toolCall.Output = result
	h.toolCallRepo.UpdateState(toolCall.ID, "completed", result, "")

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"toolCallId": toolCall.ID,
		"output":     result,
	})
}

func (h *ToolHandler) executeTool(tool string, args map[string]interface{}) (string, error) {
	switch tool {
	case "bash":
		return h.executeBash(args)
	case "read":
		return h.executeRead(args)
	case "write":
		return h.executeWrite(args)
	case "edit":
		return h.executeEdit(args)
	case "glob":
		return h.executeGlob(args)
	case "grep":
		return h.executeGrep(args)
	default:
		return "", fmt.Errorf("unknown tool: %s", tool)
	}
}

func (h *ToolHandler) executeBash(args map[string]interface{}) (string, error) {
	command, ok := args["command"].(string)
	if !ok {
		return "", fmt.Errorf("bash: command is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", command)
	output, err := cmd.CombinedOutput()

	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("bash: command timed out")
	}

	if err != nil {
		return string(output), fmt.Errorf("bash: %w", err)
	}

	return string(output), nil
}

func (h *ToolHandler) executeRead(args map[string]interface{}) (string, error) {
	path, ok := args["path"].(string)
	if !ok {
		return "", fmt.Errorf("read: path is required")
	}

	content, err := exec.Command("cat", path).Output()
	if err != nil {
		return "", fmt.Errorf("read: %w", err)
	}

	return string(content), nil
}

func (h *ToolHandler) executeWrite(args map[string]interface{}) (string, error) {
	path, ok := args["path"].(string)
	if !ok {
		return "", fmt.Errorf("write: path is required")
	}

	content, ok := args["content"].(string)
	if !ok {
		return "", fmt.Errorf("write: content is required")
	}

	cmd := exec.Command("bash", "-c", fmt.Sprintf("echo '%s' > %s", escapeSingleQuotes(content), path))
	_, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("write: %w", err)
	}

	return fmt.Sprintf("File written to %s", path), nil
}

func (h *ToolHandler) executeEdit(args map[string]interface{}) (string, error) {
	path, ok := args["path"].(string)
	if !ok {
		return "", fmt.Errorf("edit: path is required")
	}

	find, ok := args["find"].(string)
	if !ok {
		return "", fmt.Errorf("edit: find is required")
	}

	replace, ok := args["replace"].(string)
	if !ok {
		return "", fmt.Errorf("edit: replace is required")
	}

	content, err := exec.Command("cat", path).Output()
	if err != nil {
		return "", fmt.Errorf("edit: failed to read file: %w", err)
	}

	oldContent := string(content)
	newContent := strings.Replace(oldContent, find, replace, 1)

	if newContent == oldContent {
		return "", fmt.Errorf("edit: pattern not found")
	}

	cmd := exec.Command("bash", "-c", fmt.Sprintf("echo '%s' > %s", escapeSingleQuotes(newContent), path))
	_, err = cmd.Output()
	if err != nil {
		return "", fmt.Errorf("edit: failed to write file: %w", err)
	}

	return fmt.Sprintf("File edited: %s", path), nil
}

func (h *ToolHandler) executeGlob(args map[string]interface{}) (string, error) {
	pattern, ok := args["pattern"].(string)
	if !ok {
		pattern = "**/*"
	}

	cmd := exec.Command("bash", "-c", fmt.Sprintf("find . -type f -name '%s' 2>/dev/null | head -100", pattern))
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("glob: %w", err)
	}

	return string(output), nil
}

func (h *ToolHandler) executeGrep(args map[string]interface{}) (string, error) {
	pattern, ok := args["pattern"].(string)
	if !ok {
		return "", fmt.Errorf("grep: pattern is required")
	}

	path, _ := args["path"].(string)
	if path == "" {
		path = "."
	}

	cmd := exec.Command("bash", "-c", fmt.Sprintf("grep -rn --include='*.go' --include='*.md' --include='*.txt' --include='*.json' '%s' %s 2>/dev/null | head -50", escapeSingleQuotes(pattern), path))
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("grep: %w", err)
	}

	return string(output), nil
}

func SetupToolRoutes(r *gin.Engine, toolCallRepo *repository.ToolCallRepository) {
	toolHandler := NewToolHandler(toolCallRepo)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/tools", toolHandler.ListTools)
		api.POST("/tools/execute", toolHandler.ExecuteTool)
	}
}

func toJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func escapeSingleQuotes(s string) string {
	return strings.ReplaceAll(s, "'", "'\\''")
}

type GrepResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Content string `json:"content"`
}

func parseGrepOutput(output string) []GrepResult {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	results := make([]GrepResult, 0, len(lines))

	for _, line := range lines {
		parts := strings.SplitN(line, ":", 3)
		if len(parts) >= 3 {
			var lineNum int
			fmt.Sscanf(parts[1], "%d", &lineNum)
			results = append(results, GrepResult{
				Path:    parts[0],
				Line:    lineNum,
				Content: parts[2],
			})
		}
	}

	return results
}

var pathPattern = regexp.MustCompile(`^[a-zA-Z0-9_./-]+$`)

func isValidPath(path string) bool {
	return pathPattern.MatchString(path) && !strings.Contains(path, "..")
}
