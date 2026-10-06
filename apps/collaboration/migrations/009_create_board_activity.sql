-- Migration: 009_create_board_activity
CREATE TABLE IF NOT EXISTS board_activities (
    id BIGSERIAL PRIMARY KEY,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_activities_board ON board_activities(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_activities_user ON board_activities(user_id);
