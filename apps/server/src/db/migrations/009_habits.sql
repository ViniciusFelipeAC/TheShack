-- Hábitos do Quadro: a grade de quadradinhos, como a de commits do GitHub.

CREATE TABLE habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Uma linha por dia feito. O dia é a data no fuso da casa ("2026-11-25"), não um instante.
CREATE TABLE habit_days (
  habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (habit_id, day)
);
