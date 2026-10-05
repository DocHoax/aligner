-- Migration: 003_create_workspace_memberships
CREATE TABLE IF NOT EXISTS workspace_memberships (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON workspace_memberships(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON workspace_memberships(user_id);
