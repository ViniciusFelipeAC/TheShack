-- Fase 4: pastas onde o etnaD pode trabalhar.

CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  path          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  auto_approve  TEXT NOT NULL DEFAULT '[]',
  git_branching INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
