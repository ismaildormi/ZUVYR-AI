-- VELOX (run once on the existing Postgres/Supabase DB). New tables only, prefixed velox_ — nothing existing is altered.
CREATE TABLE IF NOT EXISTS velox_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), google_sub TEXT UNIQUE NOT NULL,
  email TEXT, display_name TEXT NOT NULL, photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS velox_scores (
  user_id UUID NOT NULL REFERENCES velox_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL, period_id TEXT NOT NULL,               -- 'YYYY-MM' (UTC, server-computed)
  score INT NOT NULL CHECK (score >= 0), achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_id));
CREATE INDEX IF NOT EXISTS idx_velox_scores_period_rank ON velox_scores(period_id, score DESC, achieved_at ASC);
CREATE TABLE IF NOT EXISTS velox_podiums (                              -- immortal Top-3 snapshot per closed month
  period_id TEXT NOT NULL, rank INT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  user_id UUID, display_name TEXT NOT NULL, score INT NOT NULL, PRIMARY KEY (period_id, rank));
-- Monthly reset: no DELETE needed — a new month simply has no rows under its period_id, so the
-- leaderboard starts empty automatically; velox_podiums preserves last month's winners forever.
-- Optional hard cleanup (keep 6 months of raw scores): pg_cron monthly ->
--   DELETE FROM velox_scores WHERE period_id < to_char(now() - interval '6 months','YYYY-MM');
