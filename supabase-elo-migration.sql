-- ============================================================
-- Kitab — ELO Migration
-- Run this in your Supabase SQL editor
-- ============================================================

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS elo       INT DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS elo_wins  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elo_losses INT DEFAULT 0;
