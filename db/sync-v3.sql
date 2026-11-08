-- Additive migration: legacy learning_states remains untouched for recovery.
CREATE TABLE IF NOT EXISTS learning_sync_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS learning_sync_banks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  content_bytes BIGINT NOT NULL,
  PRIMARY KEY (user_id, bank_id)
);

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified_email TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, verified_email)
);
-- Optional reply linkage; older clients continue inserting top-level comments.
ALTER TABLE IF EXISTS comments ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS comments_owner_idx ON comments(user_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_id, created_at DESC) WHERE parent_id IS NOT NULL AND status = 'published';
CREATE INDEX IF NOT EXISTS pavilion_question_banks_created_idx ON pavilion_question_banks(created_at DESC);
