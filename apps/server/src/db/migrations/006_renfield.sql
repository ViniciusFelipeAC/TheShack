-- O mordomo se chamava Marvin e passou a se chamar Renfield. A 002 continua inserindo 'marvin';
-- esta migration renomeia o id em todos os lugares onde ele fica guardado.

UPDATE conversations SET agent_id = 'renfield' WHERE agent_id = 'marvin';
-- A sessão antiga do Agent SDK foi escrita com o nome antigo e numa pasta de trabalho que mudou: começa outra.
UPDATE conversations SET session_id = NULL WHERE agent_id = 'renfield';
UPDATE tasks SET assignee = 'renfield' WHERE assignee = 'marvin';
UPDATE tasks SET origin = json_set(origin, '$.agentId', 'renfield') WHERE json_valid(origin) AND json_extract(origin, '$.agentId') = 'marvin';
UPDATE approvals SET agent_id = 'renfield' WHERE agent_id = 'marvin';
UPDATE events SET agent_id = 'renfield' WHERE agent_id = 'marvin';
INSERT OR IGNORE INTO agent_flags (agent_id, error_cleared_at) SELECT 'renfield', error_cleared_at FROM agent_flags WHERE agent_id = 'marvin';
DELETE FROM agent_flags WHERE agent_id = 'marvin';
UPDATE memories SET source = 'renfield' WHERE source = 'marvin';
UPDATE rules SET source = 'renfield' WHERE source = 'marvin';
UPDATE notifications SET kind = 'renfield' WHERE kind = 'marvin';
