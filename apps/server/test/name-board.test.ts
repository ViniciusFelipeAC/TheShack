import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDb } from '../src/db/database.ts';
import { assistantTools, listAlias } from '../src/renfield/assistant-tools.ts';
import { activityOf } from '../src/renfield/engine.ts';
import { setup } from './helpers.ts';

test('nome: um banco do tempo do Marvin vira Renfield, sem perder nada', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shack-nome-'));
  const path = join(dir, 'shack.db');
  const at = '2026-11-01T10:00:00.000Z';

  // Banco novo: a 002 insere 'marvin' e a 006 já renomeia.
  let db = openDb(path);
  assert.equal(db.prepare("SELECT agent_id FROM conversations WHERE id = 'main'").get()!.agent_id, 'renfield');

  // Simula os dados de antes da troca e roda a 006 de novo, como no banco real.
  db.exec(`DELETE FROM schema_migrations WHERE name = '006_renfield.sql';
    UPDATE conversations SET agent_id = 'marvin', session_id = 'sessao-antiga';
    INSERT INTO tasks (id, title, prompt, assignee, origin, status, priority, created_at)
      VALUES ('t1', 'x', 'y', 'etnad', '{"kind":"agent","agentId":"marvin","conversationId":"main"}', 'done', 'normal', '${at}'),
             ('t2', 'x', 'y', 'marvin', '{"kind":"user","deviceId":null}', 'failed', 'normal', '${at}');
    INSERT INTO events (id, ts, type, agent_id, data) VALUES ('e1', '${at}', 'agent.status', 'marvin', '{}');
    INSERT INTO agent_flags (agent_id, error_cleared_at) VALUES ('marvin', '${at}');
    INSERT INTO memories (id, content, kind, source, is_new, created_at, updated_at) VALUES ('m1', 'Gosta de chá', 'fact', 'marvin', 1, '${at}', '${at}');
    INSERT INTO rules (id, instruction, source, is_new, created_at, updated_at) VALUES ('r1', 'Seja breve', 'marvin', 0, '${at}', '${at}');
    INSERT INTO notifications (id, title, body, priority, kind, created_at) VALUES ('n1', 'Oi', '', 'normal', 'marvin', '${at}');`);
  db.close();
  db = openDb(path);
  // No Windows o arquivo aberto não sai: fecha antes de apagar a pasta.
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  const one = (sql: string) => db.prepare(sql).get()!;
  assert.deepEqual({ ...one("SELECT agent_id, session_id FROM conversations WHERE id = 'main'") }, { agent_id: 'renfield', session_id: null },
    'a sessão antiga do SDK não volta: o nome mudou');
  assert.equal(JSON.parse(String(one("SELECT origin FROM tasks WHERE id = 't1'").origin)).agentId, 'renfield');
  assert.equal(one("SELECT assignee FROM tasks WHERE id = 't2'").assignee, 'renfield');
  assert.equal(JSON.parse(String(one("SELECT origin FROM tasks WHERE id = 't2'").origin)).kind, 'user', 'origem de outro tipo fica igual');
  assert.equal(one("SELECT agent_id FROM events WHERE id = 'e1'").agent_id, 'renfield');
  assert.equal(one("SELECT error_cleared_at FROM agent_flags WHERE agent_id = 'renfield'").error_cleared_at, at);
  assert.equal(one("SELECT COUNT(*) AS n FROM agent_flags WHERE agent_id = 'marvin'").n, 0);
  assert.equal(one("SELECT source FROM memories WHERE id = 'm1'").source, 'renfield');
  assert.equal(one("SELECT content FROM memories WHERE id = 'm1'").content, 'Gosta de chá');
  assert.equal(one("SELECT source FROM rules WHERE id = 'r1'").source, 'renfield');
  assert.equal(one("SELECT kind FROM notifications WHERE id = 'n1'").kind, 'renfield');
});

test('nome: o agente de chat é o Renfield, na API e no prompt', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const agents = (await s.call('GET', '/agents')).body as Array<{ id: string; name: string; chat: boolean }>;
  assert.deepEqual(agents.filter((a) => a.chat).map((a) => [a.id, a.name]), [['renfield', 'Renfield']]);
  await s.call('POST', '/conversations/main/messages?wait=true', { text: 'Boa noite' });
  assert.match(s.engine.last.systemPrompt, /Você é o Renfield/);
  assert.doesNotMatch(s.engine.last.systemPrompt, /Marvin/);
  assert.equal((await s.call('GET', '/conversations')).body[0].agentId, 'renfield');
});

test('quadro: "lista de compras" é a Mercado e "to-do" é a Afazeres, mesmo renomeadas', (t) => {
  const s = setup(); t.after(s.cleanup);
  const { lists } = s.shack;
  for (const ref of ['lista de compras', 'Compras', 'supermercado', 'a lista do mercado']) assert.equal(listAlias(ref, lists)?.id, 'mercado', ref);
  for (const ref of ['to-do', 'todo', 'To do', 'afazeres', 'pendências', 'lista de afazeres']) assert.equal(listAlias(ref, lists)?.id, 'afazeres', ref);
  assert.equal(listAlias('farmácia', lists), null);

  lists.rename('mercado', 'Feira da semana');
  const tools = assistantTools({ ...s.shack, timezone: 'America/Sao_Paulo' });
  tools.find((x) => x.name === 'lists_add')!.run({ list: 'lista de compras', items: ['leite', 'café'] }, { conversationId: 'main' });
  tools.find((x) => x.name === 'lists_add')!.run({ list: 'to-do', items: ['pagar a luz'] }, { conversationId: 'main' });
  assert.deepEqual(lists.get('mercado').items.map((i) => i.text), ['leite', 'café']);
  assert.deepEqual(lists.get('afazeres').items.map((i) => i.text), ['pagar a luz']);
  assert.equal(lists.all().length, 2, 'não criou lista nova');
});

test('quadro: o chat e a cena dizem o que o Renfield está mexendo', () => {
  assert.equal(activityOf('calendar_create'), 'Marcando na agenda');
  assert.equal(activityOf('calendar_update'), 'Mexendo na agenda');
  assert.equal(activityOf('lists_add'), 'Anotando na lista');
  assert.equal(activityOf('lists_clear_done'), 'Arrumando as listas');
  assert.equal(activityOf('tasks_create'), 'Delegando uma tarefa');
  assert.equal(activityOf('qualquer_coisa'), 'Trabalhando');
});
