ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;

ALTER TABLE api_keys ADD COLUMN id TEXT;
ALTER TABLE api_keys ADD COLUMN key_prefix TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT,
  request_id TEXT NOT NULL,
  route TEXT NOT NULL,
  model TEXT,
  status INTEGER NOT NULL,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_savings_usd REAL,
  upstream_mode TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_user_created ON request_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);

CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input_usd_per_million REAL NOT NULL,
  output_usd_per_million REAL NOT NULL
);

INSERT OR IGNORE INTO model_pricing (model, input_usd_per_million, output_usd_per_million) VALUES
  ('gpt-5.5', 3.0, 12.0),
  ('gpt-5.4', 2.5, 10.0),
  ('gpt-5.4-mini', 0.75, 3.0),
  ('gpt-5.3-codex', 2.5, 10.0),
  ('gpt-5.3-codex-spark', 1.0, 4.0);

UPDATE api_keys SET id = lower(hex(randomblob(16))) WHERE id IS NULL;
UPDATE api_keys SET key_prefix = substr(key_hash, 1, 8) WHERE key_prefix IS NULL;
