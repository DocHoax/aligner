-- Rollback Migration: 011_rollback_board_thumbnail
ALTER TABLE boards DROP COLUMN IF EXISTS thumbnail_url;
