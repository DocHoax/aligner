package storage

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"sync"
	"time"

	"alignify/collaboration/pkg/models"
)

type MemoryStorage struct {
	mu           sync.RWMutex
	users        map[string]*models.User
	workspaces   map[string]*models.Workspace
	memberships  map[string]*models.WorkspaceMembership // key: workspaceID + ":" + userID
	boards       map[string]*models.Board
	boardPerms   map[string]*models.BoardPermission   // key: boardID + ":" + userID
	snapshots    map[string][]*models.BoardSnapshot   // key: boardID
	operations   map[string][]*models.OperationRecord // key: boardID
	comments     map[string]*models.BoardComment      // key: commentID
	activities   map[string][]*models.BoardActivity   // key: boardID
	favorites    map[string]bool                      // key: userID + ":" + boardID
	snapshotSeq  int64
	operationSeq int64
	activitySeq  int64
}

func NewMemoryStorage() *MemoryStorage {
	return &MemoryStorage{
		users:       make(map[string]*models.User),
		workspaces:  make(map[string]*models.Workspace),
		memberships: make(map[string]*models.WorkspaceMembership),
		boards:      make(map[string]*models.Board),
		boardPerms:  make(map[string]*models.BoardPermission),
		snapshots:   make(map[string][]*models.BoardSnapshot),
		operations:  make(map[string][]*models.OperationRecord),
		comments:    make(map[string]*models.BoardComment),
		activities:  make(map[string][]*models.BoardActivity),
		favorites:   make(map[string]bool),
	}
}

func (m *MemoryStorage) Users() UserRepository {
	return &memoryUserRepo{storage: m}
}

func (m *MemoryStorage) Workspaces() WorkspaceRepository {
	return &memoryWorkspaceRepo{storage: m}
}

func (m *MemoryStorage) Boards() BoardRepository {
	return &memoryBoardRepo{storage: m}
}

func (m *MemoryStorage) Snapshots() SnapshotRepository {
	return &memorySnapshotRepo{storage: m}
}

func (m *MemoryStorage) Operations() OperationRepository {
	return &memoryOperationRepo{storage: m}
}

func (m *MemoryStorage) Comments() CommentRepository {
	return &memoryCommentRepo{storage: m}
}

func (m *MemoryStorage) Activity() ActivityRepository {
	return &memoryActivityRepo{storage: m}
}

func (m *MemoryStorage) Favorites() FavoriteRepository {
	return &memoryFavoriteRepo{storage: m}
}

func (m *MemoryStorage) Close() error {
	return nil
}

// ==========================================
// Memory User Repository
// ==========================================

type memoryUserRepo struct {
	storage *MemoryStorage
}

func (r *memoryUserRepo) CreateUser(ctx context.Context, user *models.User) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.users[user.ID]; exists {
		return ErrAlreadyExists
	}
	for _, u := range r.storage.users {
		if strings.EqualFold(u.Email, user.Email) {
			return ErrAlreadyExists
		}
	}

	now := time.Now().UTC()
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	if user.UpdatedAt.IsZero() {
		user.UpdatedAt = now
	}

	copyUser := *user
	r.storage.users[user.ID] = &copyUser
	return nil
}

func (r *memoryUserRepo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	u, exists := r.storage.users[id]
	if !exists {
		return nil, ErrNotFound
	}
	copyUser := *u
	return &copyUser, nil
}

func (r *memoryUserRepo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	for _, u := range r.storage.users {
		if strings.EqualFold(u.Email, email) {
			copyUser := *u
			return &copyUser, nil
		}
	}
	return nil, ErrNotFound
}

func (r *memoryUserRepo) UpdateUser(ctx context.Context, user *models.User) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	u, exists := r.storage.users[user.ID]
	if !exists {
		return ErrNotFound
	}
	u.DisplayName = user.DisplayName
	u.AvatarColor = user.AvatarColor
	if user.PasswordHash != "" {
		u.PasswordHash = user.PasswordHash
	}
	u.UpdatedAt = time.Now().UTC()
	return nil
}

// ==========================================
// Memory Workspace Repository
// ==========================================

type memoryWorkspaceRepo struct {
	storage *MemoryStorage
}

func (r *memoryWorkspaceRepo) CreateWorkspace(ctx context.Context, ws *models.Workspace) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.workspaces[ws.ID]; exists {
		return ErrAlreadyExists
	}

	now := time.Now().UTC()
	if ws.CreatedAt.IsZero() {
		ws.CreatedAt = now
	}
	if ws.UpdatedAt.IsZero() {
		ws.UpdatedAt = now
	}

	copyWs := *ws
	r.storage.workspaces[ws.ID] = &copyWs
	return nil
}

func (r *memoryWorkspaceRepo) GetWorkspaceByID(ctx context.Context, id string) (*models.Workspace, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	ws, exists := r.storage.workspaces[id]
	if !exists {
		return nil, ErrNotFound
	}
	copyWs := *ws
	return &copyWs, nil
}

func (r *memoryWorkspaceRepo) GetWorkspacesByUserID(ctx context.Context, userID string) ([]models.WorkspaceWithRole, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	var result []models.WorkspaceWithRole
	for _, m := range r.storage.memberships {
		if m.UserID == userID {
			ws, exists := r.storage.workspaces[m.WorkspaceID]
			if exists {
				// Count members
				memberCount := 0
				for _, mem := range r.storage.memberships {
					if mem.WorkspaceID == ws.ID {
						memberCount++
					}
				}
				// Count boards
				boardCount := 0
				for _, b := range r.storage.boards {
					if b.WorkspaceID == ws.ID {
						boardCount++
					}
				}

				result = append(result, models.WorkspaceWithRole{
					Workspace:   *ws,
					UserRole:    m.Role,
					MemberCount: memberCount,
					BoardCount:  boardCount,
				})
			}
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].UpdatedAt.After(result[j].UpdatedAt)
	})

	return result, nil
}

func (r *memoryWorkspaceRepo) UpdateWorkspace(ctx context.Context, ws *models.Workspace) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	existing, exists := r.storage.workspaces[ws.ID]
	if !exists {
		return ErrNotFound
	}
	existing.Name = ws.Name
	existing.Slug = ws.Slug
	existing.Description = ws.Description
	existing.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *memoryWorkspaceRepo) DeleteWorkspace(ctx context.Context, id string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.workspaces[id]; !exists {
		return ErrNotFound
	}
	delete(r.storage.workspaces, id)

	// Cascade delete memberships
	for k, m := range r.storage.memberships {
		if m.WorkspaceID == id {
			delete(r.storage.memberships, k)
		}
	}
	// Cascade delete boards
	for bid, b := range r.storage.boards {
		if b.WorkspaceID == id {
			delete(r.storage.boards, bid)
			delete(r.storage.snapshots, bid)
			delete(r.storage.operations, bid)
		}
	}
	return nil
}

func (r *memoryWorkspaceRepo) AddMember(ctx context.Context, membership *models.WorkspaceMembership) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	key := membership.WorkspaceID + ":" + membership.UserID
	now := time.Now().UTC()
	if membership.CreatedAt.IsZero() {
		membership.CreatedAt = now
	}
	if membership.UpdatedAt.IsZero() {
		membership.UpdatedAt = now
	}

	copyM := *membership
	r.storage.memberships[key] = &copyM
	return nil
}

func (r *memoryWorkspaceRepo) GetMembership(ctx context.Context, workspaceID, userID string) (*models.WorkspaceMembership, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	key := workspaceID + ":" + userID
	m, exists := r.storage.memberships[key]
	if !exists {
		return nil, ErrNotFound
	}
	copyM := *m
	return &copyM, nil
}

func (r *memoryWorkspaceRepo) GetMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	var members []models.WorkspaceMember
	for _, m := range r.storage.memberships {
		if m.WorkspaceID == workspaceID {
			u, exists := r.storage.users[m.UserID]
			if exists {
				members = append(members, models.WorkspaceMember{
					UserID:      u.ID,
					Email:       u.Email,
					DisplayName: u.DisplayName,
					AvatarColor: u.AvatarColor,
					Role:        m.Role,
					JoinedAt:    m.CreatedAt,
				})
			}
		}
	}

	sort.Slice(members, func(i, j int) bool {
		return members[i].JoinedAt.Before(members[j].JoinedAt)
	})

	return members, nil
}

func (r *memoryWorkspaceRepo) UpdateMemberRole(ctx context.Context, workspaceID, userID string, role models.Role) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	key := workspaceID + ":" + userID
	m, exists := r.storage.memberships[key]
	if !exists {
		return ErrNotFound
	}
	m.Role = role
	m.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *memoryWorkspaceRepo) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	key := workspaceID + ":" + userID
	if _, exists := r.storage.memberships[key]; !exists {
		return ErrNotFound
	}
	delete(r.storage.memberships, key)
	return nil
}

// ==========================================
// Memory Board Repository
// ==========================================

type memoryBoardRepo struct {
	storage *MemoryStorage
}

func (r *memoryBoardRepo) CreateBoard(ctx context.Context, board *models.Board) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.boards[board.ID]; exists {
		return ErrAlreadyExists
	}

	now := time.Now().UTC()
	if board.CreatedAt.IsZero() {
		board.CreatedAt = now
	}
	if board.UpdatedAt.IsZero() {
		board.UpdatedAt = now
	}

	copyBoard := *board
	r.storage.boards[board.ID] = &copyBoard
	return nil
}

func (r *memoryBoardRepo) GetBoardByID(ctx context.Context, id string) (*models.Board, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	b, exists := r.storage.boards[id]
	if !exists {
		return nil, ErrNotFound
	}
	copyB := *b
	return &copyB, nil
}

func (r *memoryBoardRepo) GetBoardsByWorkspaceID(ctx context.Context, workspaceID string) ([]models.Board, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	var list []models.Board
	for _, b := range r.storage.boards {
		if b.WorkspaceID == workspaceID {
			list = append(list, *b)
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].UpdatedAt.After(list[j].UpdatedAt)
	})

	return list, nil
}

func (r *memoryBoardRepo) GetBoardsByWorkspaceIDFiltered(ctx context.Context, workspaceID, userID, query, sortBy string, favoritesOnly bool) ([]models.BoardWithRole, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	ws, wsExists := r.storage.workspaces[workspaceID]
	wsName := ""
	if wsExists {
		wsName = ws.Name
	}

	var result []models.BoardWithRole
	queryLower := strings.ToLower(strings.TrimSpace(query))

	for _, b := range r.storage.boards {
		if b.WorkspaceID != workspaceID {
			continue
		}

		// Text search
		if queryLower != "" {
			nameMatch := strings.Contains(strings.ToLower(b.Name), queryLower)
			descMatch := strings.Contains(strings.ToLower(b.Description), queryLower)
			if !nameMatch && !descMatch {
				continue
			}
		}

		// Favorites filter
		favKey := userID + ":" + b.ID
		isFav := r.storage.favorites[favKey]
		if favoritesOnly && !isFav {
			continue
		}

		// Effective role
		role := models.RoleViewer
		wkey := workspaceID + ":" + userID
		if mem, ok := r.storage.memberships[wkey]; ok && mem.Role.IsValid() {
			role = mem.Role
		}
		bkey := b.ID + ":" + userID
		if perm, ok := r.storage.boardPerms[bkey]; ok && perm.Role.IsValid() {
			role = perm.Role
		}

		result = append(result, models.BoardWithRole{
			Board:         *b,
			UserRole:      role,
			WorkspaceName: wsName,
			IsFavorite:    isFav,
		})
	}

	// Sort
	switch sortBy {
	case "name":
		sort.Slice(result, func(i, j int) bool {
			return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
		})
	case "created":
		sort.Slice(result, func(i, j int) bool {
			return result[i].CreatedAt.After(result[j].CreatedAt)
		})
	default: // "updated" or default
		sort.Slice(result, func(i, j int) bool {
			return result[i].UpdatedAt.After(result[j].UpdatedAt)
		})
	}

	return result, nil
}

func (r *memoryBoardRepo) UpdateBoard(ctx context.Context, board *models.Board) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	existing, exists := r.storage.boards[board.ID]
	if !exists {
		return ErrNotFound
	}
	existing.Name = board.Name
	existing.Description = board.Description
	existing.IsPublic = board.IsPublic
	if board.ThumbnailURL != "" {
		existing.ThumbnailURL = board.ThumbnailURL
	}
	existing.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *memoryBoardRepo) UpdateBoardThumbnail(ctx context.Context, boardID, thumbnailURL string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	existing, exists := r.storage.boards[boardID]
	if !exists {
		return ErrNotFound
	}
	existing.ThumbnailURL = thumbnailURL
	existing.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *memoryBoardRepo) DeleteBoard(ctx context.Context, id string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.boards[id]; !exists {
		return ErrNotFound
	}
	delete(r.storage.boards, id)
	delete(r.storage.snapshots, id)
	delete(r.storage.operations, id)
	delete(r.storage.activities, id)
	for cid, c := range r.storage.comments {
		if c.BoardID == id {
			delete(r.storage.comments, cid)
		}
	}
	return nil
}

func (r *memoryBoardRepo) GetBoardEffectiveRole(ctx context.Context, boardID, userID string) (models.Role, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	// 1. Direct board permission
	bkey := boardID + ":" + userID
	if perm, ok := r.storage.boardPerms[bkey]; ok && perm.Role.IsValid() {
		return perm.Role, nil
	}

	// 2. Parent workspace role
	b, ok := r.storage.boards[boardID]
	if !ok {
		return "", ErrNotFound
	}

	wkey := b.WorkspaceID + ":" + userID
	if mem, ok := r.storage.memberships[wkey]; ok && mem.Role.IsValid() {
		return mem.Role, nil
	}

	// 3. Public check
	if b.IsPublic {
		return models.RoleViewer, nil
	}

	return "", ErrUnauthorized
}

// ==========================================
// Memory Snapshot Repository
// ==========================================

type memorySnapshotRepo struct {
	storage *MemoryStorage
}

func (r *memorySnapshotRepo) SaveSnapshot(ctx context.Context, snapshot *models.BoardSnapshot) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	r.storage.snapshotSeq++
	snapshot.ID = r.storage.snapshotSeq
	if snapshot.CreatedAt.IsZero() {
		snapshot.CreatedAt = time.Now().UTC()
	}

	copyS := *snapshot
	copyData := make([]byte, len(snapshot.Data))
	copy(copyData, snapshot.Data)
	copyS.Data = json.RawMessage(copyData)

	r.storage.snapshots[snapshot.BoardID] = append(r.storage.snapshots[snapshot.BoardID], &copyS)
	return nil
}

func (r *memorySnapshotRepo) GetLatestSnapshot(ctx context.Context, boardID string) (*models.BoardSnapshot, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	list, ok := r.storage.snapshots[boardID]
	if !ok || len(list) == 0 {
		return nil, ErrNotFound
	}

	var latest *models.BoardSnapshot
	for _, s := range list {
		if latest == nil || s.Seq > latest.Seq {
			latest = s
		}
	}

	copyS := *latest
	copyData := make([]byte, len(latest.Data))
	copy(copyData, latest.Data)
	copyS.Data = json.RawMessage(copyData)
	return &copyS, nil
}

func (r *memorySnapshotRepo) ListSnapshots(ctx context.Context, boardID string) ([]models.BoardSnapshot, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	list := r.storage.snapshots[boardID]
	var result []models.BoardSnapshot
	for _, s := range list {
		copyS := *s
		copyData := make([]byte, len(s.Data))
		copy(copyData, s.Data)
		copyS.Data = json.RawMessage(copyData)
		result = append(result, copyS)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Seq > result[j].Seq
	})

	return result, nil
}

func (r *memorySnapshotRepo) GetSnapshotByID(ctx context.Context, id int64) (*models.BoardSnapshot, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	for _, list := range r.storage.snapshots {
		for _, s := range list {
			if s.ID == id {
				copyS := *s
				copyData := make([]byte, len(s.Data))
				copy(copyData, s.Data)
				copyS.Data = json.RawMessage(copyData)
				return &copyS, nil
			}
		}
	}
	return nil, ErrNotFound
}

// ==========================================
// Memory Operation Repository
// ==========================================

type memoryOperationRepo struct {
	storage *MemoryStorage
}

func (r *memoryOperationRepo) AppendOperation(ctx context.Context, op *models.OperationRecord) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	list := r.storage.operations[op.BoardID]
	for _, existing := range list {
		if existing.Seq == op.Seq {
			return ErrOperationConflict
		}
	}

	r.storage.operationSeq++
	op.ID = r.storage.operationSeq
	if op.CreatedAt.IsZero() {
		op.CreatedAt = time.Now().UTC()
	}

	copyOp := *op
	copyPayload := make([]byte, len(op.Payload))
	copy(copyPayload, op.Payload)
	copyOp.Payload = json.RawMessage(copyPayload)

	r.storage.operations[op.BoardID] = append(r.storage.operations[op.BoardID], &copyOp)
	return nil
}

func (r *memoryOperationRepo) GetOperationsAfterSeq(ctx context.Context, boardID string, afterSeq int64) ([]models.OperationRecord, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	list := r.storage.operations[boardID]
	var result []models.OperationRecord
	for _, op := range list {
		if op.Seq > afterSeq {
			copyOp := *op
			copyPayload := make([]byte, len(op.Payload))
			copy(copyPayload, op.Payload)
			copyOp.Payload = json.RawMessage(copyPayload)
			result = append(result, copyOp)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Seq < result[j].Seq
	})

	return result, nil
}

// ==========================================
// Memory Comment Repository
// ==========================================

type memoryCommentRepo struct {
	storage *MemoryStorage
}

func (r *memoryCommentRepo) CreateComment(ctx context.Context, comment *models.BoardComment) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	now := time.Now().UTC()
	if comment.CreatedAt.IsZero() {
		comment.CreatedAt = now
	}
	if comment.UpdatedAt.IsZero() {
		comment.UpdatedAt = now
	}

	// Populate user info if available
	if u, ok := r.storage.users[comment.UserID]; ok {
		comment.UserName = u.DisplayName
		comment.UserAvatarColor = u.AvatarColor
	}

	copyC := *comment
	r.storage.comments[comment.ID] = &copyC
	return nil
}

func (r *memoryCommentRepo) GetCommentsByBoardID(ctx context.Context, boardID string) ([]models.BoardComment, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	var roots []models.BoardComment
	repliesMap := make(map[string][]models.BoardComment)

	for _, c := range r.storage.comments {
		if c.BoardID != boardID {
			continue
		}
		item := *c
		if u, ok := r.storage.users[c.UserID]; ok {
			item.UserName = u.DisplayName
			item.UserAvatarColor = u.AvatarColor
		}

		if c.ParentID == nil || *c.ParentID == "" {
			roots = append(roots, item)
		} else {
			repliesMap[*c.ParentID] = append(repliesMap[*c.ParentID], item)
		}
	}

	// Attach replies and sort
	for i := range roots {
		if replies, ok := repliesMap[roots[i].ID]; ok {
			sort.Slice(replies, func(a, b int) bool {
				return replies[a].CreatedAt.Before(replies[b].CreatedAt)
			})
			roots[i].Replies = replies
		}
	}

	sort.Slice(roots, func(i, j int) bool {
		return roots[i].CreatedAt.Before(roots[j].CreatedAt)
	})

	return roots, nil
}

func (r *memoryCommentRepo) GetCommentByID(ctx context.Context, id string) (*models.BoardComment, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	c, exists := r.storage.comments[id]
	if !exists {
		return nil, ErrNotFound
	}
	item := *c
	if u, ok := r.storage.users[c.UserID]; ok {
		item.UserName = u.DisplayName
		item.UserAvatarColor = u.AvatarColor
	}
	return &item, nil
}

func (r *memoryCommentRepo) UpdateComment(ctx context.Context, comment *models.BoardComment) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	c, exists := r.storage.comments[comment.ID]
	if !exists {
		return ErrNotFound
	}

	c.Content = comment.Content
	c.Resolved = comment.Resolved
	c.ResolvedBy = comment.ResolvedBy
	c.ResolvedAt = comment.ResolvedAt
	c.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *memoryCommentRepo) DeleteComment(ctx context.Context, id string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	if _, exists := r.storage.comments[id]; !exists {
		return ErrNotFound
	}
	delete(r.storage.comments, id)

	// Delete replies
	for cid, c := range r.storage.comments {
		if c.ParentID != nil && *c.ParentID == id {
			delete(r.storage.comments, cid)
		}
	}
	return nil
}

// ==========================================
// Memory Activity Repository
// ==========================================

type memoryActivityRepo struct {
	storage *MemoryStorage
}

func (r *memoryActivityRepo) LogActivity(ctx context.Context, activity *models.BoardActivity) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	r.storage.activitySeq++
	activity.ID = r.storage.activitySeq
	if activity.CreatedAt.IsZero() {
		activity.CreatedAt = time.Now().UTC()
	}

	if u, ok := r.storage.users[activity.UserID]; ok {
		activity.UserName = u.DisplayName
		activity.UserAvatarColor = u.AvatarColor
	}

	copyA := *activity
	r.storage.activities[activity.BoardID] = append(r.storage.activities[activity.BoardID], &copyA)
	return nil
}

func (r *memoryActivityRepo) GetActivitiesByBoardID(ctx context.Context, boardID string, limit, offset int) ([]models.BoardActivity, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	list := r.storage.activities[boardID]
	var result []models.BoardActivity

	for _, a := range list {
		item := *a
		if u, ok := r.storage.users[a.UserID]; ok {
			item.UserName = u.DisplayName
			item.UserAvatarColor = u.AvatarColor
		}
		result = append(result, item)
	}

	// Reverse chronological order
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})

	if offset >= len(result) {
		return []models.BoardActivity{}, nil
	}

	end := offset + limit
	if limit <= 0 || end > len(result) {
		end = len(result)
	}

	return result[offset:end], nil
}

// ==========================================
// Memory Favorite Repository
// ==========================================

type memoryFavoriteRepo struct {
	storage *MemoryStorage
}

func (r *memoryFavoriteRepo) AddFavorite(ctx context.Context, userID, boardID string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	key := userID + ":" + boardID
	r.storage.favorites[key] = true
	return nil
}

func (r *memoryFavoriteRepo) RemoveFavorite(ctx context.Context, userID, boardID string) error {
	r.storage.mu.Lock()
	defer r.storage.mu.Unlock()

	key := userID + ":" + boardID
	delete(r.storage.favorites, key)
	return nil
}

func (r *memoryFavoriteRepo) IsFavorite(ctx context.Context, userID, boardID string) (bool, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	key := userID + ":" + boardID
	return r.storage.favorites[key], nil
}

func (r *memoryFavoriteRepo) GetUserFavoriteBoardIDs(ctx context.Context, userID string) ([]string, error) {
	r.storage.mu.RLock()
	defer r.storage.mu.RUnlock()

	var ids []string
	prefix := userID + ":"
	for key := range r.storage.favorites {
		if strings.HasPrefix(key, prefix) {
			boardID := strings.TrimPrefix(key, prefix)
			ids = append(ids, boardID)
		}
	}
	return ids, nil
}
