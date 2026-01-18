package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"opencode-server/core/middleware"
	"opencode-server/pkg/sse"
)

type SSEHandler struct {
	broker *sse.Broker
}

func NewSSEHandler(broker *sse.Broker) *SSEHandler {
	return &SSEHandler{
		broker: broker,
	}
}

func (h *SSEHandler) StreamSessionEvents(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessionID := c.Param("id")

	clientID := fmt.Sprintf("%s-%s", sessionID, uuid.NewString()[:8])
	client := h.broker.Register(clientID)
	defer h.broker.Unregister(clientID)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	c.SSEvent("connected", gin.H{
		"clientId":  clientID,
		"session":   sessionID,
		"timestamp": time.Now().Unix(),
	})

	c.Writer.Flush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case event, ok := <-client.Channel:
			if !ok {
				return
			}
			c.SSEvent(event.Event, event.Data)
			c.Writer.Flush()
		case <-ticker.C:
			c.SSEvent("heartbeat", gin.H{
				"timestamp": time.Now().Unix(),
			})
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}

func (h *SSEHandler) BroadcastSessionEvent(sessionID string, event *sse.Event) {
	h.broker.SendToClient(sessionID, event)
}

func SetupSSERoutes(r *gin.Engine, broker *sse.Broker) {
	sseHandler := NewSSEHandler(broker)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/events/sessions/:id", sseHandler.StreamSessionEvents)
	}
}
