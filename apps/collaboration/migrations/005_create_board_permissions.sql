-- Migration: 005_create_board_permissions
CREATE TABLE IF NOT EXISTS board_permissions (
    id VARCHAR(64) PRIMARY KEY,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_board_user UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_permissions_board ON board_permissions(board_id);
CREATE INDEX IF NOT EXISTS idx_board_permissions_user ON board_permissions(user_id);
