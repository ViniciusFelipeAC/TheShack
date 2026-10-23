-- Fase 3: conversa com o Marvin, memórias, regras e modos.

CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  text            TEXT NOT NULL,
  style           TEXT,
  task_id         TEXT,
  device_id       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE memories (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL,
  is_new     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE rules (
  id          TEXT PRIMARY KEY,
  trigger     TEXT,
  instruction TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  source      TEXT NOT NULL,
  is_new      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE modes (
  name         TEXT PRIMARY KEY,
  min_priority TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
VALUES ('main', 'marvin', 'Conversa principal', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO modes (name, min_priority, description, created_at)
VALUES ('foco', 'high', 'Só avisos urgentes chegam até você.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
