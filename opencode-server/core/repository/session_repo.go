package repository

import (
	"gorm.io/gorm"
	"opencode-server/core/model"
)

type SessionRepository struct {
	db *gorm.DB
}

func NewSessionRepository(db *gorm.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(session *model.Session) error {
	return r.db.Create(session).Error
}

func (r *SessionRepository) GetByID(id string) (*model.Session, error) {
	var session model.Session
	err := r.db.Where("id = ?", id).First(&session).Error
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *SessionRepository) GetByUserID(userID string, limit, offset int) ([]model.Session, int64) {
	var sessions []model.Session
	var total int64

	r.db.Model(&model.Session{}).Where("user_id = ?", userID).Count(&total)

	r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&sessions)

	return sessions, total
}

func (r *SessionRepository) Update(session *model.Session) error {
	return r.db.Save(session).Error
}

func (r *SessionRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.Session{}).Error
}

func (r *SessionRepository) ListAll(limit, offset int) ([]model.Session, int64) {
	var sessions []model.Session
	var total int64

	r.db.Model(&model.Session{}).Count(&total)

	r.db.Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&sessions)

	return sessions, total
}
