CREATE TABLE IF NOT EXISTS ai_history (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_history_expires_at_idx
ON ai_history(expires_at);
