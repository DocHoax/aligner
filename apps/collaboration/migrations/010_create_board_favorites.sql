-- Migration: 010_create_board_favorites
CREATE TABLE IF NOT EXISTS board_favorites (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, board_id)
);

CREATE INDEX IF NOT EXISTS idx_board_favorites_user ON board_favorites(user_id);
