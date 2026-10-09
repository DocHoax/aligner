-- Rollback Migration: 006_rollback_board_snapshots
DROP TABLE IF EXISTS board_snapshots CASCADE;
