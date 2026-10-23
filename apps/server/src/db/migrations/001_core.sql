-- Fase 2: núcleo. Dispositivos, tarefas, eventos e aprovações.

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT
);

CREATE TABLE pairing_codes (
  code_hash  TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES devices(id),
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  assignee     TEXT NOT NULL,
  origin       TEXT NOT NULL,
  status       TEXT NOT NULL,
  priority     TEXT NOT NULL,
  workspace_id TEXT,
  parent_id    TEXT REFERENCES tasks(id),
  session_id   TEXT,
  model        TEXT,
  result       TEXT,
  error        TEXT,
  usage        TEXT,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX tasks_assignee_status ON tasks(assignee, status);
CREATE INDEX tasks_created ON tasks(created_at, id);

CREATE TABLE task_history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  status  TEXT NOT NULL,
  note    TEXT,
  at      TEXT NOT NULL
);
CREATE INDEX task_history_task ON task_history(task_id, id);

CREATE TABLE events (
  seq      INTEGER PRIMARY KEY AUTOINCREMENT,
  id       TEXT NOT NULL UNIQUE,
  ts       TEXT NOT NULL,
  type     TEXT NOT NULL,
  agent_id TEXT,
  task_id  TEXT,
  data     TEXT NOT NULL
);
CREATE INDEX events_ts ON events(ts);
CREATE INDEX events_task ON events(task_id, seq);

CREATE TABLE approvals (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  task_id     TEXT REFERENCES tasks(id),
  kind        TEXT NOT NULL,
  summary     TEXT NOT NULL,
  detail      TEXT,
  options     TEXT,
  status      TEXT NOT NULL,
  answer      TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX approvals_status ON approvals(status, created_at);

CREATE TABLE agent_flags (
  agent_id         TEXT PRIMARY KEY,
  error_cleared_at TEXT
);
