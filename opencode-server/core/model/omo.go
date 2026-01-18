package model

import (
	"time"

	"gorm.io/gorm"
)

type OmoTask struct {
	ID          string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	SessionID   string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	UserID      string         `gorm:"type:varchar(64);index;not null" json:"userId"`
	Goal        string         `gorm:"type:text;not null" json:"goal"`
	Status      string         `gorm:"type:varchar(32);not null;default:'pending'" json:"status"`
	CurrentStep int            `gorm:"default:0" json:"currentStep"`
	MaxSteps    int            `gorm:"default:50" json:"maxSteps"`
	Result      string         `gorm:"type:text" json:"result,omitempty"`
	Summary     string         `gorm:"type:text" json:"summary,omitempty"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type OmoStep struct {
	ID          string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	TaskID      string         `gorm:"type:varchar(64);index;not null" json:"taskId"`
	SessionID   string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	Agent       string         `gorm:"type:varchar(32);not null" json:"agent"`
	StepNumber  int            `gorm:"not null" json:"stepNumber"`
	Thought     string         `gorm:"type:text" json:"thought"`
	Action      string         `gorm:"type:text" json:"action"`
	Observation string         `gorm:"type:text" json:"observation"`
	Result      string         `gorm:"type:text" json:"result,omitempty"`
	Status      string         `gorm:"type:varchar(32);not null;default:'pending'" json:"status"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type OmoPlan struct {
	ID             string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	TaskID         string         `gorm:"type:varchar(64);index;not null" json:"taskId"`
	SessionID      string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	Goals          string         `gorm:"type:jsonb" json:"goals"`
	Steps          string         `gorm:"type:jsonb" json:"steps"`
	CompletedSteps int            `gorm:"default:0" json:"completedSteps"`
	TotalSteps     int            `gorm:"default:0" json:"totalSteps"`
	Status         string         `gorm:"type:varchar(32);not null;default:'planning'" json:"status"`
	CreatedAt      time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt      time.Time      `gorm:"autoUpdateTime" json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func AutoMigrateOmO(db *gorm.DB) error {
	return db.AutoMigrate(&OmoTask{}, &OmoStep{}, &OmoPlan{})
}
