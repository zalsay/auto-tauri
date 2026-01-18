package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"opencode-server/core/model"
	"opencode-server/core/repository"
)

type PlanService struct {
	planRepo *repository.TaskPlanRepository
}

func NewPlanService(planRepo *repository.TaskPlanRepository) *PlanService {
	return &PlanService{
		planRepo: planRepo,
	}
}

type GeneratePlanRequest struct {
	SessionID  string `json:"sessionId" binding:"required"`
	Goal       string `json:"goal" binding:"required"`
	Context    string `json:"context,omitempty"`
	ModelID    string `json:"modelId,omitempty"`
	ProviderID string `json:"providerId,omitempty"`
}

type GeneratePlanResponse struct {
	ID        string     `json:"id"`
	Goal      string     `json:"goal"`
	Plan      model.Plan `json:"plan"`
	Summary   string     `json:"summary"`
	CreatedAt time.Time  `json:"createdAt"`
}

func (s *PlanService) GeneratePlan(userID string, req *GeneratePlanRequest) (*GeneratePlanResponse, error) {
	goal := strings.TrimSpace(req.Goal)

	plan := s.analyzeAndGeneratePlan(goal)

	planJSON, _ := json.Marshal(plan)
	stepsJSON, _ := json.Marshal(plan.Steps)

	taskPlan := &model.TaskPlan{
		ID:         uuid.NewString(),
		SessionID:  req.SessionID,
		UserID:     userID,
		Goal:       goal,
		PlanJSON:   string(planJSON),
		Steps:      string(stepsJSON),
		Summary:    plan.Title + ": " + plan.Description,
		ModelID:    req.ModelID,
		ProviderID: req.ProviderID,
		TokenCount: len(goal) + len(planJSON),
	}

	if err := s.planRepo.Create(taskPlan); err != nil {
		return nil, fmt.Errorf("failed to save plan: %w", err)
	}

	return &GeneratePlanResponse{
		ID:        taskPlan.ID,
		Goal:      taskPlan.Goal,
		Plan:      plan,
		Summary:   taskPlan.Summary,
		CreatedAt: taskPlan.CreatedAt,
	}, nil
}

func (s *PlanService) GetPlan(planID string, userID string) (*GeneratePlanResponse, error) {
	plan, err := s.planRepo.GetByID(planID)
	if err != nil {
		return nil, err
	}

	if plan.UserID != userID {
		return nil, fmt.Errorf("access denied")
	}

	var planData model.Plan
	if err := json.Unmarshal([]byte(plan.PlanJSON), &planData); err != nil {
		return nil, fmt.Errorf("failed to parse plan: %w", err)
	}

	return &GeneratePlanResponse{
		ID:        plan.ID,
		Goal:      plan.Goal,
		Plan:      planData,
		Summary:   plan.Summary,
		CreatedAt: plan.CreatedAt,
	}, nil
}

func (s *PlanService) GetLatestPlan(sessionID string, userID string) (*GeneratePlanResponse, error) {
	plan, err := s.planRepo.GetLatestBySessionID(sessionID)
	if err != nil {
		return nil, err
	}

	if plan.UserID != userID {
		return nil, fmt.Errorf("access denied")
	}

	var planData model.Plan
	if err := json.Unmarshal([]byte(plan.PlanJSON), &planData); err != nil {
		return nil, fmt.Errorf("failed to parse plan: %w", err)
	}

	return &GeneratePlanResponse{
		ID:        plan.ID,
		Goal:      plan.Goal,
		Plan:      planData,
		Summary:   plan.Summary,
		CreatedAt: plan.CreatedAt,
	}, nil
}

func (s *PlanService) HasPlan(sessionID string) (bool, error) {
	return s.planRepo.ExistsBySessionID(sessionID)
}

func (s *PlanService) AnalyzeAndGeneratePlan(goal string) model.Plan {
	return s.analyzeAndGeneratePlan(goal)
}

func (s *PlanService) analyzeAndGeneratePlan(goal string) model.Plan {
	goalLower := strings.ToLower(goal)

	var plan model.Plan
	plan.Title = "任务执行计划"
	plan.Description = fmt.Sprintf("针对目标「%s」的执行计划", truncate(goal, 50))

	var steps []model.PlanStep
	var tips []string

	if strings.Contains(goalLower, "create") || strings.Contains(goalLower, "build") || strings.Contains(goalLower, "new") {
		plan.Title = "创建任务计划"
		plan.Description = "这是一个创建类任务，将分步骤完成资源的创建"
		steps = append(steps, model.PlanStep{
			Order:       1,
			Type:        "analysis",
			Description: "分析需求",
			Details:     "明确需要创建的内容、格式和存放位置",
			Agent:       "manager",
		})
		steps = append(steps, model.PlanStep{
			Order:       2,
			Type:        "search",
			Description: "查找现有资源",
			Details:     "检查是否已存在相似资源，避免重复创建",
			Agent:       "oracle",
		})
		steps = append(steps, model.PlanStep{
			Order:       3,
			Type:        "create",
			Description: "创建资源",
			Details:     "根据需求创建新的文件或资源",
			Agent:       "builder",
		})
		steps = append(steps, model.PlanStep{
			Order:       4,
			Type:        "verify",
			Description: "验证结果",
			Details:     "确认创建的资源符合预期",
			Agent:       "oracle",
		})
		tips = append(tips, "建议明确指定文件类型和路径", "可以先搜索是否已存在类似资源")
	} else if strings.Contains(goalLower, "search") || strings.Contains(goalLower, "find") || strings.Contains(goalLower, "look") {
		plan.Title = "搜索任务计划"
		plan.Description = "这是一个搜索类任务，将分步骤完成信息检索"
		steps = append(steps, model.PlanStep{
			Order:       1,
			Type:        "analysis",
			Description: "分析搜索需求",
			Details:     "理解搜索目标，确定搜索关键词",
			Agent:       "manager",
		})
		steps = append(steps, model.PlanStep{
			Order:       2,
			Type:        "search",
			Description: "执行搜索",
			Details:     "在代码库和相关资源中搜索目标信息",
			Agent:       "oracle",
		})
		steps = append(steps, model.PlanStep{
			Order:       3,
			Type:        "analyze",
			Description: "分析搜索结果",
			Details:     "筛选和整理搜索结果，提取关键信息",
			Agent:       "oracle",
		})
		tips = append(tips, "建议使用精确的关键词", "可以指定搜索范围（如特定目录或文件类型）")
	} else if strings.Contains(goalLower, "edit") || strings.Contains(goalLower, "modify") || strings.Contains(goalLower, "change") {
		plan.Title = "编辑任务计划"
		plan.Description = "这是一个编辑类任务，将分步骤完成修改"
		steps = append(steps, model.PlanStep{
			Order:       1,
			Type:        "analysis",
			Description: "分析修改需求",
			Details:     "明确需要修改的内容和期望结果",
			Agent:       "manager",
		})
		steps = append(steps, model.PlanStep{
			Order:       2,
			Type:        "locate",
			Description: "定位目标",
			Details:     "找到需要修改的文件和具体位置",
			Agent:       "oracle",
		})
		steps = append(steps, model.PlanStep{
			Order:       3,
			Type:        "edit",
			Description: "执行修改",
			Details:     "按照需求修改目标内容",
			Agent:       "builder",
		})
		steps = append(steps, model.PlanStep{
			Order:       4,
			Type:        "verify",
			Description: "验证修改",
			Details:     "确认修改正确生效",
			Agent:       "oracle",
		})
		tips = append(tips, "建议提供精确的修改位置描述", "可以说明具体的修改内容")
	} else if strings.Contains(goalLower, "explain") || strings.Contains(goalLower, "what is") || strings.Contains(goalLower, "understand") {
		plan.Title = "解释任务计划"
		plan.Description = "这是一个解释类任务，将帮助理解目标内容"
		steps = append(steps, model.PlanStep{
			Order:       1,
			Type:        "analysis",
			Description: "分析目标",
			Details:     "理解需要解释或说明的内容",
			Agent:       "manager",
		})
		steps = append(steps, model.PlanStep{
			Order:       2,
			Type:        "search",
			Description: "收集信息",
			Details:     "收集相关的背景信息和上下文",
			Agent:       "oracle",
		})
		steps = append(steps, model.PlanStep{
			Order:       3,
			Type:        "explain",
			Description: "生成解释",
			Details:     "提供清晰易懂的解释说明",
			Agent:       "oracle",
		})
		tips = append(tips, "可以说明目标受众和期望的解释深度", "可以要求提供示例或代码片段")
	} else {
		plan.Title = "通用任务计划"
		plan.Description = "这是一个通用任务，将分步骤完成"
		steps = append(steps, model.PlanStep{
			Order:       1,
			Type:        "analysis",
			Description: "分析任务",
			Details:     "理解任务目标和需求",
			Agent:       "manager",
		})
		steps = append(steps, model.PlanStep{
			Order:       2,
			Type:        "search",
			Description: "信息收集",
			Details:     "收集完成任务所需的信息",
			Agent:       "oracle",
		})
		steps = append(steps, model.PlanStep{
			Order:       3,
			Type:        "execute",
			Description: "执行任务",
			Details:     "按照计划执行具体操作",
			Agent:       "builder",
		})
		steps = append(steps, model.PlanStep{
			Order:       4,
			Type:        "verify",
			Description: "验证结果",
			Details:     "确认任务完成符合预期",
			Agent:       "oracle",
		})
		tips = append(tips, "建议提供详细的执行要求", "可以要求分步骤确认")
	}

	plan.TotalSteps = len(steps)
	plan.EstimatedDuration = s.estimateDuration(len(steps))
	plan.Steps = steps
	plan.Tips = tips

	return plan
}

func (s *PlanService) estimateDuration(stepCount int) string {
	minutes := stepCount * 5
	if minutes < 60 {
		return fmt.Sprintf("%d 分钟", minutes)
	}
	hours := minutes / 60
	mins := minutes % 60
	return fmt.Sprintf("%d 小时 %d 分钟", hours, mins)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
