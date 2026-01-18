package repository

import (
	"time"

	"gorm.io/gorm"
	"opencode-server/core/model"
)

type ToolCallRepository struct {
	db *gorm.DB
}

func NewToolCallRepository(db *gorm.DB) *ToolCallRepository {
	return &ToolCallRepository{db: db}
}

func (r *ToolCallRepository) Create(toolCall *model.ToolCall) error {
	return r.db.Create(toolCall).Error
}

func (r *ToolCallRepository) GetByID(id string) (*model.ToolCall, error) {
	var toolCall model.ToolCall
	err := r.db.Where("id = ?", id).First(&toolCall).Error
	if err != nil {
		return nil, err
	}
	return &toolCall, nil
}

func (r *ToolCallRepository) GetBySessionID(sessionID string, limit, offset int) ([]model.ToolCall, int64) {
	var toolCalls []model.ToolCall
	var total int64

	r.db.Model(&model.ToolCall{}).Where("session_id = ?", sessionID).Count(&total)

	r.db.Where("session_id = ?", sessionID).
		Order("created_at ASC").
		Limit(limit).
		Offset(offset).
		Find(&toolCalls)

	return toolCalls, total
}

func (r *ToolCallRepository) UpdateState(id, state, output, errStr string) error {
	updates := map[string]interface{}{
		"state":    state,
		"end_time": time.Now(),
	}
	if output != "" {
		updates["output"] = output
	}
	if errStr != "" {
		updates["error"] = errStr
	}
	return r.db.Model(&model.ToolCall{}).Where("id = ?", id).Updates(updates).Error
}

func (r *ToolCallRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.ToolCall{}).Error
}

func (r *ToolCallRepository) DeleteBySessionID(sessionID string) error {
	return r.db.Where("session_id = ?", sessionID).Delete(&model.ToolCall{}).Error
}
