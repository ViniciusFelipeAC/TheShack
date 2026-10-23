-- Fase 7: nota de passagem das tarefas que falharam ou foram canceladas.

ALTER TABLE tasks ADD COLUMN handoff TEXT;
CREATE INDEX tasks_workspace ON tasks(workspace_id, created_at);
