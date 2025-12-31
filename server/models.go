package main

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           string    `gorm:"primaryKey;type:uuid" json:"id"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	Balance      int64     `gorm:"not null;default:0" json:"balance"`
	
	// LLM Settings
	LLMProvider  string    `gorm:"size:64;default:'TaskMaster'" json:"llmProvider"`
	LLMModel     string    `gorm:"size:64;default:'auto'" json:"llmModel"`
	LLMAPIKey    string    `gorm:"size:255" json:"llmApiKey"`
	LLMBaseURL   string    `gorm:"size:255" json:"llmBaseUrl"`

	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Transaction struct {
	ID          string    `gorm:"primaryKey;type:uuid" json:"id"`
	UserID      string    `gorm:"index;type:uuid;not null" json:"userId"`
	Amount      int64     `gorm:"not null" json:"amount"`
	Type        string    `gorm:"size:32;not null" json:"type"`
	Description string    `gorm:"size:512" json:"description"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

type Project struct {
	ID        string    `gorm:"primaryKey;type:uuid" json:"id"`
	UserID    string    `gorm:"index;type:uuid;not null" json:"userId"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	URL       string    `gorm:"type:text" json:"url"`
	Prompt    string    `gorm:"type:text;not null" json:"prompt"`
	Type      string    `gorm:"size:32;not null;default:'workflow'" json:"type"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

type Task struct {
	ID        string    `gorm:"primaryKey;type:uuid" json:"id"`
	ProjectID string    `gorm:"index;type:uuid;not null" json:"projectId"`
	UserID    string    `gorm:"index;type:uuid;not null" json:"userId"`
	Prompt    string    `gorm:"type:text;not null" json:"prompt"`
	Type      string    `gorm:"size:32;not null;default:'workflow'" json:"type"`
	Status    string    `gorm:"size:32;not null" json:"status"`
	Cost      int64     `gorm:"not null;default:0" json:"cost"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&User{}, &Transaction{}, &Project{}, &Task{})
}