package model

import (
	"time"

	"gorm.io/gorm"
)

type TaskPlan struct {
	ID         string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	SessionID  string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	UserID     string         `gorm:"type:varchar(64);index;not null" json:"userId"`
	Goal       string         `gorm:"type:text;not null" json:"goal"`
	PlanJSON   string         `gorm:"type:jsonb" json:"plan"`
	Steps      string         `gorm:"type:jsonb" json:"steps"`
	Summary    string         `gorm:"type:text" json:"summary"`
	ModelID    string         `gorm:"type:varchar(128)" json:"modelId"`
	ProviderID string         `gorm:"type:varchar(64)" json:"providerId"`
	TokenCount int            `gorm:"default:0" json:"tokenCount"`
	CreatedAt  time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"autoUpdateTime" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type PlanStep struct {
	Order         int    `json:"order"`
	Type          string `json:"type"`
	Description   string `json:"description"`
	Details       string `json:"details"`
	Agent         string `json:"agent"`
	EstimatedTime string `json:"estimatedTime"`
	Dependencies  []int  `json:"dependencies"`
}

type Plan struct {
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	TotalSteps        int        `json:"totalSteps"`
	EstimatedDuration string     `json:"estimatedDuration"`
	Steps             []PlanStep `json:"steps"`
	Tips              []string   `json:"tips"`
}

func AutoMigrateTaskPlan(db *gorm.DB) error {
	return db.AutoMigrate(&TaskPlan{})
}
