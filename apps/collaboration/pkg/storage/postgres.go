package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq"

	"alignify/collaboration/pkg/models"
)

type PostgresStorage struct {
	db *sql.DB
}

func NewPostgresStorage(connStr string) (*PostgresStorage, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	ps := &PostgresStorage{db: db}
	return ps, nil
}

func (p *PostgresStorage) DB() *sql.DB {
	return p.db
}

func (p *PostgresStorage) Users() UserRepository {
	return &postgresUserRepo{db: p.db}
}

func (p *PostgresStorage) Workspaces() WorkspaceRepository {
	return &postgresWorkspaceRepo{db: p.db}
}

func (p *PostgresStorage) Boards() BoardRepository {
	return &postgresBoardRepo{db: p.db}
}

func (p *PostgresStorage) Snapshots() SnapshotRepository {
	return &postgresSnapshotRepo{db: p.db}
}

func (p *PostgresStorage) Operations() OperationRepository {
	return &postgresOperationRepo{db: p.db}
}

func (p *PostgresStorage) Close() error {
	if p.db != nil {
		return p.db.Close()
	}
	return nil
}

func (p *PostgresStorage) RunMigrations(migrationsDir string) error {
	ctx := context.Background()

	// 1. Ensure schema_migrations table exists
	_, err := p.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	if err != nil {
		return fmt.Errorf("failed to create schema_migrations table: %w", err)
	}

	// 2. Read migration files
	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to read migrations dir %s: %w", migrationsDir, err)
	}

	var sqlFiles []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			sqlFiles = append(sqlFiles, f.Name())
		}
	}
	sort.Strings(sqlFiles)

	for _, filename := range sqlFiles {
		var exists bool
		err := p.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", filename).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration %s: %w", filename, err)
		}
		if exists {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, filename))
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", filename, err)
		}

		tx, err := p.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to start tx for migration %s: %w", filename, err)
		}

		if _, err := tx.ExecContext(ctx, string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to execute migration %s: %w", filename, err)
		}

		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", filename); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %s: %w", filename, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", filename, err)
		}
	}

	return nil
}

// ==========================================
// Postgres User Repository
// ==========================================

type postgresUserRepo struct {
	db *sql.DB
}

func (r *postgresUserRepo) CreateUser(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, display_name, avatar_color, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	now := time.Now().UTC()
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	if user.UpdatedAt.IsZero() {
		user.UpdatedAt = now
	}

	_, err := r.db.ExecContext(ctx, query,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.DisplayName,
		user.AvatarColor,
		user.CreatedAt,
		user.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			return ErrAlreadyExists
		}
		return err
	}
	return nil
}

func (r *postgresUserRepo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, display_name, avatar_color, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u models.User
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID,
		&u.Email,
		&u.PasswordHash,
		&u.DisplayName,
		&u.AvatarColor,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *postgresUserRepo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, display_name, avatar_color, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1)
	`
	var u models.User
	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&u.ID,
		&u.Email,
		&u.PasswordHash,
		&u.DisplayName,
		&u.AvatarColor,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *postgresUserRepo) UpdateUser(ctx context.Context, user *models.User) error {
	query := `
		UPDATE users
		SET display_name = $2, avatar_color = $3, password_hash = $4, updated_at = $5
		WHERE id = $1
	`
	user.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		user.ID,
		user.DisplayName,
		user.AvatarColor,
		user.PasswordHash,
		user.UpdatedAt,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ==========================================
// Postgres Workspace Repository
// ==========================================

type postgresWorkspaceRepo struct {
	db *sql.DB
}

func (r *postgresWorkspaceRepo) CreateWorkspace(ctx context.Context, ws *models.Workspace) error {
	query := `
		INSERT INTO workspaces (id, name, slug, description, owner_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	now := time.Now().UTC()
	if ws.CreatedAt.IsZero() {
		ws.CreatedAt = now
	}
	if ws.UpdatedAt.IsZero() {
		ws.UpdatedAt = now
	}

	_, err := r.db.ExecContext(ctx, query,
		ws.ID,
		ws.Name,
		ws.Slug,
		ws.Description,
		ws.OwnerID,
		ws.CreatedAt,
		ws.UpdatedAt,
	)
	return err
}

func (r *postgresWorkspaceRepo) GetWorkspaceByID(ctx context.Context, id string) (*models.Workspace, error) {
	query := `
		SELECT id, name, slug, description, owner_id, created_at, updated_at
		FROM workspaces
		WHERE id = $1
	`
	var ws models.Workspace
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&ws.ID,
		&ws.Name,
		&ws.Slug,
		&ws.Description,
		&ws.OwnerID,
		&ws.CreatedAt,
		&ws.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &ws, nil
}

func (r *postgresWorkspaceRepo) GetWorkspacesByUserID(ctx context.Context, userID string) ([]models.WorkspaceWithRole, error) {
	query := `
		SELECT
			w.id, w.name, w.slug, w.description, w.owner_id, w.created_at, w.updated_at,
			m.role,
			(SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.workspace_id = w.id) as member_count,
			(SELECT COUNT(*) FROM boards b WHERE b.workspace_id = w.id) as board_count
		FROM workspaces w
		JOIN workspace_memberships m ON w.id = m.workspace_id
		WHERE m.user_id = $1
		ORDER BY w.updated_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.WorkspaceWithRole
	for rows.Next() {
		var item models.WorkspaceWithRole
		err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Slug,
			&item.Description,
			&item.OwnerID,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.UserRole,
			&item.MemberCount,
			&item.BoardCount,
		)
		if err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

func (r *postgresWorkspaceRepo) UpdateWorkspace(ctx context.Context, ws *models.Workspace) error {
	query := `
		UPDATE workspaces
		SET name = $2, slug = $3, description = $4, updated_at = $5
		WHERE id = $1
	`
	ws.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		ws.ID,
		ws.Name,
		ws.Slug,
		ws.Description,
		ws.UpdatedAt,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *postgresWorkspaceRepo) DeleteWorkspace(ctx context.Context, id string) error {
	query := `DELETE FROM workspaces WHERE id = $1`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *postgresWorkspaceRepo) AddMember(ctx context.Context, membership *models.WorkspaceMembership) error {
	query := `
		INSERT INTO workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (workspace_id, user_id)
		DO UPDATE SET role = EXCLUDED.role, updated_at = EXCLUDED.updated_at
	`
	now := time.Now().UTC()
	if membership.CreatedAt.IsZero() {
		membership.CreatedAt = now
	}
	if membership.UpdatedAt.IsZero() {
		membership.UpdatedAt = now
	}

	_, err := r.db.ExecContext(ctx, query,
		membership.ID,
		membership.WorkspaceID,
		membership.UserID,
		membership.Role,
		membership.CreatedAt,
		membership.UpdatedAt,
	)
	return err
}

func (r *postgresWorkspaceRepo) GetMembership(ctx context.Context, workspaceID, userID string) (*models.WorkspaceMembership, error) {
	query := `
		SELECT id, workspace_id, user_id, role, created_at, updated_at
		FROM workspace_memberships
		WHERE workspace_id = $1 AND user_id = $2
	`
	var m models.WorkspaceMembership
	err := r.db.QueryRowContext(ctx, query, workspaceID, userID).Scan(
		&m.ID,
		&m.WorkspaceID,
		&m.UserID,
		&m.Role,
		&m.CreatedAt,
		&m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

func (r *postgresWorkspaceRepo) GetMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error) {
	query := `
		SELECT
			u.id, u.email, u.display_name, u.avatar_color,
			m.role, m.created_at
		FROM workspace_memberships m
		JOIN users u ON m.user_id = u.id
		WHERE m.workspace_id = $1
		ORDER BY m.created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []models.WorkspaceMember
	for rows.Next() {
		var m models.WorkspaceMember
		err := rows.Scan(
			&m.UserID,
			&m.Email,
			&m.DisplayName,
			&m.AvatarColor,
			&m.Role,
			&m.JoinedAt,
		)
		if err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (r *postgresWorkspaceRepo) UpdateMemberRole(ctx context.Context, workspaceID, userID string, role models.Role) error {
	query := `
		UPDATE workspace_memberships
		SET role = $3, updated_at = $4
		WHERE workspace_id = $1 AND user_id = $2
	`
	res, err := r.db.ExecContext(ctx, query, workspaceID, userID, role, time.Now().UTC())
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *postgresWorkspaceRepo) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	query := `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`
	res, err := r.db.ExecContext(ctx, query, workspaceID, userID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ==========================================
// Postgres Board Repository
// ==========================================

type postgresBoardRepo struct {
	db *sql.DB
}

func (r *postgresBoardRepo) CreateBoard(ctx context.Context, board *models.Board) error {
	query := `
		INSERT INTO boards (id, workspace_id, name, description, created_by, is_public, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	now := time.Now().UTC()
	if board.CreatedAt.IsZero() {
		board.CreatedAt = now
	}
	if board.UpdatedAt.IsZero() {
		board.UpdatedAt = now
	}

	_, err := r.db.ExecContext(ctx, query,
		board.ID,
		board.WorkspaceID,
		board.Name,
		board.Description,
		board.CreatedBy,
		board.IsPublic,
		board.CreatedAt,
		board.UpdatedAt,
	)
	return err
}

func (r *postgresBoardRepo) GetBoardByID(ctx context.Context, id string) (*models.Board, error) {
	query := `
		SELECT id, workspace_id, name, description, created_by, is_public, created_at, updated_at
		FROM boards
		WHERE id = $1
	`
	var b models.Board
	var createdBy sql.NullString
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&b.ID,
		&b.WorkspaceID,
		&b.Name,
		&b.Description,
		&createdBy,
		&b.IsPublic,
		&b.CreatedAt,
		&b.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if createdBy.Valid {
		b.CreatedBy = createdBy.String
	}
	return &b, nil
}

func (r *postgresBoardRepo) GetBoardsByWorkspaceID(ctx context.Context, workspaceID string) ([]models.Board, error) {
	query := `
		SELECT id, workspace_id, name, description, created_by, is_public, created_at, updated_at
		FROM boards
		WHERE workspace_id = $1
		ORDER BY updated_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var boards []models.Board
	for rows.Next() {
		var b models.Board
		var createdBy sql.NullString
		err := rows.Scan(
			&b.ID,
			&b.WorkspaceID,
			&b.Name,
			&b.Description,
			&createdBy,
			&b.IsPublic,
			&b.CreatedAt,
			&b.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdBy.Valid {
			b.CreatedBy = createdBy.String
		}
		boards = append(boards, b)
	}
	return boards, rows.Err()
}

func (r *postgresBoardRepo) UpdateBoard(ctx context.Context, board *models.Board) error {
	query := `
		UPDATE boards
		SET name = $2, description = $3, is_public = $4, updated_at = $5
		WHERE id = $1
	`
	board.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		board.ID,
		board.Name,
		board.Description,
		board.IsPublic,
		board.UpdatedAt,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *postgresBoardRepo) DeleteBoard(ctx context.Context, id string) error {
	query := `DELETE FROM boards WHERE id = $1`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *postgresBoardRepo) GetBoardEffectiveRole(ctx context.Context, boardID, userID string) (models.Role, error) {
	// Check direct board permission override first
	var role models.Role
	err := r.db.QueryRowContext(ctx, `
		SELECT role FROM board_permissions WHERE board_id = $1 AND user_id = $2
	`, boardID, userID).Scan(&role)
	if err == nil && role.IsValid() {
		return role, nil
	}

	// Otherwise check parent workspace role
	err = r.db.QueryRowContext(ctx, `
		SELECT m.role
		FROM boards b
		JOIN workspace_memberships m ON b.workspace_id = m.workspace_id
		WHERE b.id = $1 AND m.user_id = $2
	`, boardID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Check if board is public
			var isPublic bool
			errPub := r.db.QueryRowContext(ctx, `SELECT is_public FROM boards WHERE id = $1`, boardID).Scan(&isPublic)
			if errPub == nil && isPublic {
				return models.RoleViewer, nil
			}
			return "", ErrUnauthorized
		}
		return "", err
	}
	return role, nil
}

// ==========================================
// Postgres Snapshot Repository
// ==========================================

type postgresSnapshotRepo struct {
	db *sql.DB
}

func (r *postgresSnapshotRepo) SaveSnapshot(ctx context.Context, snapshot *models.BoardSnapshot) error {
	query := `
		INSERT INTO board_snapshots (board_id, seq, data, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	now := time.Now().UTC()
	if snapshot.CreatedAt.IsZero() {
		snapshot.CreatedAt = now
	}

	return r.db.QueryRowContext(ctx, query,
		snapshot.BoardID,
		snapshot.Seq,
		snapshot.Data,
		snapshot.CreatedBy,
		snapshot.CreatedAt,
	).Scan(&snapshot.ID)
}

func (r *postgresSnapshotRepo) GetLatestSnapshot(ctx context.Context, boardID string) (*models.BoardSnapshot, error) {
	query := `
		SELECT id, board_id, seq, data, created_by, created_at
		FROM board_snapshots
		WHERE board_id = $1
		ORDER BY seq DESC, id DESC
		LIMIT 1
	`
	var s models.BoardSnapshot
	var createdBy sql.NullString
	var rawData []byte
	err := r.db.QueryRowContext(ctx, query, boardID).Scan(
		&s.ID,
		&s.BoardID,
		&s.Seq,
		&rawData,
		&createdBy,
		&s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if createdBy.Valid {
		s.CreatedBy = createdBy.String
	}
	s.Data = json.RawMessage(rawData)
	return &s, nil
}

// ==========================================
// Postgres Operation Repository
// ==========================================

type postgresOperationRepo struct {
	db *sql.DB
}

func (r *postgresOperationRepo) AppendOperation(ctx context.Context, op *models.OperationRecord) error {
	query := `
		INSERT INTO operation_log (board_id, seq, user_id, op_type, payload, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	now := time.Now().UTC()
	if op.CreatedAt.IsZero() {
		op.CreatedAt = now
	}

	err := r.db.QueryRowContext(ctx, query,
		op.BoardID,
		op.Seq,
		op.UserID,
		op.OpType,
		op.Payload,
		op.CreatedAt,
	).Scan(&op.ID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "uq_board_seq") {
			return ErrOperationConflict
		}
		return err
	}
	return nil
}

func (r *postgresOperationRepo) GetOperationsAfterSeq(ctx context.Context, boardID string, afterSeq int64) ([]models.OperationRecord, error) {
	query := `
		SELECT id, board_id, seq, user_id, op_type, payload, created_at
		FROM operation_log
		WHERE board_id = $1 AND seq > $2
		ORDER BY seq ASC
	`
	rows, err := r.db.QueryContext(ctx, query, boardID, afterSeq)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []models.OperationRecord
	for rows.Next() {
		var op models.OperationRecord
		var rawPayload []byte
		err := rows.Scan(
			&op.ID,
			&op.BoardID,
			&op.Seq,
			&op.UserID,
			&op.OpType,
			&rawPayload,
			&op.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		op.Payload = json.RawMessage(rawPayload)
		ops = append(ops, op)
	}
	return ops, rows.Err()
}
