import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentTokens } from '../src/core/usage.ts';
import { tasksRepo } from '../src/db/repos.ts';
import { Account, type PlanUsageFetcher } from '../src/renfield/account.ts';
import { setup, waitFor } from './helpers.ts';

/** Uma resposta do /usage como a que o Claude Code devolve: sessão de 5 horas, semana e uma janela por modelo. */
const answer = (five: number, week: number) => ({
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: five, resets_at: '2026-11-26T01:20:00Z' },
    seven_day: { utilization: week, resets_at: '2026-12-02T10:00:00Z' },
    seven_day_opus: null,
    model_scoped: [{ display_name: 'Fable', utilization: 3, resets_at: '2026-12-02T10:00:00Z' }],
  },
});

test('uso do plano: as janelas, o alerta a partir de 90% e o esgotado em 100%', async (t) => {
  const s = setup();
  t.after(s.cleanup);
  let now = new Date('2026-11-25T21:00:00Z');
  const account = new Account(s.shack.bus, () => now);
  await account.refreshPlan(async () => answer(42, 12));
  const w = Object.fromEntries(account.status.quota!.windows.map((x) => [x.kind, x]));
  assert.deepEqual(Object.keys(w).sort(), ['five_hour', 'model:Fable', 'seven_day']);
  assert.equal(w.five_hour!.percent, 42);
  assert.equal(w.five_hour!.resetsAt, '2026-11-26T01:20:00Z');
  assert.equal(w.seven_day!.status, 'allowed');
  assert.equal(account.status.usageError, null);
  assert.equal(account.status.usageCheckedAt, now.toISOString());

  now = new Date(now.getTime() + 61_000);
  await account.refreshPlan(async () => answer(93, 100));
  const v = Object.fromEntries(account.status.quota!.windows.map((x) => [x.kind, x]));
  assert.equal(v.five_hour!.status, 'allowed_warning');
  assert.equal(v.seven_day!.status, 'rejected');
  assert.equal(account.status.quota!.status, 'rejected');
});

test('uso do plano: uma consulta por minuto, pedidos juntos dividem a mesma, e falha diz "Indisponível"', async (t) => {
  const s = setup();
  t.after(s.cleanup);
  let now = new Date('2026-11-25T21:00:00Z');
  const account = new Account(s.shack.bus, () => now);
  let calls = 0;
  const slow: PlanUsageFetcher = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return answer(10, 5); };
  await Promise.all([account.refreshPlan(slow), account.refreshPlan(slow)]);
  assert.equal(calls, 1);
  await account.refreshPlan(slow);
  assert.equal(calls, 1, 'menos de um minuto: devolve a última');
  await account.refreshPlan(slow, { force: true });
  assert.equal(calls, 2);

  now = new Date(now.getTime() + 61_000);
  await account.refreshPlan(async () => { throw new Error('sem rede'); });
  assert.equal(account.status.usageError, 'Indisponível: sem rede');
  assert.equal(account.status.quota!.windows.find((x) => x.kind === 'five_hour')!.percent, 10, 'a falha não apaga o último número');

  now = new Date(now.getTime() + 61_000);
  await account.refreshPlan(async () => ({ rate_limits_available: false, rate_limits: null }));
  assert.match(account.status.usageError!, /não informou os limites/);
});

test('rotas: atualizar o uso do plano e os tokens das tarefas por agente', async (t) => {
  const s = setup();
  t.after(s.cleanup);
  s.shack.planUsage = async () => answer(42, 12);
  const r = await s.call('POST', '/system/usage/refresh');
  assert.equal(r.status, 200);
  assert.equal(r.body.quota.windows.find((x: { kind: string }) => x.kind === 'five_hour').percent, 42);
  assert.equal(r.body.usageError, null);

  // Duas tarefas do etnaD com consumo; a lista sai por agente, com hoje e a semana.
  for (const n of [1, 2]) {
    const c = await s.call('POST', '/tasks', { assignee: 'etnad', title: `T${n}`, prompt: 'x', workspaceId: s.ws.id });
    await waitFor(() => s.shack.tasks.get(c.body.id).status === 'done', 'a tarefa simulada terminar');
    tasksRepo(s.shack.db).update(c.body.id, { usage: { inputTokens: 1000 * n, outputTokens: 100 } });
  }
  const tokens = await s.call('GET', '/system/usage/tasks');
  assert.equal(tokens.status, 200);
  assert.deepEqual(tokens.body, [{ agentId: 'etnad', today: { inputTokens: 3000, outputTokens: 200 }, week: { inputTokens: 3000, outputTokens: 200 }, tasks: 2 }]);
  assert.equal((await s.call('POST', '/system/usage/refresh', undefined, null)).status, 401);
});

test('tokens por agente: "hoje" é no fuso da casa, e quem gastou mais na semana vem primeiro', () => {
  // 23h de 25/11 em São Paulo é 02h de 26/11 em UTC.
  const now = new Date('2026-11-26T02:00:00Z');
  const rows = [
    { assignee: 'mina', usage: { inputTokens: 10, outputTokens: 1 }, finishedAt: '2026-11-25T12:00:00Z' },
    { assignee: 'harker', usage: { inputTokens: 500, outputTokens: 50 }, finishedAt: '2026-11-24T12:00:00Z' },
    { assignee: 'mina', usage: { inputTokens: 20, outputTokens: 2 }, finishedAt: '2026-11-22T12:00:00Z' },
  ];
  const list = agentTokens(rows, 'America/Sao_Paulo', now);
  assert.deepEqual(list.map((x) => x.agentId), ['harker', 'mina']);
  assert.deepEqual(list[1], { agentId: 'mina', today: { inputTokens: 10, outputTokens: 1 }, week: { inputTokens: 30, outputTokens: 3 }, tasks: 2 });
  assert.deepEqual(list[0]!.today, { inputTokens: 0, outputTokens: 0 });
});
