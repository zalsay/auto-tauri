package main

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           string `gorm:"primaryKey;type:uuid"`
	Email        string `gorm:"uniqueIndex;size:255;not null"`
	PasswordHash string `gorm:"size:255;not null"`
	Balance      int64  `gorm:"not null;default:0"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Transaction struct {
	ID          string    `gorm:"primaryKey;type:uuid"`
	UserID      string    `gorm:"index;type:uuid;not null"`
	Amount      int64     `gorm:"not null"`
	Type        string    `gorm:"size:32;not null"`
	Description string    `gorm:"size:512"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
}

type Task struct {
	ID        string    `gorm:"primaryKey;type:uuid"`
	UserID    string    `gorm:"index;type:uuid;not null"`
	Prompt    string    `gorm:"type:text;not null"`
	Status    string    `gorm:"size:32;not null"`
	Cost      int64     `gorm:"not null;default:0"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&User{}, &Transaction{}, &Task{})
}
