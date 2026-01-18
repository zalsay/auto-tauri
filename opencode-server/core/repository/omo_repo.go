package repository

import (
	"gorm.io/gorm"
	"opencode-server/core/model"
)

type OmoTaskRepository struct {
	db *gorm.DB
}

func NewOmoTaskRepository(db *gorm.DB) *OmoTaskRepository {
	return &OmoTaskRepository{db: db}
}

func (r *OmoTaskRepository) Create(task *model.OmoTask) error {
	return r.db.Create(task).Error
}

func (r *OmoTaskRepository) GetByID(id string) (*model.OmoTask, error) {
	var task model.OmoTask
	err := r.db.Where("id = ?", id).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *OmoTaskRepository) GetByUserID(userID string, limit, offset int) ([]model.OmoTask, int64) {
	var tasks []model.OmoTask
	var total int64

	r.db.Model(&model.OmoTask{}).Where("user_id = ?", userID).Count(&total)

	r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&tasks)

	return tasks, total
}

func (r *OmoTaskRepository) Update(task *model.OmoTask) error {
	return r.db.Save(task).Error
}

func (r *OmoTaskRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.OmoTask{}).Error
}

type OmoStepRepository struct {
	db *gorm.DB
}

func NewOmoStepRepository(db *gorm.DB) *OmoStepRepository {
	return &OmoStepRepository{db: db}
}

func (r *OmoStepRepository) Create(step *model.OmoStep) error {
	return r.db.Create(step).Error
}

func (r *OmoStepRepository) GetByTaskID(taskID string) ([]model.OmoStep, error) {
	var steps []model.OmoStep
	err := r.db.Where("task_id = ?", taskID).Order("step_number ASC").Find(&steps).Error
	return steps, err
}

func (r *OmoStepRepository) Update(step *model.OmoStep) error {
	return r.db.Save(step).Error
}

func (r *OmoStepRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.OmoStep{}).Error
}

type OmoPlanRepository struct {
	db *gorm.DB
}

func NewOmoPlanRepository(db *gorm.DB) *OmoPlanRepository {
	return &OmoPlanRepository{db: db}
}

func (r *OmoPlanRepository) Create(plan *model.OmoPlan) error {
	return r.db.Create(plan).Error
}

func (r *OmoPlanRepository) GetByTaskID(taskID string) (*model.OmoPlan, error) {
	var plan model.OmoPlan
	err := r.db.Where("task_id = ?", taskID).First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *OmoPlanRepository) Update(plan *model.OmoPlan) error {
	return r.db.Save(plan).Error
}

func (r *OmoPlanRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.OmoPlan{}).Error
}
