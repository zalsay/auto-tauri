package models

import (
	"time"
)

// Order 订单表
type Order struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	UserID      string    `gorm:"size:36;index" json:"user_id"`
	ProductID   string    `gorm:"size:36" json:"product_id"`
	Quantity    int       `json:"quantity"`
	Amount      int64     `json:"amount"`
	Status      string    `gorm:"size:20;default:pending" json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// OrderStatus 订单状态常量
const (
	OrderStatusPending   = "pending"
	OrderStatusPaid      = "paid"
	OrderStatusShipped   = "shipped"
	OrderStatusCompleted = "completed"
	OrderStatusCancelled = "cancelled"
	OrderStatusFailed    = "failed"
)

// Account 账户表（用于积分/余额）
type Account struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	UserID    string    `gorm:"size:36;uniqueIndex" json:"user_id"`
	Balance   int64     `gorm:"default:0" json:"balance"`
	Frozen    int64     `gorm:"default:0" json:"frozen"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Inventory 库存表
type Inventory struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	ProductID string    `gorm:"size:36;uniqueIndex" json:"product_id"`
	Stock     int       `json:"stock"`
	Reserved  int       `json:"reserved"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LocalMessage 本地消息表（用于最终一致性）
type LocalMessage struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	Topic         string    `gorm:"size:100;index" json:"topic"`
	Payload       string    `gorm:"type:text" json:"payload"`
	Status        string    `gorm:"size:20;default:pending" json:"status"`
	Retries       int       `gorm:"default:0" json:"retries"`
	LastError     string    `gorm:"type:text" json:"last_error"`
	CreatedAt     time.Time `json:"created_at"`
	ProcessedAt   *time.Time `json:"processed_at,omitempty"`
	NextRetryAt   *time.Time `json:"next_retry_at,omitempty"`
}

// MessageStatus 消息状态常量
const (
	MsgStatusPending   = "pending"
	MsgStatusProcessing = "processing"
	MsgStatusCompleted = "completed"
	MsgStatusFailed    = "failed"
)

// SagaInstance Saga 实例表
type SagaInstance struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	Name        string    `gorm:"size:100;index" json:"name"`
	Context     string    `gorm:"type:text" json:"context"`
	Status      string    `gorm:"size:20;default:running" json:"status"`
	CurrentStep int       `gorm:"default:0" json:"current_step"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// SagaStep Saga 步骤表
type SagaStep struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	SagaID        string    `gorm:"size:36;index" json:"saga_id"`
	StepName      string    `gorm:"size:100" json:"step_name"`
	ActionType    string    `gorm:"size:50" json:"action_type"`
	ActionPayload string    `gorm:"type:text" json:"action_payload"`
	CompensationPayload string `gorm:"type:text" json:"compensation_payload"`
	Status        string    `gorm:"size:20;default:pending" json:"status"`
	Order         int       `json:"order"`
	CreatedAt     time.Time `json:"created_at"`
	ProcessedAt   *time.Time `json:"processed_at,omitempty"`
}

// TccTransaction TCC 事务表
type TccTransaction struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	TransactionID string    `gorm:"size:100;uniqueIndex" json:"transaction_id"`
	ServiceName   string    `gorm:"size:100" json:"service_name"`
	Context       string    `gorm:"type:text" json:"context"`
	Status        string    `gorm:"size:20;default:trying" json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	ExpiredAt     time.Time `json:"expired_at"`
}

// TccStatus TCC 状态常量
const (
	TccStatusTrying   = "trying"
	TccStatusConfirming = "confirming"
	TccStatusConfirmed = "confirmed"
	TccStatusCancelled = "cancelled"
)
