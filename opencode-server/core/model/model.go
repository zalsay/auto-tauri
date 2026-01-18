package model

import (
	"time"

	"gorm.io/gorm"
)

type Session struct {
	ID         string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	UserID     string         `gorm:"type:varchar(64);index;not null" json:"userId"`
	Agent      string         `gorm:"type:varchar(64);not null" json:"agent"`
	ModelID    string         `gorm:"type:varchar(128);not null" json:"modelId"`
	ProviderID string         `gorm:"type:varchar(64);not null" json:"providerId"`
	System     string         `gorm:"type:text" json:"system,omitempty"`
	Tools      string         `gorm:"type:jsonb" json:"tools"`
	MaxSteps   int            `gorm:"default:100" json:"maxSteps,omitempty"`
	Status     string         `gorm:"type:varchar(32);not null;default:'running'" json:"status"`
	Cwd        string         `gorm:"type:varchar(512)" json:"cwd,omitempty"`
	CreatedAt  time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"autoUpdateTime" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type Message struct {
	ID         string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	SessionID  string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	Role       string         `gorm:"type:varchar(32);not null" json:"role"`
	Content    string         `gorm:"type:text" json:"content"`
	Parts      string         `gorm:"type:jsonb" json:"parts,omitempty"`
	ParentID   string         `gorm:"type:varchar(64)" json:"parentId,omitempty"`
	ModelID    string         `gorm:"type:varchar(128)" json:"modelId"`
	ProviderID string         `gorm:"type:varchar(64)" json:"providerId"`
	Tokens     string         `gorm:"type:jsonb" json:"tokens"`
	Finish     string         `gorm:"type:varchar(32)" json:"finish,omitempty"`
	Cost       float64        `gorm:"default:0" json:"cost"`
	CreatedAt  time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type ToolCall struct {
	ID        string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	SessionID string         `gorm:"type:varchar(64);index;not null" json:"sessionId"`
	MessageID string         `gorm:"type:varchar(64);index;not null" json:"messageId"`
	Tool      string         `gorm:"type:varchar(128);not null" json:"tool"`
	CallID    string         `gorm:"type:varchar(64);not null" json:"callId"`
	State     string         `gorm:"type:varchar(32);not null" json:"state"`
	Input     string         `gorm:"type:jsonb" json:"input"`
	Output    string         `gorm:"type:text" json:"output,omitempty"`
	Error     string         `gorm:"type:text" json:"error,omitempty"`
	Title     string         `gorm:"type:varchar(256)" json:"title,omitempty"`
	StartTime time.Time      `gorm:"not null" json:"startTime"`
	EndTime   time.Time      `json:"endTime,omitempty"`
	Metadata  string         `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Skill struct {
	ID          string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	Name        string         `gorm:"type:varchar(128);not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Version     string         `gorm:"type:varchar(32);not null" json:"version"`
	Author      string         `gorm:"type:varchar(128)" json:"author,omitempty"`
	Tags        string         `gorm:"type:text[]" json:"tags,omitempty"`
	Parameters  string         `gorm:"type:jsonb" json:"parameters"`
	Handler     string         `gorm:"type:text" json:"handler"`
	Code        string         `gorm:"type:text" json:"code"`
	Permissions string         `gorm:"type:jsonb" json:"permissions,omitempty"`
	IsBuiltin   bool           `gorm:"default:false" json:"isBuiltin"`
	IsActive    bool           `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&Session{}, &Message{}, &ToolCall{}, &Skill{})
}
