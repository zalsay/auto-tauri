package skill

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Skill struct {
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
	CreatedAt   time.Time              `json:"createdAt"`
	UpdatedAt   time.Time              `json:"updatedAt"`
}

type SkillContext struct {
	SessionID string
	Cwd       string
	Tools     SkillTools
}

type SkillTools struct {
	Read  func(path string) (string, error)
	Write func(path string, content string) error
	Bash  func(command string) (string, error)
	Glob  func(pattern string) ([]string, error)
	Grep  func(pattern string) ([]string, error)
}

type SkillResult struct {
	Success  bool        `json:"success"`
	Output   interface{} `json:"output"`
	Error    string      `json:"error,omitempty"`
	Duration int64       `json:"durationMs"`
}

type SkillLoader struct {
	builtinDir string
	customDir  string
	skills     map[string]*Skill
}

func NewSkillLoader(builtinDir, customDir string) *SkillLoader {
	return &SkillLoader{
		builtinDir: builtinDir,
		customDir:  customDir,
		skills:     make(map[string]*Skill),
	}
}

func (l *SkillLoader) Load() error {
	if err := l.loadBuiltinSkills(); err != nil {
		return fmt.Errorf("failed to load builtin skills: %w", err)
	}

	if err := l.loadCustomSkills(); err != nil {
		return fmt.Errorf("failed to load custom skills: %w", err)
	}

	return nil
}

func (l *SkillLoader) loadBuiltinSkills() error {
	entries, err := os.ReadDir(l.builtinDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillFile := filepath.Join(l.builtinDir, entry.Name(), "skill.json")
		data, err := os.ReadFile(skillFile)
		if err != nil {
			continue
		}

		var skill Skill
		if err := json.Unmarshal(data, &skill); err != nil {
			continue
		}

		skill.IsBuiltin = true
		skill.IsActive = true
		l.skills[skill.ID] = &skill
	}

	return nil
}

func (l *SkillLoader) loadCustomSkills() error {
	entries, err := os.ReadDir(l.customDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillFile := filepath.Join(l.customDir, entry.Name(), "skill.json")
		data, err := os.ReadFile(skillFile)
		if err != nil {
			continue
		}

		var skill Skill
		if err := json.Unmarshal(data, &skill); err != nil {
			continue
		}

		skill.IsBuiltin = false
		skill.IsActive = true
		l.skills[skill.ID] = &skill
	}

	return nil
}

func (l *SkillLoader) GetSkill(id string) (*Skill, error) {
	skill, ok := l.skills[id]
	if !ok {
		return nil, fmt.Errorf("skill not found: %s", id)
	}
	return skill, nil
}

func (l *SkillLoader) ListSkills() []*Skill {
	skills := make([]*Skill, 0, len(l.skills))
	for _, skill := range l.skills {
		if skill.IsActive {
			skills = append(skills, skill)
		}
	}
	return skills
}

func (l *SkillLoader) ListBuiltinSkills() []*Skill {
	skills := make([]*Skill, 0)
	for _, skill := range l.skills {
		if skill.IsBuiltin && skill.IsActive {
			skills = append(skills, skill)
		}
	}
	return skills
}

func (l *SkillLoader) RegisterSkill(skill *Skill) error {
	if skill.ID == "" {
		skill.ID = uuid.NewString()
	}
	skill.IsActive = true
	l.skills[skill.ID] = skill
	return nil
}

func (l *SkillLoader) UnregisterSkill(id string) error {
	delete(l.skills, id)
	return nil
}

type SkillExecutor struct {
	loader *SkillLoader
}

func NewSkillExecutor(loader *SkillLoader) *SkillExecutor {
	return &SkillExecutor{
		loader: loader,
	}
}

func (e *SkillExecutor) Execute(ctx context.Context, skillID string, args map[string]interface{}, skillCtx SkillContext) *SkillResult {
	startTime := time.Now()

	skill, err := e.loader.GetSkill(skillID)
	if err != nil {
		return &SkillResult{
			Success:  false,
			Error:    err.Error(),
			Duration: time.Since(startTime).Milliseconds(),
		}
	}

	output, err := e.executeSkill(skill, args, skillCtx)
	duration := time.Since(startTime).Milliseconds()

	if err != nil {
		return &SkillResult{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		}
	}

	return &SkillResult{
		Success:  true,
		Output:   output,
		Duration: duration,
	}
}

func (e *SkillExecutor) executeSkill(skill *Skill, args map[string]interface{}, skillCtx SkillContext) (interface{}, error) {
	if strings.HasSuffix(skill.Code, ".py") || strings.Contains(skill.Handler, "python") {
		return e.executePythonSkill(skill, args, skillCtx)
	}

	return e.executeScriptSkill(skill, args, skillCtx)
}

func (e *SkillExecutor) executePythonSkill(skill *Skill, args map[string]interface{}, skillCtx SkillContext) (interface{}, error) {
	cmd := fmt.Sprintf("python3 -c '%s'", strings.ReplaceAll(skill.Code, "'", "'\\''"))

	result, err := skillCtx.Tools.Bash(cmd)
	if err != nil {
		return nil, err
	}

	var output interface{}
	if err := json.Unmarshal([]byte(result), &output); err != nil {
		return result, nil
	}

	return output, nil
}

func (e *SkillExecutor) executeScriptSkill(skill *Skill, args map[string]interface{}, skillCtx SkillContext) (interface{}, error) {
	argsJSON, _ := json.Marshal(args)

	cmd := fmt.Sprintf("%s '%s'", skill.Handler, strings.ReplaceAll(string(argsJSON), "'", "'\\''"))

	result, err := skillCtx.Tools.Bash(cmd)
	if err != nil {
		return nil, err
	}

	var output interface{}
	if err := json.Unmarshal([]byte(result), &output); err != nil {
		return result, nil
	}

	return output, nil
}
