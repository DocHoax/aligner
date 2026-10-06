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

func (p *PostgresStorage) Comments() CommentRepository {
	return &postgresCommentRepo{db: p.db}
}

func (p *PostgresStorage) Activity() ActivityRepository {
	return &postgresActivityRepo{db: p.db}
}

func (p *PostgresStorage) Favorites() FavoriteRepository {
	return &postgresFavoriteRepo{db: p.db}
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

	// 3. Apply pending migrations inside transactions
	for _, fileName := range sqlFiles {
		var applied string
		checkErr := p.db.QueryRowContext(ctx, `
			SELECT version FROM schema_migrations WHERE version = $1
		`, fileName).Scan(&applied)

		if checkErr == nil {
			continue // Already applied
		}

		filePath := filepath.Join(migrationsDir, fileName)
		content, readErr := os.ReadFile(filePath)
		if readErr != nil {
			return fmt.Errorf("failed to read migration %s: %w", fileName, readErr)
		}

		tx, txErr := p.db.BeginTx(ctx, nil)
		if txErr != nil {
			return fmt.Errorf("failed to start tx for %s: %w", fileName, txErr)
		}

		if _, execErr := tx.ExecContext(ctx, string(content)); execErr != nil {
			tx.Rollback()
			return fmt.Errorf("failed to execute migration %s: %w", fileName, execErr)
		}

		if _, logErr := tx.ExecContext(ctx, `
			INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())
		`, fileName); logErr != nil {
			tx.Rollback()
			return fmt.Errorf("failed to log migration %s: %w", fileName, logErr)
		}

		if commitErr := tx.Commit(); commitErr != nil {
			return fmt.Errorf("failed to commit migration %s: %w", fileName, commitErr)
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
		SET display_name = $2, avatar_color = $3, updated_at = $4
		WHERE id = $1
	`
	user.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		user.ID,
		user.DisplayName,
		user.AvatarColor,
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
		INSERT INTO boards (id, workspace_id, name, description, created_by, is_public, thumbnail_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
		board.ThumbnailURL,
		board.CreatedAt,
		board.UpdatedAt,
	)
	return err
}

func (r *postgresBoardRepo) GetBoardByID(ctx context.Context, id string) (*models.Board, error) {
	query := `
		SELECT id, workspace_id, name, description, created_by, is_public, COALESCE(thumbnail_url, ''), created_at, updated_at
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
		&b.ThumbnailURL,
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
		SELECT id, workspace_id, name, description, created_by, is_public, COALESCE(thumbnail_url, ''), created_at, updated_at
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
			&b.ThumbnailURL,
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

func (r *postgresBoardRepo) GetBoardsByWorkspaceIDFiltered(ctx context.Context, workspaceID, userID, query, sortBy string, favoritesOnly bool) ([]models.BoardWithRole, error) {
	var orderByClause string
	switch sortBy {
	case "name":
		orderByClause = "ORDER BY LOWER(b.name) ASC"
	case "created":
		orderByClause = "ORDER BY b.created_at DESC"
	default:
		orderByClause = "ORDER BY b.updated_at DESC"
	}

	q := fmt.Sprintf(`
		SELECT
			b.id, b.workspace_id, b.name, b.description, b.created_by, b.is_public,
			COALESCE(b.thumbnail_url, ''), b.created_at, b.updated_at,
			COALESCE(bp.role, m.role, CASE WHEN b.is_public THEN 'viewer' ELSE '' END) AS user_role,
			w.name AS workspace_name,
			CASE WHEN bf.board_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_favorite
		FROM boards b
		JOIN workspaces w ON b.workspace_id = w.id
		LEFT JOIN workspace_memberships m ON b.workspace_id = m.workspace_id AND m.user_id = $2
		LEFT JOIN board_permissions bp ON b.id = bp.board_id AND bp.user_id = $2
		LEFT JOIN board_favorites bf ON b.id = bf.board_id AND bf.user_id = $2
		WHERE b.workspace_id = $1
		  AND ($3 = '' OR LOWER(b.name) LIKE '%%' || LOWER($3) || '%%' OR LOWER(b.description) LIKE '%%' || LOWER($3) || '%%')
		  AND ($4 = FALSE OR bf.board_id IS NOT NULL)
		%s
	`, orderByClause)

	rows, err := r.db.QueryContext(ctx, q, workspaceID, userID, strings.TrimSpace(query), favoritesOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.BoardWithRole
	for rows.Next() {
		var item models.BoardWithRole
		var createdBy sql.NullString
		var userRole string
		err := rows.Scan(
			&item.ID,
			&item.WorkspaceID,
			&item.Name,
			&item.Description,
			&createdBy,
			&item.IsPublic,
			&item.ThumbnailURL,
			&item.CreatedAt,
			&item.UpdatedAt,
			&userRole,
			&item.WorkspaceName,
			&item.IsFavorite,
		)
		if err != nil {
			return nil, err
		}
		if createdBy.Valid {
			item.CreatedBy = createdBy.String
		}
		item.UserRole = models.Role(userRole)
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *postgresBoardRepo) UpdateBoard(ctx context.Context, board *models.Board) error {
	query := `
		UPDATE boards
		SET name = $2, description = $3, is_public = $4, thumbnail_url = CASE WHEN $5 != '' THEN $5 ELSE thumbnail_url END, updated_at = $6
		WHERE id = $1
	`
	board.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		board.ID,
		board.Name,
		board.Description,
		board.IsPublic,
		board.ThumbnailURL,
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

func (r *postgresBoardRepo) UpdateBoardThumbnail(ctx context.Context, boardID, thumbnailURL string) error {
	query := `
		UPDATE boards
		SET thumbnail_url = $2, updated_at = $3
		WHERE id = $1
	`
	res, err := r.db.ExecContext(ctx, query, boardID, thumbnailURL, time.Now().UTC())
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

func (r *postgresSnapshotRepo) ListSnapshots(ctx context.Context, boardID string) ([]models.BoardSnapshot, error) {
	query := `
		SELECT id, board_id, seq, data, created_by, created_at
		FROM board_snapshots
		WHERE board_id = $1
		ORDER BY seq DESC, id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.BoardSnapshot
	for rows.Next() {
		var s models.BoardSnapshot
		var createdBy sql.NullString
		var rawData []byte
		err := rows.Scan(
			&s.ID,
			&s.BoardID,
			&s.Seq,
			&rawData,
			&createdBy,
			&s.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdBy.Valid {
			s.CreatedBy = createdBy.String
		}
		s.Data = json.RawMessage(rawData)
		list = append(list, s)
	}
	return list, rows.Err()
}

func (r *postgresSnapshotRepo) GetSnapshotByID(ctx context.Context, id int64) (*models.BoardSnapshot, error) {
	query := `
		SELECT id, board_id, seq, data, created_by, created_at
		FROM board_snapshots
		WHERE id = $1
	`
	var s models.BoardSnapshot
	var createdBy sql.NullString
	var rawData []byte
	err := r.db.QueryRowContext(ctx, query, id).Scan(
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

// ==========================================
// Postgres Comment Repository
// ==========================================

type postgresCommentRepo struct {
	db *sql.DB
}

func (r *postgresCommentRepo) CreateComment(ctx context.Context, comment *models.BoardComment) error {
	query := `
		INSERT INTO board_comments (id, board_id, parent_id, user_id, content, x, y, target_object_id, resolved, resolved_by, resolved_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	now := time.Now().UTC()
	if comment.CreatedAt.IsZero() {
		comment.CreatedAt = now
	}
	if comment.UpdatedAt.IsZero() {
		comment.UpdatedAt = now
	}

	_, err := r.db.ExecContext(ctx, query,
		comment.ID,
		comment.BoardID,
		comment.ParentID,
		comment.UserID,
		comment.Content,
		comment.X,
		comment.Y,
		comment.TargetObjectID,
		comment.Resolved,
		comment.ResolvedBy,
		comment.ResolvedAt,
		comment.CreatedAt,
		comment.UpdatedAt,
	)
	return err
}

func (r *postgresCommentRepo) GetCommentsByBoardID(ctx context.Context, boardID string) ([]models.BoardComment, error) {
	query := `
		SELECT
			c.id, c.board_id, c.parent_id, c.user_id, u.display_name, u.avatar_color,
			c.content, c.x, c.y, c.target_object_id, c.resolved, c.resolved_by, c.resolved_at,
			c.created_at, c.updated_at
		FROM board_comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.board_id = $1
		ORDER BY c.created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roots []models.BoardComment
	repliesMap := make(map[string][]models.BoardComment)

	for rows.Next() {
		var c models.BoardComment
		var parentID sql.NullString
		var x, y sql.NullFloat64
		var targetObj sql.NullString
		var resolvedBy sql.NullString
		var resolvedAt sql.NullTime

		err := rows.Scan(
			&c.ID,
			&c.BoardID,
			&parentID,
			&c.UserID,
			&c.UserName,
			&c.UserAvatarColor,
			&c.Content,
			&x,
			&y,
			&targetObj,
			&c.Resolved,
			&resolvedBy,
			&resolvedAt,
			&c.CreatedAt,
			&c.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if parentID.Valid {
			c.ParentID = &parentID.String
		}
		if x.Valid {
			c.X = &x.Float64
		}
		if y.Valid {
			c.Y = &y.Float64
		}
		if targetObj.Valid {
			c.TargetObjectID = &targetObj.String
		}
		if resolvedBy.Valid {
			c.ResolvedBy = &resolvedBy.String
		}
		if resolvedAt.Valid {
			c.ResolvedAt = &resolvedAt.Time
		}

		if c.ParentID == nil || *c.ParentID == "" {
			roots = append(roots, c)
		} else {
			repliesMap[*c.ParentID] = append(repliesMap[*c.ParentID], c)
		}
	}

	for i := range roots {
		if replies, ok := repliesMap[roots[i].ID]; ok {
			roots[i].Replies = replies
		}
	}

	return roots, rows.Err()
}

func (r *postgresCommentRepo) GetCommentByID(ctx context.Context, id string) (*models.BoardComment, error) {
	query := `
		SELECT
			c.id, c.board_id, c.parent_id, c.user_id, u.display_name, u.avatar_color,
			c.content, c.x, c.y, c.target_object_id, c.resolved, c.resolved_by, c.resolved_at,
			c.created_at, c.updated_at
		FROM board_comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.id = $1
	`
	var c models.BoardComment
	var parentID sql.NullString
	var x, y sql.NullFloat64
	var targetObj sql.NullString
	var resolvedBy sql.NullString
	var resolvedAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID,
		&c.BoardID,
		&parentID,
		&c.UserID,
		&c.UserName,
		&c.UserAvatarColor,
		&c.Content,
		&x,
		&y,
		&targetObj,
		&c.Resolved,
		&resolvedBy,
		&resolvedAt,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if parentID.Valid {
		c.ParentID = &parentID.String
	}
	if x.Valid {
		c.X = &x.Float64
	}
	if y.Valid {
		c.Y = &y.Float64
	}
	if targetObj.Valid {
		c.TargetObjectID = &targetObj.String
	}
	if resolvedBy.Valid {
		c.ResolvedBy = &resolvedBy.String
	}
	if resolvedAt.Valid {
		c.ResolvedAt = &resolvedAt.Time
	}

	return &c, nil
}

func (r *postgresCommentRepo) UpdateComment(ctx context.Context, comment *models.BoardComment) error {
	query := `
		UPDATE board_comments
		SET content = $2, resolved = $3, resolved_by = $4, resolved_at = $5, updated_at = $6
		WHERE id = $1
	`
	comment.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, query,
		comment.ID,
		comment.Content,
		comment.Resolved,
		comment.ResolvedBy,
		comment.ResolvedAt,
		comment.UpdatedAt,
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

func (r *postgresCommentRepo) DeleteComment(ctx context.Context, id string) error {
	query := `DELETE FROM board_comments WHERE id = $1`
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

// ==========================================
// Postgres Activity Repository
// ==========================================

type postgresActivityRepo struct {
	db *sql.DB
}

func (r *postgresActivityRepo) LogActivity(ctx context.Context, activity *models.BoardActivity) error {
	query := `
		INSERT INTO board_activities (board_id, user_id, action_type, description, metadata, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	now := time.Now().UTC()
	if activity.CreatedAt.IsZero() {
		activity.CreatedAt = now
	}
	if len(activity.Metadata) == 0 {
		activity.Metadata = json.RawMessage(`{}`)
	}

	return r.db.QueryRowContext(ctx, query,
		activity.BoardID,
		activity.UserID,
		activity.ActionType,
		activity.Description,
		activity.Metadata,
		activity.CreatedAt,
	).Scan(&activity.ID)
}

func (r *postgresActivityRepo) GetActivitiesByBoardID(ctx context.Context, boardID string, limit, offset int) ([]models.BoardActivity, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT
			a.id, a.board_id, a.user_id, u.display_name, u.avatar_color,
			a.action_type, a.description, a.metadata, a.created_at
		FROM board_activities a
		JOIN users u ON a.user_id = u.id
		WHERE a.board_id = $1
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, query, boardID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.BoardActivity
	for rows.Next() {
		var a models.BoardActivity
		var rawMeta []byte
		err := rows.Scan(
			&a.ID,
			&a.BoardID,
			&a.UserID,
			&a.UserName,
			&a.UserAvatarColor,
			&a.ActionType,
			&a.Description,
			&rawMeta,
			&a.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		a.Metadata = json.RawMessage(rawMeta)
		list = append(list, a)
	}
	return list, rows.Err()
}

// ==========================================
// Postgres Favorite Repository
// ==========================================

type postgresFavoriteRepo struct {
	db *sql.DB
}

func (r *postgresFavoriteRepo) AddFavorite(ctx context.Context, userID, boardID string) error {
	query := `
		INSERT INTO board_favorites (user_id, board_id, created_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, board_id) DO NOTHING
	`
	_, err := r.db.ExecContext(ctx, query, userID, boardID, time.Now().UTC())
	return err
}

func (r *postgresFavoriteRepo) RemoveFavorite(ctx context.Context, userID, boardID string) error {
	query := `DELETE FROM board_favorites WHERE user_id = $1 AND board_id = $2`
	_, err := r.db.ExecContext(ctx, query, userID, boardID)
	return err
}

func (r *postgresFavoriteRepo) IsFavorite(ctx context.Context, userID, boardID string) (bool, error) {
	query := `SELECT EXISTS (SELECT 1 FROM board_favorites WHERE user_id = $1 AND board_id = $2)`
	var exists bool
	err := r.db.QueryRowContext(ctx, query, userID, boardID).Scan(&exists)
	return exists, err
}

func (r *postgresFavoriteRepo) GetUserFavoriteBoardIDs(ctx context.Context, userID string) ([]string, error) {
	query := `SELECT board_id FROM board_favorites WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var bid string
		if err := rows.Scan(&bid); err != nil {
			return nil, err
		}
		ids = append(ids, bid)
	}
	return ids, rows.Err()
}
