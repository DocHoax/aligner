package protocol

import (
	"encoding/json"
	"time"
)

// Point represents a 2D coordinate in world space.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Rect represents a 2D bounding rectangle.
type Rect struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// UserPresence holds dynamic presence information for a connected user.
type UserPresence struct {
	UserID      string   `json:"userId"`
	UserName    string   `json:"userName"`
	UserColor   string   `json:"userColor"`
	Cursor      *Point   `json:"cursor,omitempty"`
	SelectedIDs []string `json:"selectedIds"`
	LastActive  int64    `json:"lastActive"`
}

// DocumentOperation represents an atomic change to the canvas scene.
type DocumentOperation struct {
	Op         string                 `json:"op"`
	ID         string                 `json:"id,omitempty"`
	Object     map[string]interface{} `json:"object,omitempty"`
	X          float64                `json:"x,omitempty"`
	Y          float64                `json:"y,omitempty"`
	Width      float64                `json:"width,omitempty"`
	Height     float64                `json:"height,omitempty"`
	Rotation   float64                `json:"rotation,omitempty"`
	Changes    map[string]interface{} `json:"changes,omitempty"`
	GroupID    string                 `json:"groupId,omitempty"`
	ChildIDs   []string               `json:"childIds,omitempty"`
	Operations []DocumentOperation    `json:"operations,omitempty"`
}

// ClientMessageType defines supported client envelope types.
type ClientMessageType string

const (
	ClientMsgJoin        ClientMessageType = "join"
	ClientMsgLeave       ClientMessageType = "leave"
	ClientMsgOperation   ClientMessageType = "operation"
	ClientMsgCursor      ClientMessageType = "cursor"
	ClientMsgSelection   ClientMessageType = "selection"
	ClientMsgSyncRequest ClientMessageType = "sync_request"
	ClientMsgHeartbeat   ClientMessageType = "heartbeat"
)

// ClientMessage represents an incoming message from a client over WebSocket.
type ClientMessage struct {
	Type      ClientMessageType `json:"type"`
	BoardID   string            `json:"boardId"`
	UserID    string            `json:"userId"`
	Timestamp int64             `json:"timestamp"`
	Payload   json.RawMessage   `json:"payload"`
}

// NewClientMessage creates a client message with a current timestamp.
func NewClientMessage(msgType ClientMessageType, boardID, userID string, payload interface{}) *ClientMessage {
	data, err := json.Marshal(payload)
	if err != nil {
		data = []byte("null")
	}
	return &ClientMessage{
		Type:      msgType,
		BoardID:   boardID,
		UserID:    userID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   data,
	}
}

// ServerMessageType defines supported server envelope types.
type ServerMessageType string

const (
	ServerMsgJoined     ServerMessageType = "joined"
	ServerMsgUserJoined ServerMessageType = "user_joined"
	ServerMsgUserLeft   ServerMessageType = "user_left"
	ServerMsgOperation  ServerMessageType = "operation"
	ServerMsgCursor     ServerMessageType = "cursor"
	ServerMsgSelection  ServerMessageType = "selection"
	ServerMsgSnapshot   ServerMessageType = "snapshot"
	ServerMsgAck        ServerMessageType = "ack"
	ServerMsgError      ServerMessageType = "error"
)

// ServerMessage represents an outgoing message from the server over WebSocket.
type ServerMessage struct {
	Type      ServerMessageType `json:"type"`
	BoardID   string            `json:"boardId"`
	Timestamp int64             `json:"timestamp"`
	Payload   interface{}       `json:"payload"`
}

// Payload structs

type JoinPayload struct {
	UserName  string `json:"userName"`
	UserColor string `json:"userColor"`
}

type CursorPayload struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type SelectionPayload struct {
	SelectedIDs []string `json:"selectedIds"`
}

type OperationPayload struct {
	Operation DocumentOperation `json:"operation"`
	Seq       int64             `json:"seq,omitempty"`
}

type SyncRequestPayload struct {
	LastKnownSeq int64 `json:"lastKnownSeq,omitempty"`
}

type JoinedPayload struct {
	UserID   string                   `json:"userId"`
	BoardID  string                   `json:"boardId"`
	Users    []UserPresence           `json:"users"`
	Snapshot []map[string]interface{} `json:"snapshot"`
	Seq      int64                    `json:"seq"`
}

type UserJoinedPayload struct {
	User UserPresence `json:"user"`
}

type UserLeftPayload struct {
	UserID string `json:"userId"`
}

type RemoteOperationPayload struct {
	UserID    string            `json:"userId"`
	Operation DocumentOperation `json:"operation"`
	Seq       int64             `json:"seq"`
}

type RemoteCursorPayload struct {
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	UserColor string `json:"userColor"`
	Cursor    Point  `json:"cursor"`
}

type RemoteSelectionPayload struct {
	UserID      string   `json:"userId"`
	UserName    string   `json:"userName"`
	UserColor   string   `json:"userColor"`
	SelectedIDs []string `json:"selectedIds"`
}

type SnapshotPayload struct {
	BoardID string                   `json:"boardId"`
	Objects []map[string]interface{} `json:"objects"`
	Seq     int64                    `json:"seq"`
}

type AckPayload struct {
	Seq int64 `json:"seq"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewServerMessage creates a ServerMessage with current timestamp.
func NewServerMessage(msgType ServerMessageType, boardID string, payload interface{}) *ServerMessage {
	return &ServerMessage{
		Type:      msgType,
		BoardID:   boardID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}
}
