-- Migration: 007_create_operation_log
CREATE TABLE IF NOT EXISTS operation_log (
    id BIGSERIAL PRIMARY KEY,
    board_id VARCHAR(64) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    op_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_board_seq UNIQUE (board_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_operation_log_board_seq ON operation_log(board_id, seq ASC);
