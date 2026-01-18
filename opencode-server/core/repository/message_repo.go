package repository

import (
	"gorm.io/gorm"
	"opencode-server/core/model"
)

type MessageRepository struct {
	db *gorm.DB
}

func NewMessageRepository(db *gorm.DB) *MessageRepository {
	return &MessageRepository{db: db}
}

func (r *MessageRepository) Create(message *model.Message) error {
	return r.db.Create(message).Error
}

func (r *MessageRepository) GetByID(id string) (*model.Message, error) {
	var message model.Message
	err := r.db.Where("id = ?", id).First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

func (r *MessageRepository) GetBySessionID(sessionID string, limit, offset int) ([]model.Message, int64) {
	var messages []model.Message
	var total int64

	r.db.Model(&model.Message{}).Where("session_id = ?", sessionID).Count(&total)

	r.db.Where("session_id = ?", sessionID).
		Order("created_at ASC").
		Limit(limit).
		Offset(offset).
		Find(&messages)

	return messages, total
}

func (r *MessageRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.Message{}).Error
}

func (r *MessageRepository) DeleteBySessionID(sessionID string) error {
	return r.db.Where("session_id = ?", sessionID).Delete(&model.Message{}).Error
}
