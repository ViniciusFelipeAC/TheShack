import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setup, waitFor } from './helpers.ts';

test('pareamento cria um dispositivo novo, e revogar derruba o token', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const { body: pairing } = await s.call('POST', '/auth/pairing-codes');
  assert.match(pairing.code, /^\d{6}$/);

  const paired = await s.call('POST', '/auth/pair', { code: pairing.code, deviceName: 'Celular' }, null);
  assert.equal(paired.status, 200);
  const phone = paired.body.token as string;
  assert.equal((await s.call('GET', '/me', undefined, phone)).body.name, 'Celular');
  assert.equal((await s.call('POST', '/auth/pair', { code: pairing.code, deviceName: 'De novo' }, null)).body.error.code, 'invalid_code');

  await s.call('DELETE', `/devices/${paired.body.device.id}`);
  assert.equal((await s.call('GET', '/me', undefined, phone)).status, 401);
});

test('persona: lê e grava o arquivo do agente', async (t) => {
  const s = setup(); t.after(s.cleanup);
  assert.match((await s.call('GET', '/agents/renfield/persona')).body.content, /Renfield/);
  await s.call('PUT', '/agents/renfield/persona', { content: '# Novo Renfield\nMais sucinto.' });
  assert.equal(readFileSync(join(s.agentsDir, 'renfield', 'persona.md'), 'utf8'), '# Novo Renfield\nMais sucinto.');
  assert.match((await s.call('GET', '/agents/renfield/persona')).body.content, /Mais sucinto/);
});

test('manifesto inválido desativa só aquele agente', async (t) => {
  const s = setup(); t.after(s.cleanup);
  mkdirSync(join(s.agentsDir, 'quebrado'));
  writeFileSync(join(s.agentsDir, 'quebrado', 'agent.yaml'), 'id: quebrado\nname: Quebrado\n');
  mkdirSync(join(s.agentsDir, 'trocado'));
  writeFileSync(join(s.agentsDir, 'trocado', 'agent.yaml'), 'id: outro\nname: X\nrole: Y\nmodel: sonnet\n');
  s.shack.registry.load();

  const agents = (await s.call('GET', '/agents')).body as Array<{ id: string; status: string; manifestError: string | null }>;
  const broken = agents.find((a) => a.id === 'quebrado')!;
  assert.equal(broken.status, 'disabled');
  assert.match(broken.manifestError ?? '', /role/);
  assert.match(agents.find((a) => a.id === 'trocado')!.manifestError ?? '', /nome da pasta/);
  assert.equal(agents.find((a) => a.id === 'renfield')!.status, 'idle');

  const r = await s.call('POST', '/tasks', { assignee: 'quebrado', title: 'x', prompt: 'y' });
  assert.equal(r.body.error.code, 'agent_disabled');
});

test('editar o agent.yaml recarrega sozinho', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const stop = s.shack.registry.watch();
  t.after(stop);
  const file = join(s.agentsDir, 'etnad', 'agent.yaml');
  writeFileSync(file, readFileSync(file, 'utf8').replace('concurrency: 1', 'concurrency: 2'));
  await waitFor(() => s.shack.registry.get('etnad')?.manifest?.limits.concurrency === 2, 'recarregar o manifesto', 4000);
  const updates = (await s.call('GET', '/events?type=agent.updated&agentId=etnad')).body.items;
  assert.ok(updates.length >= 1);
});

test('a documentação OpenAPI é gerada e pública', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const r = await s.call('GET', '/openapi.json', undefined, null);
  assert.equal(r.status, 200);
  for (const path of ['/tasks', '/tasks/{id}', '/approvals/{id}', '/agents', '/auth/pair', '/events']) {
    assert.ok(r.body.paths[path], `faltou ${path}`);
  }
});
