-- Migration: 006_create_board_snapshots
CREATE TABLE IF NOT EXISTS board_snapshots (
    id BIGSERIAL PRIMARY KEY,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL DEFAULT 0,
    data JSONB NOT NULL,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_board_seq ON board_snapshots(board_id, seq DESC);
