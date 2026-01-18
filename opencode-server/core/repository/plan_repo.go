package repository

import (
	"gorm.io/gorm"
	"opencode-server/core/model"
)

type TaskPlanRepository struct {
	db *gorm.DB
}

func NewTaskPlanRepository(db *gorm.DB) *TaskPlanRepository {
	return &TaskPlanRepository{db: db}
}

func (r *TaskPlanRepository) Create(plan *model.TaskPlan) error {
	return r.db.Create(plan).Error
}

func (r *TaskPlanRepository) GetByID(id string) (*model.TaskPlan, error) {
	var plan model.TaskPlan
	err := r.db.Where("id = ?", id).First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *TaskPlanRepository) GetBySessionID(sessionID string) ([]model.TaskPlan, error) {
	var plans []model.TaskPlan
	err := r.db.Where("session_id = ?", sessionID).Order("created_at DESC").Find(&plans).Error
	return plans, err
}

func (r *TaskPlanRepository) GetLatestBySessionID(sessionID string) (*model.TaskPlan, error) {
	var plan model.TaskPlan
	err := r.db.Where("session_id = ?", sessionID).Order("created_at DESC").First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *TaskPlanRepository) Update(plan *model.TaskPlan) error {
	return r.db.Save(plan).Error
}

func (r *TaskPlanRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.TaskPlan{}).Error
}

func (r *TaskPlanRepository) ExistsBySessionID(sessionID string) (bool, error) {
	var count int64
	err := r.db.Model(&model.TaskPlan{}).Where("session_id = ?", sessionID).Count(&count).Error
	return count > 0, err
}
