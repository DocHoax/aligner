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
	GetBoardsByWorkspaceIDFiltered(ctx context.Context, workspaceID, userID, query, sortBy string, favoritesOnly bool) ([]models.BoardWithRole, error)
	UpdateBoard(ctx context.Context, board *models.Board) error
	UpdateBoardThumbnail(ctx context.Context, boardID, thumbnailURL string) error
	DeleteBoard(ctx context.Context, id string) error
	GetBoardEffectiveRole(ctx context.Context, boardID, userID string) (models.Role, error)
}

// SnapshotRepository handles point-in-time board state saves and recovery
type SnapshotRepository interface {
	SaveSnapshot(ctx context.Context, snapshot *models.BoardSnapshot) error
	GetLatestSnapshot(ctx context.Context, boardID string) (*models.BoardSnapshot, error)
	ListSnapshots(ctx context.Context, boardID string) ([]models.BoardSnapshot, error)
	GetSnapshotByID(ctx context.Context, id int64) (*models.BoardSnapshot, error)
}

// OperationRepository handles append-only operation logs
type OperationRepository interface {
	AppendOperation(ctx context.Context, op *models.OperationRecord) error
	GetOperationsAfterSeq(ctx context.Context, boardID string, afterSeq int64) ([]models.OperationRecord, error)
}

// CommentRepository handles threaded board comments and spatial pins
type CommentRepository interface {
	CreateComment(ctx context.Context, comment *models.BoardComment) error
	GetCommentsByBoardID(ctx context.Context, boardID string) ([]models.BoardComment, error)
	GetCommentByID(ctx context.Context, id string) (*models.BoardComment, error)
	UpdateComment(ctx context.Context, comment *models.BoardComment) error
	DeleteComment(ctx context.Context, id string) error
}

// ActivityRepository handles audit activity logs
type ActivityRepository interface {
	LogActivity(ctx context.Context, activity *models.BoardActivity) error
	GetActivitiesByBoardID(ctx context.Context, boardID string, limit, offset int) ([]models.BoardActivity, error)
}

// FavoriteRepository handles starred boards per user
type FavoriteRepository interface {
	AddFavorite(ctx context.Context, userID, boardID string) error
	RemoveFavorite(ctx context.Context, userID, boardID string) error
	IsFavorite(ctx context.Context, userID, boardID string) (bool, error)
	GetUserFavoriteBoardIDs(ctx context.Context, userID string) ([]string, error)
}

// Storage represents the unified database abstraction
type Storage interface {
	Users() UserRepository
	Workspaces() WorkspaceRepository
	Boards() BoardRepository
	Snapshots() SnapshotRepository
	Operations() OperationRepository
	Comments() CommentRepository
	Activity() ActivityRepository
	Favorites() FavoriteRepository
	Close() error
}
