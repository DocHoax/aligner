-- Migration: 011_add_board_thumbnail
ALTER TABLE boards ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT '';
