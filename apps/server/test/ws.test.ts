import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { setup, waitFor } from './helpers.ts';

type Msg = { type: string; event?: { type: string; taskId: string | null } };

async function start(t: { after(fn: () => void): void }) {
  const s = setup();
  const server = serve({ fetch: s.app.fetch, hostname: '127.0.0.1', port: 0, websocket: { server: new WebSocketServer({ noServer: true }) } });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  t.after(() => { server.close(); s.cleanup(); });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`);
    const msgs: Msg[] = [];
    ws.onmessage = (e) => msgs.push(JSON.parse(String(e.data)));
    await new Promise((r) => { ws.onopen = r; });
    return { ws, msgs };
  };
  return { s, connect };
}

test('websocket: autentica, faz replay e recebe eventos ao vivo', async (t) => {
  const { s, connect } = await start(t);
  const before = (await s.call('POST', '/tasks', { assignee: 'renfield', title: 'Antes', prompt: 'x' })).body;
  const { ws, msgs } = await connect();

  ws.send(JSON.stringify({ type: 'auth', token: s.token }));
  await waitFor(() => msgs.find((m) => m.type === 'auth.ok'), 'auth.ok');
  ws.send(JSON.stringify({ type: 'subscribe', since: 0 }));
  await waitFor(() => msgs.find((m) => m.event?.type === 'task.created' && m.event.taskId === before.id), 'replay');

  const after = (await s.call('POST', '/tasks', { assignee: 'renfield', title: 'Depois', prompt: 'y' })).body;
  await waitFor(() => msgs.find((m) => m.event?.type === 'task.done' && m.event.taskId === after.id), 'evento ao vivo');

  ws.send(JSON.stringify({ type: 'ping' }));
  await waitFor(() => msgs.find((m) => m.type === 'pong'), 'pong');

  const closed = new Promise<number>((r) => { ws.onclose = (e) => r(e.code); });
  await s.call('DELETE', `/devices/${s.device.id}`);
  assert.equal(await closed, 4001);
});

test('websocket: aprova pelo próprio socket', async (t) => {
  const { s, connect } = await start(t);
  const { ws, msgs } = await connect();
  ws.send(JSON.stringify({ type: 'auth', token: s.token }));
  ws.send(JSON.stringify({ type: 'subscribe' }));
  const task = (await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'WS', prompt: 'precisa de aprovação' })).body;
  await waitFor(() => msgs.find((m) => m.event?.type === 'approval.requested'), 'pedido de aprovação');
  const [approval] = (await s.call('GET', '/approvals')).body;
  ws.send(JSON.stringify({ type: 'approval.respond', approvalId: approval.id, decision: 'approve' }));
  await waitFor(() => msgs.find((m) => m.event?.type === 'task.done' && m.event.taskId === task.id), 'tarefa terminar');
  ws.close();
});

test('websocket: token inválido fecha a conexão com 4001', async (t) => {
  const { connect } = await start(t);
  const { ws } = await connect();
  const closed = new Promise<number>((r) => { ws.onclose = (e) => r(e.code); });
  ws.send(JSON.stringify({ type: 'auth', token: 'shk_errado' }));
  assert.equal(await closed, 4001);
});
