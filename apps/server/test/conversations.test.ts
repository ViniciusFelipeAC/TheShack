import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentManifest, ChatMessage, Conversation } from '@shack/shared';
import { createShack } from '../src/shack.ts';
import { FakeEngine } from './fake-engine.ts';
import { setup, waitFor } from './helpers.ts';

type S = ReturnType<typeof setup>;
const say = (s: S, id: string, text: string) => s.call('POST', `/conversations/${id}/messages?wait=true`, { text });
const history = async (s: S, id: string) => (await s.call('GET', `/conversations/${id}/messages?limit=100`)).body as ChatMessage[];

test('conversa nova: começa limpa, vira a aberta e a anterior fica no histórico', async (t) => {
  const s = setup(); t.after(s.cleanup);
  assert.equal((await s.call('GET', '/conversations/current')).body.id, 'main', 'sem escolha, a aberta é a principal');
  await say(s, 'main', 'Boa tarde');
  const since = s.shack.bus.lastSeq();

  const created = await s.call('POST', '/conversations', {});
  assert.equal(created.status, 201);
  const fresh = created.body as Conversation;
  assert.notEqual(fresh.id, 'main');
  assert.equal(fresh.messageCount, 0);
  assert.equal((await s.call('GET', '/conversations/current')).body.id, fresh.id);
  const changed = s.shack.bus.list({ since, limit: 50, type: 'conversation.changed' });
  assert.equal((changed.at(-1)!.data as { current: Conversation }).current.id, fresh.id, 'os outros aparelhos ficam sabendo');

  // "current" manda para a conversa aberta, que ganha uma sessão própria no Claude Code.
  const r = await say(s, 'current', 'Quanto é 2 + 2?');
  assert.equal(r.body.conversationId, fresh.id);
  assert.equal(s.engine.last.conversationId, fresh.id);
  assert.deepEqual((await history(s, 'current')).map((m) => m.text), ['Quanto é 2 + 2?', 'Pois não. Você disse: Quanto é 2 + 2?']);
  assert.equal((await history(s, 'main')).length, 2, 'a principal não mudou');

  const list = (await s.call('GET', '/conversations')).body as Conversation[];
  assert.deepEqual(list.map((c) => [c.id, c.preview, c.messageCount]), [[fresh.id, 'Quanto é 2 + 2?', 2], ['main', 'Boa tarde', 2]]);

  // Voltar fecha o Claude Code da conversa que saiu; ela retoma a sessão salva quando você voltar.
  assert.equal((await s.call('PUT', '/conversations/current', { id: 'main' })).body.id, 'main');
  await waitFor(() => s.engine.resets.includes(fresh.id), 'fechar a sessão da conversa anterior');
  assert.equal((await s.call('GET', '/conversations/current')).body.id, 'main');
  assert.equal((await s.call('PUT', '/conversations/current', { id: 'nao-existe' })).status, 404);

  // Abrir uma conversa nova e sair sem escrever não deixa lixo no histórico.
  const empty = (await s.call('POST', '/conversations', {})).body as Conversation;
  await s.call('PUT', '/conversations/current', { id: 'main' });
  const ids = ((await s.call('GET', '/conversations')).body as Conversation[]).map((c) => c.id).sort();
  assert.deepEqual(ids, [fresh.id, 'main'].sort(), 'a conversa vazia some ao sair dela');
  assert.ok(!s.engine.resets.includes(empty.id), 'conversa vazia nem chegou a abrir o Claude Code');
});

test('avisos de tarefa e feedback vão para a conversa aberta', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const fresh = (await s.call('POST', '/conversations', {})).body as Conversation;
  const task = (await s.call('POST', '/tasks', { assignee: 'etnad', title: 'Teste', prompt: 'faça algo', workspaceId: s.ws.id })).body;
  await waitFor(async () => (await history(s, fresh.id)).some((m) => m.kind === 'task_notice' && m.taskId === task.id), 'aviso na conversa nova');
  assert.ok(!(await history(s, 'main')).some((m) => m.kind === 'task_notice'), 'nada de aviso escondido na principal');

  const fb = await s.call('POST', '/feedback', { text: 'Seja mais breve' });
  assert.equal(fb.body.conversationId, fresh.id);
});

test('modelo e esforço: a troca do app vale por cima do agent.yaml e volta com null', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const since = s.shack.bus.lastSeq();
  const r = await s.call('PUT', '/agents/renfield/settings', { model: 'haiku', effort: 'medium' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.settings, { model: 'haiku', effort: 'medium' });
  assert.deepEqual(r.body.models, ['sonnet', 'haiku'], 'o agent.yaml continua igual');
  assert.ok(s.shack.bus.list({ since, limit: 50, type: 'agent.updated' }).some((e) => e.agentId === 'renfield'), 'os aparelhos recarregam o agente');

  await say(s, 'main', 'Oi');
  assert.deepEqual(s.engine.last.manifest.model, ['haiku', 'sonnet'], 'o escolhido vai na frente, o resto fica de reserva');
  assert.equal(s.engine.last.manifest.effort, 'medium');

  await s.call('PUT', '/agents/renfield/settings', { effort: 'high' });
  assert.deepEqual((await s.call('GET', '/agents/renfield')).body.settings, { model: 'haiku', effort: 'high' }, 'campo ausente fica como está');

  await s.call('PUT', '/agents/renfield/settings', { model: null, effort: null });
  await say(s, 'main', 'De novo');
  assert.deepEqual(s.engine.last.manifest.model, ['sonnet', 'haiku']);
  assert.equal(s.engine.last.manifest.effort, 'low');
  assert.equal(Number(s.shack.db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'agent.%'").get()!.n), 0, 'sem troca, nada fica no banco');

  assert.equal((await s.call('PUT', '/agents/renfield/settings', { effort: 'turbo' })).status, 400);
  assert.equal((await s.call('PUT', '/agents/ninguem/settings', { effort: 'low' })).status, 404);
});

test('modelo fora do plano é recusado, e o plano diz os esforços de cada modelo', async (t) => {
  const s = setup(); t.after(s.cleanup);
  await s.shack.account.inspect({
    accountInfo: async () => ({ subscriptionType: 'pro', tokenSource: 'claude.ai' }),
    supportedModels: async () => [
      { value: 'sonnet', displayName: 'Sonnet', description: '', supportedEffortLevels: ['low', 'medium', 'high'] },
      { value: 'haiku', displayName: 'Haiku', description: '', supportsEffort: false },
      { value: 'opus', displayName: 'Opus', description: '' },
    ],
  } as unknown as Query);
  const plan = (await s.call('GET', '/system/account')).body.availableModels as Array<{ value: string; efforts: string[] | null }>;
  assert.deepEqual(plan.map((m) => [m.value, m.efforts]), [['sonnet', ['low', 'medium', 'high']], ['haiku', []], ['opus', null]]);

  const r = await s.call('PUT', '/agents/etnad/settings', { model: 'gpt-5' });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /não está no seu plano/);
  assert.equal((await s.call('PUT', '/agents/etnad/settings', { model: 'sonnet' })).status, 200);
});

test('a tarefa do etnaD roda com o modelo e o esforço trocados no app', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const seen: AgentManifest[] = [];
  const shack = createShack(s.config, {
    engine: new FakeEngine(), startScheduler: false, progressThrottleMs: 0,
    runner: { async run(_task, agent) { seen.push(agent.manifest!); return { summary: 'ok', changes: [], howToTest: '' }; } },
  });
  t.after(() => shack.close());
  const ws = shack.workspaces.create({ name: 'p', path: join(s.dir, 'projeto'), autoApprove: [], gitBranching: false });
  shack.agentSettings.set('etnad', { model: 'sonnet', effort: 'xhigh' });

  const task = shack.tasks.create({ assignee: 'etnad', title: 't', prompt: 'p', priority: 'normal', workspaceId: ws.id }, { kind: 'user' });
  await waitFor(() => shack.tasks.get(task.id).status === 'done', 'tarefa concluída');
  assert.deepEqual(seen[0]!.model, ['sonnet', 'opus']);
  assert.equal(seen[0]!.effort, 'xhigh');
  assert.deepEqual(shack.tasks.agentInfo(shack.registry.require('etnad')).settings, { model: 'sonnet', effort: 'xhigh' });
});
