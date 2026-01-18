package repository

import (
	"gorm.io/gorm"
	"opencode-server/core/model"
)

type SkillRepository struct {
	db *gorm.DB
}

func NewSkillRepository(db *gorm.DB) *SkillRepository {
	return &SkillRepository{db: db}
}

func (r *SkillRepository) Create(skill *model.Skill) error {
	return r.db.Create(skill).Error
}

func (r *SkillRepository) GetByID(id string) (*model.Skill, error) {
	var skill model.Skill
	err := r.db.Where("id = ?", id).First(&skill).Error
	if err != nil {
		return nil, err
	}
	return &skill, nil
}

func (r *SkillRepository) GetByName(name string) (*model.Skill, error) {
	var skill model.Skill
	err := r.db.Where("name = ?", name).First(&skill).Error
	if err != nil {
		return nil, err
	}
	return &skill, nil
}

func (r *SkillRepository) ListActive() ([]model.Skill, error) {
	var skills []model.Skill
	err := r.db.Where("is_active = ?", true).Find(&skills).Error
	return skills, err
}

func (r *SkillRepository) ListBuiltin() ([]model.Skill, error) {
	var skills []model.Skill
	err := r.db.Where("is_builtin = ? AND is_active = ?", true, true).Find(&skills).Error
	return skills, err
}

func (r *SkillRepository) Update(skill *model.Skill) error {
	return r.db.Save(skill).Error
}

func (r *SkillRepository) Delete(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.Skill{}).Error
}
