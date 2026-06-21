CREATE TABLE IF NOT EXISTS codex_oauth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_codex_oauth_sessions_state ON codex_oauth_sessions(state);
CREATE INDEX IF NOT EXISTS idx_codex_oauth_sessions_user_id ON codex_oauth_sessions(user_id);
