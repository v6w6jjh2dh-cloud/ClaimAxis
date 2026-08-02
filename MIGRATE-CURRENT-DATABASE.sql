PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS lead_notes;
DROP TABLE IF EXISTS law_firms;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS firm_requests;
DROP TABLE IF EXISTS lead_events;

CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','qualified','sent_to_firm','signed','closed','rejected')),

  injured TEXT,
  incident_type TEXT,
  state TEXT,
  accident_date TEXT,
  treatment TEXT,
  injuries TEXT,
  has_attorney TEXT,
  fault TEXT,
  description TEXT,

  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  preferred_contact TEXT,
  consent INTEGER NOT NULL DEFAULT 0,

  source_page TEXT DEFAULT 'case-review',
  ip_hash TEXT,
  user_agent TEXT,
  notes TEXT,
  assigned_firm TEXT
);

CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_state ON leads(state);
CREATE INDEX idx_leads_incident_type ON leads(incident_type);

CREATE TABLE firm_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','approved','declined')),

  firm_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  territory TEXT,
  practice_area TEXT,
  lead_type TEXT,
  volume TEXT,
  budget TEXT,
  message TEXT,

  ip_hash TEXT,
  user_agent TEXT,
  notes TEXT
);

CREATE INDEX idx_firm_requests_created_at ON firm_requests(created_at DESC);
CREATE INDEX idx_firm_requests_status ON firm_requests(status);

CREATE TABLE lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX idx_lead_events_lead_id ON lead_events(lead_id);

PRAGMA foreign_keys = ON;
