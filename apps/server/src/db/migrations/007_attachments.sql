-- Anexos do chat: fotos, PDFs e arquivos de texto. O arquivo fica em data/uploads/<id>; aqui fica o resto.
-- message_id nulo = enviado mas ainda não usado numa mensagem (some depois de 24 horas).

CREATE TABLE attachments (
  id         TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  device_id  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX attachments_message ON attachments(message_id);
