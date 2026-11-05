import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup, waitFor } from './helpers.ts';

type S = ReturnType<typeof setup>;
const statusOf = async (s: S, id: string) => (await s.call('GET', `/tasks/${id}`)).body;
const until = (s: S, id: string, status: string) =>
  waitFor(async () => { const t = await statusOf(s, id); return t.status === status && t; }, `tarefa em "${status}"`);

test('health é público, e o resto exige token', async (t) => {
  const s = setup(); t.after(s.cleanup);
  assert.equal((await s.call('GET', '/health', undefined, null)).status, 200);
  const r = await s.call('GET', '/agents', undefined, null);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'unauthorized');
  assert.equal((await s.call('GET', '/agents', undefined, 'shk_inventado')).status, 401);
});

test('lista os dois agentes, ociosos', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const r = await s.call('GET', '/agents');
  assert.deepEqual(r.body.map((a: { id: string }) => a.id), ['etnad', 'renfield']);
  assert.ok(r.body.every((a: { status: string }) => a.status === 'idle'));
  assert.deepEqual(r.body[0].models, ['opus', 'sonnet']);
});

test('tarefa vai de queued a done, com histórico e eventos', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const created = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Teste', prompt: 'Faça algo simples' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'queued');

  const done = await until(s, created.body.id, 'done');
  assert.deepEqual(done.history.map((h: { status: string }) => h.status), ['queued', 'running', 'done']);
  assert.match(done.result.summary, /Simulação concluída/);
  assert.equal(done.origin.deviceId, s.device.id);

  const types = (await s.call('GET', `/tasks/${created.body.id}/events`)).body.map((e: { type: string }) => e.type);
  for (const type of ['task.created', 'task.progress', 'task.done']) assert.ok(types.includes(type), `faltou ${type}`);

  const status = (await s.call('GET', '/events?agentId=etnad&type=agent.status')).body.items.map((e: { data: { status: string } }) => e.data.status);
  assert.ok(status.includes('working'));
  assert.equal(status.at(-1), 'idle');
});

test('aprovação: a tarefa espera, você aprova e ela termina', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Com aprovação', prompt: 'Isto precisa de aprovação' });
  await until(s, task.id, 'waiting_input');

  const agent = (await s.call('GET', '/agents/etnad')).body;
  assert.equal(agent.status, 'waiting_input');
  assert.equal(agent.currentTaskId, task.id);

  const pending = (await s.call('GET', '/approvals')).body;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].taskId, task.id);

  const r = await s.call('POST', `/approvals/${pending[0].id}`, { decision: 'approve' });
  assert.equal(r.body.status, 'approved');
  const done = await until(s, task.id, 'done');
  assert.deepEqual(done.history.map((h: { status: string }) => h.status), ['queued', 'running', 'waiting_input', 'running', 'done']);
  assert.equal((await s.call('POST', `/approvals/${pending[0].id}`, { decision: 'deny' })).status, 409);
});

test('aprovação negada encerra com relatório', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Negar', prompt: 'pedir aprovacao' });
  await until(s, task.id, 'waiting_input');
  const [approval] = (await s.call('GET', '/approvals')).body;
  await s.call('POST', `/approvals/${approval.id}`, { decision: 'deny' });
  const done = await until(s, task.id, 'done');
  assert.match(done.result.summary, /negou/);
});

test('responder pela rota de input libera a tarefa', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Input', prompt: 'aprovação, por favor' });
  await until(s, task.id, 'waiting_input');
  assert.equal((await s.call('POST', `/tasks/${task.id}/input`, { text: 'Pode sim' })).status, 200);
  await until(s, task.id, 'done');
  const [approval] = (await s.call('GET', '/approvals?status=approved')).body;
  assert.equal(approval.answer, 'Pode sim');
});

test('cancelar no meio, e repetir depois', async (t) => {
  const s = setup({ stepMs: 200 }); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'renfield', title: 'Longa', prompt: 'demora' });
  await until(s, task.id, 'running');
  const r = await s.call('POST', `/tasks/${task.id}/cancel`);
  assert.equal(r.body.status, 'cancelled');
  await new Promise((res) => setTimeout(res, 300));
  assert.equal((await statusOf(s, task.id)).status, 'cancelled');
  assert.equal((await s.call('POST', `/tasks/${task.id}/cancel`)).status, 409);

  assert.equal((await s.call('POST', `/tasks/${task.id}/retry`)).body.status, 'queued');
  await waitFor(async () => (await statusOf(s, task.id)).status === 'done', 'repetida terminar', 4000);
});

test('falha deixa o agente com erro até você limpar', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Quebra', prompt: 'isto vai falhar' });
  const failed = await until(s, task.id, 'failed');
  assert.match(failed.error, /Falha simulada/);
  assert.equal((await s.call('GET', '/agents/etnad')).body.status, 'error');
  assert.equal((await s.call('POST', '/agents/etnad/clear-error')).body.status, 'idle');
});

test('a fila respeita a concorrência do manifesto', async (t) => {
  const s = setup({ stepMs: 30 }); t.after(s.cleanup);
  const a = (await s.call('POST', '/tasks', { assignee: 'renfield', title: 'A', prompt: 'a' })).body;
  const b = (await s.call('POST', '/tasks', { assignee: 'renfield', title: 'B', prompt: 'b' })).body;
  await until(s, a.id, 'running');
  assert.equal((await statusOf(s, b.id)).status, 'queued');
  const doneA = await until(s, a.id, 'done');
  const doneB = await until(s, b.id, 'done');
  assert.ok(doneB.startedAt >= doneA.finishedAt);
});

test('valida entradas e agentes desconhecidos', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const empty = await s.call('POST', '/tasks', {});
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'invalid_request');
  const unknown = await s.call('POST', '/tasks', { assignee: 'ninguem', title: 'x', prompt: 'y' });
  assert.equal(unknown.body.error.code, 'unknown_agent');
  assert.equal((await s.call('GET', '/tasks/nao-existe')).status, 404);
});

test('lista tarefas com paginação', async (t) => {
  const s = setup({ stepMs: 1 }); t.after(s.cleanup);
  for (let i = 0; i < 5; i++) await s.call('POST', '/tasks', { assignee: 'renfield', title: `T${i}`, prompt: 'p' });
  const first = (await s.call('GET', '/tasks?limit=3')).body;
  assert.equal(first.items.length, 3);
  assert.ok(first.nextCursor);
  const second = (await s.call('GET', `/tasks?limit=3&cursor=${first.nextCursor}`)).body;
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
});

test('no boot, o que estava rodando vira falha', async (t) => {
  const s = setup({ dbFile: true, stepMs: 10_000 });
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Interrompida', prompt: 'p' });
  await until(s, task.id, 'running');
  s.shack.close();
  const again = s.make(5);
  try {
    const recovered = again.tasks.get(task.id);
    assert.equal(recovered.status, 'failed');
    assert.match(recovered.error ?? '', /reinício/);
  } finally {
    again.close();
    s.cleanup();
  }
  void t;
});
