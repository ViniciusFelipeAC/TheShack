-- Fase 5: agenda, lembretes, alarmes, timers, listas, notas e notificações.

CREATE TABLE calendar_events (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  start_at   TEXT NOT NULL,
  end_at     TEXT,
  all_day    INTEGER NOT NULL DEFAULT 0,
  location   TEXT,
  notes      TEXT,
  rrule      TEXT,
  source     TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX calendar_start ON calendar_events(start_at);

CREATE TABLE reminders (
  id            TEXT PRIMARY KEY,
  text          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  priority      TEXT NOT NULL,
  at            TEXT,
  cron          TEXT,
  timezone      TEXT NOT NULL,
  status        TEXT NOT NULL,
  next_fire_at  TEXT,
  snoozed_until TEXT,
  ringing       INTEGER NOT NULL DEFAULT 0,
  ring_count    INTEGER NOT NULL DEFAULT 0,
  last_fired_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX reminders_due ON reminders(status, next_fire_at);

CREATE TABLE timers (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  ends_at     TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE lists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE list_items (
  id         TEXT PRIMARY KEY,
  list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX list_items_list ON list_items(list_id, created_at);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  priority   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref_id     TEXT,
  silenced   INTEGER NOT NULL DEFAULT 0,
  digested   INTEGER NOT NULL DEFAULT 0,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notifications_created ON notifications(created_at);

CREATE TABLE push_subscriptions (
  id         TEXT PRIMARY KEY,
  device_id  TEXT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO lists (id, name, created_at, updated_at) VALUES
  ('mercado', 'Mercado', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('afazeres', 'Afazeres', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
