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
