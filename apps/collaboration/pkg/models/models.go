package models

import (
	"encoding/json"
	"time"
)

// Role defines role-based access levels
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

func (r Role) IsValid() bool {
	return r == RoleOwner || r == RoleEditor || r == RoleViewer
}

func (r Role) CanWrite() bool {
	return r == RoleOwner || r == RoleEditor
}

func (r Role) CanAdmin() bool {
	return r == RoleOwner
}

// User represents an authenticated user in the system
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"displayName"`
	AvatarColor  string    `json:"avatarColor"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// UserPublic represents the sanitized user profile for client responses
type UserPublic struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	AvatarColor string    `json:"avatarColor"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		AvatarColor: u.AvatarColor,
		CreatedAt:   u.CreatedAt,
	}
}

// Workspace represents a multi-tenant workspace partitioning diagrams and users
type Workspace struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	OwnerID     string    `json:"ownerId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// WorkspaceWithRole includes user's role and aggregate stats
type WorkspaceWithRole struct {
	Workspace
	UserRole    Role `json:"userRole"`
	MemberCount int  `json:"memberCount"`
	BoardCount  int  `json:"boardCount"`
}

// WorkspaceMembership links users to workspaces with roles
type WorkspaceMembership struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	UserID      string    `json:"userId"`
	Role        Role      `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// WorkspaceMember represents a member with their user profile details
type WorkspaceMember struct {
	UserID      string    `json:"userId"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	AvatarColor string    `json:"avatarColor"`
	Role        Role      `json:"role"`
	JoinedAt    time.Time `json:"joinedAt"`
}

// Board represents a diagram/canvas document within a workspace
type Board struct {
	ID           string    `json:"id"`
	WorkspaceID  string    `json:"workspaceId"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	CreatedBy    string    `json:"createdBy"`
	IsPublic     bool      `json:"isPublic"`
	ThumbnailURL string    `json:"thumbnailUrl,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// BoardWithRole includes effective role for the current user
type BoardWithRole struct {
	Board
	UserRole      Role   `json:"userRole"`
	WorkspaceName string `json:"workspaceName,omitempty"`
	IsFavorite    bool   `json:"isFavorite"`
}

// BoardPermission represents explicit board-level permissions (optional override)
type BoardPermission struct {
	ID        string    `json:"id"`
	BoardID   string    `json:"boardId"`
	UserID    string    `json:"userId"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// BoardComment represents a threaded comment or spatial pin on a board
type BoardComment struct {
	ID              string         `json:"id"`
	BoardID         string         `json:"boardId"`
	ParentID        *string        `json:"parentId,omitempty"`
	UserID          string         `json:"userId"`
	UserName        string         `json:"userName,omitempty"`
	UserAvatarColor string         `json:"userAvatarColor,omitempty"`
	Content         string         `json:"content"`
	X               *float64       `json:"x,omitempty"`
	Y               *float64       `json:"y,omitempty"`
	TargetObjectID  *string        `json:"targetObjectId,omitempty"`
	Resolved        bool           `json:"resolved"`
	ResolvedBy      *string        `json:"resolvedBy,omitempty"`
	ResolvedAt      *time.Time     `json:"resolvedAt,omitempty"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	Replies         []BoardComment `json:"replies,omitempty"`
}

// BoardActivity represents an audit event on a board
type BoardActivity struct {
	ID              int64           `json:"id"`
	BoardID         string          `json:"boardId"`
	UserID          string          `json:"userId"`
	UserName        string          `json:"userName,omitempty"`
	UserAvatarColor string          `json:"userAvatarColor,omitempty"`
	ActionType      string          `json:"actionType"`
	Description     string          `json:"description"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
}

// BoardFavorite represents a user-starred board
type BoardFavorite struct {
	UserID    string    `json:"userId"`
	BoardID   string    `json:"boardId"`
	CreatedAt time.Time `json:"createdAt"`
}

// BoardSnapshot represents a compacted point-in-time state of a board
type BoardSnapshot struct {
	ID        int64           `json:"id"`
	BoardID   string          `json:"boardId"`
	Seq       int64           `json:"seq"`
	Data      json.RawMessage `json:"data"` // JSON array of CanvasObject
	CreatedBy string          `json:"createdBy,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
}

// OperationRecord represents an append-only persisted document mutation
type OperationRecord struct {
	ID        int64           `json:"id"`
	BoardID   string          `json:"boardId"`
	Seq       int64           `json:"seq"`
	UserID    string          `json:"userId"`
	OpType    string          `json:"opType"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"createdAt"`
}
