CREATE TABLE IF NOT EXISTS lead_firm_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_public_id TEXT NOT NULL UNIQUE,
  firm_id INTEGER NOT NULL,
  firm_name TEXT NOT NULL,
  firm_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  response TEXT NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','accepted','declined')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  FOREIGN KEY (firm_id) REFERENCES law_firms(id)
);
CREATE INDEX IF NOT EXISTS idx_firm_actions_token ON lead_firm_actions(token_hash);
CREATE INDEX IF NOT EXISTS idx_firm_actions_response ON lead_firm_actions(response);
