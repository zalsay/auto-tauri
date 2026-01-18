package main

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           string `gorm:"primaryKey;type:uuid" json:"id"`
	Email        string `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string `gorm:"size:255;not null" json:"-"`
	Balance      int64  `gorm:"not null;default:0" json:"balance"`

	// Organization fields
	OrganizationID *string `gorm:"index;type:uuid" json:"organizationId"`
	Role           string  `gorm:"size:32;not null;default:'user'" json:"role"` // user, org_admin, super_admin
	IsBlacklisted  bool    `gorm:"not null;default:false" json:"isBlacklisted"` // System blacklist

	// LLM Settings
	LLMProvider string `gorm:"size:64;default:'TaskMaster'" json:"llmProvider"`
	LLMModel    string `gorm:"size:64;default:'google/gemini-3-flash-preview'" json:"llmModel"`
	LLMAPIKey   string `gorm:"size:255" json:"llmApiKey"`
	LLMBaseURL  string `gorm:"size:255" json:"llmBaseUrl"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Organization struct {
	ID             string    `gorm:"primaryKey;type:uuid" json:"id"`
	Name           string    `gorm:"size:255;not null" json:"name"`
	Balance        int64     `gorm:"not null;default:0" json:"balance"`
	BillingAdminID *string   `gorm:"type:uuid" json:"billingAdminId"` // Admin account for billing
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

type OrgUserBlacklist struct {
	ID             string    `gorm:"primaryKey;type:uuid" json:"id"`
	OrganizationID string    `gorm:"index;type:uuid;not null" json:"organizationId"`
	UserID         string    `gorm:"index;type:uuid;not null" json:"userId"`
	BlockedBy      string    `gorm:"type:uuid;not null" json:"blockedBy"`
	Reason         string    `gorm:"size:512" json:"reason"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"createdAt"`
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
	ID           string    `gorm:"primaryKey;type:uuid" json:"id"`
	UserID       string    `gorm:"index;type:uuid;not null" json:"userId"`
	Name         string    `gorm:"size:255;not null" json:"name"`
	URL          string    `gorm:"type:text" json:"url"`
	Prompt       string    `gorm:"type:text;not null" json:"prompt"`
	Type         string    `gorm:"size:32;not null;default:'workflow'" json:"type"`
	Screenshot   bool      `gorm:"not null;default:false" json:"screenshot"`
	Platform     string    `gorm:"size:32;default:'xhs'" json:"platform"`
	UseAIRewrite bool      `gorm:"not null;default:false" json:"useAIRewrite"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

type Task struct {
	ID        string    `gorm:"primaryKey;type:uuid" json:"id"`
	ProjectID *string   `gorm:"index;type:uuid" json:"projectId"`
	UserID    string    `gorm:"index;type:uuid;not null" json:"userId"`
	Prompt    string    `gorm:"type:text;not null" json:"prompt"`
	Type      string    `gorm:"size:32;not null;default:'workflow'" json:"type"`
	Status    string    `gorm:"size:32;not null" json:"status"`
	Result    string    `gorm:"type:text" json:"result"` // New Field
	Cost      int64     `gorm:"not null;default:0" json:"cost"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

type LLMConfig struct {
	Provider string `json:"llmProvider"`

	Model string `json:"llmModel"`

	APIKey string `json:"llmApiKey"`

	BaseURL string `json:"llmBaseUrl"`
}

type Material struct {
	ID        string    `gorm:"primaryKey;type:uuid" json:"id"`
	UserID    string    `gorm:"index;type:uuid;not null" json:"userId"`
	ProjectID *string   `gorm:"index;type:uuid" json:"projectId"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	Type      string    `gorm:"size:32;not null;default:'text'" json:"type"`
	ImageUrls string    `gorm:"type:text" json:"imageUrls"`
	Content   string    `gorm:"type:text" json:"content"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&Organization{}, &User{}, &Transaction{}, &Project{}, &Task{}, &Material{}, &OrgUserBlacklist{})
}
