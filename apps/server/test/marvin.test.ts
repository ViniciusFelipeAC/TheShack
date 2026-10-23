import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { serve } from '@hono/node-server';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { WebSocketServer } from 'ws';
import { Account } from '../src/marvin/account.ts';
import { marvinTools } from '../src/marvin/tools.ts';
import { setup, waitFor } from './helpers.ts';

type S = ReturnType<typeof setup>;
const say = (s: S, text: string, style = 'normal') => s.call('POST', '/conversations/main/messages?wait=true', { text, style });
const messages = async (s: S) => (await s.call('GET', '/conversations/main/messages?limit=100')).body as Array<{ role: string; kind: string; text: string; taskId: string | null }>;
const toolsOf = (s: S) => marvinTools({ tasks: s.shack.tasks, registry: s.shack.registry, mind: s.shack.mind, workspaces: s.shack.workspaces });
const run = (s: S, name: string, args: Record<string, unknown>) => toolsOf(s).find((t) => t.name === name)!.run(args, { conversationId: 'main' });

test('chat: manda, o Marvin responde, e tudo fica no histórico', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const r = await say(s, 'Boa tarde, Marvin');
  assert.equal(r.status, 200);
  assert.equal(r.body.reply.text, 'Pois não. Você disse: Boa tarde, Marvin');
  const history = await messages(s);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant']);

  const turn = s.engine.last;
  assert.match(turn.systemPrompt, /mordomo/i, 'a persona entra no prompt');
  assert.match(turn.systemPrompt, /Só crie, delegue ou cancele tarefas quando/, 'as regras fixas entram no prompt');
  assert.match(turn.context, /Estilo pedido: normal/);
  assert.match(turn.context, /etnaD: ocioso/);
  assert.match(turn.context, /America\/Sao_Paulo/);
});

test('sem ?wait a resposta chega depois, e o estilo vai no contexto', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const r = await s.call('POST', '/conversations/main/messages', { text: 'Resumo rápido', style: 'voice' });
  assert.equal(r.status, 202);
  assert.equal(r.body.reply, null);
  await waitFor(async () => (await messages(s)).length === 2, 'resposta');
  assert.match(s.engine.last.context, /Estilo pedido: voice/);
});

test('editar a persona muda o prompt da próxima mensagem', async (t) => {
  const s = setup(); t.after(s.cleanup);
  await s.call('PUT', '/agents/marvin/persona', { content: 'Você fala como um mordomo vitoriano.' });
  await say(s, 'Olá');
  assert.match(s.engine.last.systemPrompt, /mordomo vitoriano/);
});

test('memórias e regras: você ensina, ele vê no prompt', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const mem = (await s.call('POST', '/memories', { content: 'Prefere ser chamado de Vini', kind: 'preference' })).body;
  assert.equal(mem.isNew, false);
  const rule = (await s.call('POST', '/rules', { instruction: 'Ativar o modo foco', trigger: 'modo foco' })).body;
  await say(s, 'Olá');
  assert.match(s.engine.last.systemPrompt, /Prefere ser chamado de Vini/);
  assert.match(s.engine.last.systemPrompt, /Quando a mensagem contiver "modo foco": Ativar o modo foco/);

  await s.call('PATCH', `/rules/${rule.id}`, { enabled: false });
  await s.call('DELETE', `/memories/${mem.id}`);
  await say(s, 'De novo');
  assert.doesNotMatch(s.engine.last.systemPrompt, /Vini|Ativar o modo foco/);
});

test('feedback vira regra marcada como nova', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.engine.handler = async (i) => {
    if (i.text.startsWith('/feedback')) await run(s, 'rules_add', { instruction: 'Não usar listas', from_feedback: true });
    return 'Anotado.';
  };
  const r = await s.call('POST', '/feedback', { text: 'não use listas' });
  assert.equal(r.status, 202);
  await waitFor(async () => (await s.call('GET', '/rules')).body.length === 1, 'regra criada');
  const [rule] = (await s.call('GET', '/rules')).body;
  assert.equal(rule.source, 'feedback');
  assert.equal(rule.isNew, true);
});

test('modo foco aparece no contexto', async (t) => {
  const s = setup(); t.after(s.cleanup);
  assert.equal((await s.call('PUT', '/settings/mode', { name: 'foco' })).body.active.name, 'foco');
  await say(s, 'Olá');
  assert.match(s.engine.last.context, /Modo ativo: foco/);
  assert.equal((await s.call('PUT', '/settings/mode', { name: 'inexistente' })).status, 404);
});

test('delegar: o Marvin cria a tarefa e avisa quando ela termina', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.engine.handler = async () => {
    await run(s, 'tasks_create', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Testes dos lembretes', prompt: 'Adicionar testes' });
    return 'Pois não. Passei a tarefa ao etnaD.';
  };
  await say(s, 'Pede pro etnaD adicionar testes');
  const notice = await waitFor(async () => (await messages(s)).find((m) => m.kind === 'task_notice'), 'aviso de conclusão');
  assert.match(notice.text, /O etnaD concluiu "Testes dos lembretes"/);
  const task = (await s.call('GET', `/tasks/${notice.taskId}`)).body;
  assert.deepEqual(task.origin, { kind: 'agent', agentId: 'marvin', conversationId: 'main' });
});

test('"sim" no chat aprova o pedido pendente do etnaD', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: task } = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Instalar', prompt: 'precisa de aprovação' });
  await waitFor(async () => (await messages(s)).some((m) => /precisa de você/.test(m.text)), 'aviso de aprovação');
  const r = await say(s, 'Sim, pode');
  assert.match(r.body.reply.text, /Autorizei o pedido do etnaD/);
  await waitFor(async () => (await s.call('GET', `/tasks/${task.id}`)).body.status === 'done', 'tarefa terminar');
  assert.equal(s.engine.turns.length, 0, 'responder "sim" não gasta uma vez do Marvin');
});

test('enquanto responde, o Marvin aparece trabalhando', async (t) => {
  const s = setup(); t.after(s.cleanup);
  let release: (() => void) | null = null;
  s.engine.handler = () => new Promise<string>((r) => { release = () => r('Pronto.'); });
  await s.call('POST', '/conversations/main/messages', { text: 'Pensa com calma' });
  await waitFor(async () => (await s.call('GET', '/agents/marvin')).body.status === 'working', 'Marvin trabalhando');
  assert.equal((await s.call('GET', '/agents/marvin')).body.activity, 'Respondendo você');
  const finish = await waitFor(() => release, 'motor começar a responder');
  finish();
  await waitFor(async () => (await s.call('GET', '/agents/marvin')).body.status === 'idle', 'Marvin ocioso');
});

test('uma resposta por vez em cada conversa', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.engine.handler = async (i) => { await new Promise((r) => setTimeout(r, 20)); return `ok ${i.text}`; };
  await Promise.all([say(s, 'um'), say(s, 'dois'), say(s, 'três')]);
  assert.equal(s.engine.maxActive, 1);
  assert.deepEqual(s.engine.turns.map((x) => x.text), ['um', 'dois', 'três']);
});

test('se o motor falha, a mensagem de erro fica no chat', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.engine.handler = () => { throw new Error('processo caiu'); };
  const r = await say(s, 'Olá');
  assert.equal(r.body.reply.kind, 'error');
  assert.match(r.body.reply.text, /Lamento, não consegui responder agora\. processo caiu/);
});

test('websocket: chat.send recebe o texto em tempo real e a mensagem final', async (t) => {
  const s = setup();
  const server = serve({ fetch: s.app.fetch, hostname: '127.0.0.1', port: 0, websocket: { server: new WebSocketServer({ noServer: true }) } });
  await once(server, 'listening');
  t.after(() => { server.close(); s.cleanup(); });
  const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ws`);
  const msgs: Array<{ type: string; messageId?: string; text?: string; event?: { type: string; data: { streamId: string | null; message: { role: string } } } }> = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(String(e.data)));
  await new Promise((r) => { ws.onopen = r; });
  ws.send(JSON.stringify({ type: 'auth', token: s.token }));
  ws.send(JSON.stringify({ type: 'subscribe' }));
  await waitFor(() => msgs.find((m) => m.type === 'auth.ok'), 'auth');
  ws.send(JSON.stringify({ type: 'chat.send', text: 'Olá pelo socket', clientId: 'c1' }));
  const final = await waitFor(() => msgs.find((m) => m.event?.type === 'chat.message' && m.event.data.message.role === 'assistant'), 'mensagem final');
  const deltas = msgs.filter((m) => m.type === 'chat.delta');
  assert.ok(deltas.length >= 2);
  assert.equal(deltas[0]!.messageId, final.event!.data.streamId);
  assert.equal(deltas.map((d) => d.text).join(''), 'Pois não. Você disse: Olá pelo socket');
  ws.close();
});

test('conta: aceita assinatura, recusa chave de API e escolhe o modelo do plano', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const models = [{ value: 'default', displayName: 'Padrão', description: '' }, { value: 'sonnet', displayName: 'Sonnet', description: '' }, { value: 'haiku', displayName: 'Haiku', description: '' }];
  const fakeQuery = (info: object) => ({ accountInfo: async () => info, supportedModels: async () => models }) as unknown as Query;

  const ok = new Account(s.shack.bus);
  await ok.inspect(fakeQuery({ subscriptionType: 'max', apiKeySource: 'none', apiProvider: 'firstParty' }));
  assert.equal(ok.status.subscriptionOk, true);
  assert.doesNotThrow(() => ok.assertSubscription());
  assert.equal(ok.pickModel('etnad', ['opus', 'sonnet'], 'sonnet'), 'sonnet');
  assert.equal(ok.pickModel('marvin', ['sonnet', 'haiku'], 'sonnet'), 'sonnet');

  const paid = new Account(s.shack.bus);
  await paid.inspect(fakeQuery({ apiKeySource: 'ANTHROPIC_API_KEY' }));
  assert.equal(paid.status.subscriptionOk, false);
  assert.throws(() => paid.assertSubscription(), /cobra por uso/);

  process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
  try {
    const env = ok.cleanEnv();
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.ok(env.PATH ?? env.Path);
  } finally { delete process.env.ANTHROPIC_API_KEY; }

  assert.equal((await s.call('GET', '/system/account')).body.subscriptionOk, null);
});
