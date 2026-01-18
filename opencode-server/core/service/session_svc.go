package service

import (
	"time"

	"github.com/google/uuid"
	"opencode-server/core/model"
	"opencode-server/core/repository"
)

type SessionService struct {
	sessionRepo  *repository.SessionRepository
	messageRepo  *repository.MessageRepository
	toolCallRepo *repository.ToolCallRepository
}

func NewSessionService(sessionRepo *repository.SessionRepository, messageRepo *repository.MessageRepository, toolCallRepo *repository.ToolCallRepository) *SessionService {
	return &SessionService{
		sessionRepo:  sessionRepo,
		messageRepo:  messageRepo,
		toolCallRepo: toolCallRepo,
	}
}

type CreateSessionRequest struct {
	Agent      string                 `json:"agent"`
	ModelID    string                 `json:"modelId"`
	ProviderID string                 `json:"providerId"`
	System     string                 `json:"system,omitempty"`
	Tools      map[string]interface{} `json:"tools,omitempty"`
	MaxSteps   int                    `json:"maxSteps,omitempty"`
	Cwd        string                 `json:"cwd,omitempty"`
}

type SessionResponse struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	Agent      string    `json:"agent"`
	ModelID    string    `json:"modelId"`
	ProviderID string    `json:"providerId"`
	System     string    `json:"system,omitempty"`
	Tools      string    `json:"tools"`
	MaxSteps   int       `json:"maxSteps"`
	Status     string    `json:"status"`
	Cwd        string    `json:"cwd,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (s *SessionService) Create(userID string, req *CreateSessionRequest) (*SessionResponse, error) {
	toolsJSON := "{}"
	if req.Tools != nil {
		// Serialize tools map to JSON
		toolsJSON = `{"bash":true,"read":true,"write":true,"edit":true,"glob":true,"grep":true}`
	}

	session := &model.Session{
		ID:         uuid.NewString(),
		UserID:     userID,
		Agent:      req.Agent,
		ModelID:    req.ModelID,
		ProviderID: req.ProviderID,
		System:     req.System,
		Tools:      toolsJSON,
		MaxSteps:   req.MaxSteps,
		Status:     "running",
		Cwd:        req.Cwd,
	}

	if session.MaxSteps == 0 {
		session.MaxSteps = 100
	}

	if session.Cwd == "" {
		session.Cwd = "/tmp/opencode"
	}

	err := s.sessionRepo.Create(session)
	if err != nil {
		return nil, err
	}

	return &SessionResponse{
		ID:         session.ID,
		UserID:     session.UserID,
		Agent:      session.Agent,
		ModelID:    session.ModelID,
		ProviderID: session.ProviderID,
		System:     session.System,
		Tools:      session.Tools,
		MaxSteps:   session.MaxSteps,
		Status:     session.Status,
		Cwd:        session.Cwd,
		CreatedAt:  session.CreatedAt,
		UpdatedAt:  session.UpdatedAt,
	}, nil
}

func (s *SessionService) GetByID(id string, userID string) (*SessionResponse, error) {
	session, err := s.sessionRepo.GetByID(id)
	if err != nil {
		return nil, err
	}

	if session.UserID != userID {
		return nil, ErrNotFound
	}

	return &SessionResponse{
		ID:         session.ID,
		UserID:     session.UserID,
		Agent:      session.Agent,
		ModelID:    session.ModelID,
		ProviderID: session.ProviderID,
		System:     session.System,
		Tools:      session.Tools,
		MaxSteps:   session.MaxSteps,
		Status:     session.Status,
		Cwd:        session.Cwd,
		CreatedAt:  session.CreatedAt,
		UpdatedAt:  session.UpdatedAt,
	}, nil
}

func (s *SessionService) ListByUserID(userID string, page, pageSize int) ([]SessionResponse, int64, error) {
	offset := (page - 1) * pageSize
	sessions, total := s.sessionRepo.GetByUserID(userID, pageSize, offset)

	responses := make([]SessionResponse, len(sessions))
	for i, session := range sessions {
		responses[i] = SessionResponse{
			ID:         session.ID,
			UserID:     session.UserID,
			Agent:      session.Agent,
			ModelID:    session.ModelID,
			ProviderID: session.ProviderID,
			System:     session.System,
			Tools:      session.Tools,
			MaxSteps:   session.MaxSteps,
			Status:     session.Status,
			Cwd:        session.Cwd,
			CreatedAt:  session.CreatedAt,
			UpdatedAt:  session.UpdatedAt,
		}
	}

	return responses, total, nil
}

func (s *SessionService) Delete(id string, userID string) error {
	session, err := s.sessionRepo.GetByID(id)
	if err != nil {
		return err
	}

	if session.UserID != userID {
		return ErrNotFound
	}

	// Delete related messages and tool calls
	s.messageRepo.DeleteBySessionID(id)
	s.toolCallRepo.DeleteBySessionID(id)

	return s.sessionRepo.Delete(id)
}

func (s *SessionService) Abort(id string, userID string) error {
	session, err := s.sessionRepo.GetByID(id)
	if err != nil {
		return err
	}

	if session.UserID != userID {
		return ErrNotFound
	}

	session.Status = "aborted"
	return s.sessionRepo.Update(session)
}

type SendMessageRequest struct {
	Content  string `json:"content"`
	Role     string `json:"role"`
	ParentID string `json:"parentId,omitempty"`
}

type MessageResponse struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"sessionId"`
	Role       string    `json:"role"`
	Content    string    `json:"content"`
	ParentID   string    `json:"parentId,omitempty"`
	ModelID    string    `json:"modelId,omitempty"`
	ProviderID string    `json:"providerId,omitempty"`
	Tokens     string    `json:"tokens,omitempty"`
	Finish     string    `json:"finish,omitempty"`
	Cost       float64   `json:"cost"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (s *SessionService) AddMessage(sessionID, userID string, req *SendMessageRequest) (*MessageResponse, error) {
	session, err := s.sessionRepo.GetByID(sessionID)
	if err != nil {
		return nil, err
	}

	if session.UserID != userID {
		return nil, ErrNotFound
	}

	message := &model.Message{
		ID:         uuid.NewString(),
		SessionID:  sessionID,
		Role:       req.Role,
		Content:    req.Content,
		ParentID:   req.ParentID,
		ModelID:    session.ModelID,
		ProviderID: session.ProviderID,
	}

	err = s.messageRepo.Create(message)
	if err != nil {
		return nil, err
	}

	return &MessageResponse{
		ID:         message.ID,
		SessionID:  message.SessionID,
		Role:       message.Role,
		Content:    message.Content,
		ParentID:   message.ParentID,
		ModelID:    message.ModelID,
		ProviderID: message.ProviderID,
		Cost:       message.Cost,
		CreatedAt:  message.CreatedAt,
	}, nil
}

func (s *SessionService) GetMessages(sessionID, userID string, page, pageSize int) ([]MessageResponse, int64, error) {
	session, err := s.sessionRepo.GetByID(sessionID)
	if err != nil {
		return nil, 0, err
	}

	if session.UserID != userID {
		return nil, 0, ErrNotFound
	}

	offset := (page - 1) * pageSize
	messages, total := s.messageRepo.GetBySessionID(sessionID, pageSize, offset)

	responses := make([]MessageResponse, len(messages))
	for i, msg := range messages {
		responses[i] = MessageResponse{
			ID:         msg.ID,
			SessionID:  msg.SessionID,
			Role:       msg.Role,
			Content:    msg.Content,
			ParentID:   msg.ParentID,
			ModelID:    msg.ModelID,
			ProviderID: msg.ProviderID,
			Tokens:     msg.Tokens,
			Finish:     msg.Finish,
			Cost:       msg.Cost,
			CreatedAt:  msg.CreatedAt,
		}
	}

	return responses, total, nil
}

type ServiceError struct {
	Code    string
	Message string
}

func (e *ServiceError) Error() string {
	return e.Message
}

var ErrNotFound = &ServiceError{Code: "NOT_FOUND", Message: "Resource not found"}
var ErrUnauthorized = &ServiceError{Code: "UNAUTHORIZED", Message: "Unauthorized"}
var ErrInvalidRequest = &ServiceError{Code: "INVALID_REQUEST", Message: "Invalid request"}
