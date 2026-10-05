package storage

import (
	"context"
	"errors"

	"alignify/collaboration/pkg/models"
)

var (
	ErrNotFound          = errors.New("record not found")
	ErrAlreadyExists     = errors.New("record already exists")
	ErrUnauthorized      = errors.New("unauthorized access")
	ErrInvalidInput      = errors.New("invalid input data")
	ErrOperationConflict = errors.New("operation sequence conflict")
)

// UserRepository handles user persistence
type UserRepository interface {
	CreateUser(ctx context.Context, user *models.User) error
	GetUserByID(ctx context.Context, id string) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	UpdateUser(ctx context.Context, user *models.User) error
}

// WorkspaceRepository handles workspace multi-tenancy and memberships
type WorkspaceRepository interface {
	CreateWorkspace(ctx context.Context, ws *models.Workspace) error
	GetWorkspaceByID(ctx context.Context, id string) (*models.Workspace, error)
	GetWorkspacesByUserID(ctx context.Context, userID string) ([]models.WorkspaceWithRole, error)
	UpdateWorkspace(ctx context.Context, ws *models.Workspace) error
	DeleteWorkspace(ctx context.Context, id string) error

	AddMember(ctx context.Context, membership *models.WorkspaceMembership) error
	GetMembership(ctx context.Context, workspaceID, userID string) (*models.WorkspaceMembership, error)
	GetMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error)
	UpdateMemberRole(ctx context.Context, workspaceID, userID string, role models.Role) error
	RemoveMember(ctx context.Context, workspaceID, userID string) error
}

// BoardRepository handles boards and permission checks
type BoardRepository interface {
	CreateBoard(ctx context.Context, board *models.Board) error
	GetBoardByID(ctx context.Context, id string) (*models.Board, error)
	GetBoardsByWorkspaceID(ctx context.Context, workspaceID string) ([]models.Board, error)
	UpdateBoard(ctx context.Context, board *models.Board) error
	DeleteBoard(ctx context.Context, id string) error
	GetBoardEffectiveRole(ctx context.Context, boardID, userID string) (models.Role, error)
}

// SnapshotRepository handles point-in-time board state saves and recovery
type SnapshotRepository interface {
	SaveSnapshot(ctx context.Context, snapshot *models.BoardSnapshot) error
	GetLatestSnapshot(ctx context.Context, boardID string) (*models.BoardSnapshot, error)
}

// OperationRepository handles append-only operation logs
type OperationRepository interface {
	AppendOperation(ctx context.Context, op *models.OperationRecord) error
	GetOperationsAfterSeq(ctx context.Context, boardID string, afterSeq int64) ([]models.OperationRecord, error)
}

// Storage represents the unified database abstraction
type Storage interface {
	Users() UserRepository
	Workspaces() WorkspaceRepository
	Boards() BoardRepository
	Snapshots() SnapshotRepository
	Operations() OperationRepository
	Close() error
}
