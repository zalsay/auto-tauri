package sse

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type Event struct {
	ID    string      `json:"id,omitempty"`
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
	Retry int         `json:"retry,omitempty"`
}

type Client struct {
	ID        string
	Channel   chan *Event
	CreatedAt time.Time
}

type Broker struct {
	clients    map[string]*Client
	register   chan *Client
	unregister chan string
	mu         sync.RWMutex
	broadcast  chan *Event
}

var globalBroker *Broker

func InitBroker() {
	globalBroker = NewBroker()
	go globalBroker.Run()
}

func GetBroker() *Broker {
	return globalBroker
}

func NewBroker() *Broker {
	return &Broker{
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan string),
		broadcast:  make(chan *Event, 256),
	}
}

func (b *Broker) Run() {
	for {
		select {
		case client := <-b.register:
			b.mu.Lock()
			b.clients[client.ID] = client
			b.mu.Unlock()
		case clientID := <-b.unregister:
			b.mu.Lock()
			if client, ok := b.clients[clientID]; ok {
				close(client.Channel)
				delete(b.clients, clientID)
			}
			b.mu.Unlock()
		case event := <-b.broadcast:
			b.mu.RLock()
			for _, client := range b.clients {
				select {
				case client.Channel <- event:
				default:
				}
			}
			b.mu.RUnlock()
		}
	}
}

func (b *Broker) Register(clientID string) *Client {
	client := &Client{
		ID:        clientID,
		Channel:   make(chan *Event, 256),
		CreatedAt: time.Now(),
	}
	b.register <- client
	return client
}

func (b *Broker) Unregister(clientID string) {
	b.unregister <- clientID
}

func (b *Broker) Broadcast(event *Event) {
	b.broadcast <- event
}

func (b *Broker) SendToClient(clientID string, event *Event) error {
	b.mu.RLock()
	client, ok := b.clients[clientID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("client not found: %s", clientID)
	}

	select {
	case client.Channel <- event:
		return nil
	default:
		return fmt.Errorf("client channel full: %s", clientID)
	}
}

func (b *Broker) GetClientCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.clients)
}

func (e *Event) String() string {
	data, _ := json.Marshal(e.Data)
	var result string
	if e.ID != "" {
		result += fmt.Sprintf("id: %s\n", e.ID)
	}
	if e.Event != "" {
		result += fmt.Sprintf("event: %s\n", e.Event)
	}
	if e.Retry > 0 {
		result += fmt.Sprintf("retry: %d\n", e.Retry)
	}
	result += fmt.Sprintf("data: %s\n\n", string(data))
	return result
}

func NewEvent(eventType string, data interface{}) *Event {
	return &Event{
		Event: eventType,
		Data:  data,
	}
}

func NewErrorEvent(message string) *Event {
	return &Event{
		Event: "error",
		Data: map[string]string{
			"message": message,
		},
	}
}

func NewMessageEvent(data interface{}) *Event {
	return &Event{
		Event: "message",
		Data:  data,
	}
}

func NewToolCallEvent(data interface{}) *Event {
	return &Event{
		Event: "tool_call",
		Data:  data,
	}
}

func NewStatusEvent(data interface{}) *Event {
	return &Event{
		Event: "status",
		Data:  data,
	}
}
