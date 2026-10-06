-- Migration: 008_create_board_comments
CREATE TABLE IF NOT EXISTS board_comments (
    id VARCHAR(64) PRIMARY KEY,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    parent_id VARCHAR(64) REFERENCES board_comments(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    x DOUBLE PRECISION,
    y DOUBLE PRECISION,
    target_object_id VARCHAR(64),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_comments_board ON board_comments(board_id);
CREATE INDEX IF NOT EXISTS idx_board_comments_parent ON board_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_board_comments_user ON board_comments(user_id);
