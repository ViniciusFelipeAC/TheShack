import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistantTools } from '../src/renfield/assistant-tools.ts';
import { setup, waitFor } from './helpers.ts';

type S = ReturnType<typeof setup>;
const MIN = 60_000;
const notifications = async (s: S) => (await s.call('GET', '/notifications?limit=100')).body.items as Array<{ title: string; body: string; kind: string; priority: string; silenced: boolean }>;
const weekdaySP = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const tools = (s: S) => assistantTools({ ...s.shack, timezone: 'America/Sao_Paulo' });
const tool = (s: S, name: string) => tools(s).find((t) => t.name === name)!;

test('agenda: horário local, evento único e recorrente no dia certo', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const one = await s.call('POST', '/calendar/events', { title: 'Dentista', start: '2026-10-22T09:30', end: '2026-10-22T10:30', location: 'Centro' });
  assert.equal(one.status, 201);
  assert.equal(one.body.start, '2026-10-22T12:30:00.000Z', 'sem fuso vale São Paulo');

  // Segunda às 22h em São Paulo já é terça em UTC: a repetição tem que continuar na segunda.
  await s.call('POST', '/calendar/events', { title: 'Futebol', start: '2026-10-26T22:00', end: '2026-10-26T23:00', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
  const range = (await s.call('GET', '/calendar/events?from=2026-10-20T00:00&to=2026-11-10T00:00')).body as Array<{ title: string; occurrenceStart: string }>;
  const futebol = range.filter((e) => e.title === 'Futebol');
  assert.equal(futebol.length, 3);
  for (const f of futebol) assert.match(weekdaySP(f.occurrenceStart), /segunda-feira.*22:00/);
  assert.equal(range[0]!.title, 'Dentista', 'ordenado por início');

  assert.equal((await s.call('POST', '/calendar/events', { title: 'x', start: '2026-10-22T10:00', end: '2026-10-22T09:00' })).status, 400);
  assert.equal((await s.call('POST', '/calendar/events', { title: 'x', start: '2026-10-22T10:00', rrule: 'TODA SEGUNDA' })).status, 400);
  const moved = await s.call('PATCH', `/calendar/events/${one.body.id}`, { start: '2026-10-23T09:30', end: '2026-10-23T10:30' });
  assert.equal(moved.body.start, '2026-10-23T12:30:00.000Z');
  await s.call('DELETE', `/calendar/events/${one.body.id}`);
  assert.equal((await s.call('GET', '/calendar/events?from=2026-10-20T00:00&to=2026-10-25T00:00')).body.length, 0);
});

test('lembrete único dispara na hora e termina', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-21T15:00:00Z');
  const r = (await s.call('POST', '/reminders', { text: 'Ligar para a mãe', at: '2026-10-21T12:05' })).body;
  assert.equal(r.nextFireAt, '2026-10-21T15:05:00.000Z');
  s.shack.scheduler.tick(s.advance(4 * MIN));
  assert.equal((await notifications(s)).length, 0);
  s.shack.scheduler.tick(s.advance(1 * MIN));
  const [n] = await notifications(s);
  assert.equal(n!.title, 'Lembrete');
  assert.equal(n!.body, 'Ligar para a mãe');
  assert.equal(s.shack.reminders.get(r.id).status, 'done');
  assert.equal((await s.call('POST', '/reminders', { text: 'atrasado', at: '2026-10-21T11:00' })).status, 400, 'horário no passado');
});

test('lembrete recorrente: dias úteis às 8h, pulando o fim de semana', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-24T12:00:00Z'); // sábado
  const r = (await s.call('POST', '/reminders', { text: 'Tomar o remédio', cron: '0 8 * * 1-5' })).body;
  assert.match(weekdaySP(r.nextFireAt), /segunda-feira.*08:00/);
  s.setNow(r.nextFireAt);
  s.shack.scheduler.tick();
  assert.equal((await notifications(s)).length, 1);
  const after = s.shack.reminders.get(r.id);
  assert.equal(after.status, 'active');
  assert.match(weekdaySP(after.nextFireAt!), /terça-feira.*08:00/);
  assert.equal((await s.call('POST', '/reminders', { text: 'x', cron: 'toda hora' })).status, 400);
});

test('alarme toca de 2 em 2 minutos até dispensar, e a soneca adia', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-21T10:00:00Z');
  const a = (await s.call('POST', '/reminders', { text: 'Acordar', kind: 'alarm', at: '2026-10-21T07:01' })).body;
  assert.equal(a.priority, 'high');
  s.shack.scheduler.tick(s.advance(1 * MIN));
  assert.equal(s.shack.reminders.get(a.id).ringing, true);
  s.shack.scheduler.tick(s.advance(1 * MIN));
  assert.equal((await notifications(s)).length, 1, 'ainda não passou 2 minutos');
  s.shack.scheduler.tick(s.advance(1 * MIN));
  assert.equal((await notifications(s))[0]!.title, 'Alarme tocando');

  await s.call('POST', `/reminders/${a.id}/snooze`, { minutes: 10 });
  s.shack.scheduler.tick(s.advance(5 * MIN));
  assert.equal((await notifications(s)).length, 2, 'soneca segura o alarme');
  s.shack.scheduler.tick(s.advance(5 * MIN));
  assert.equal((await notifications(s)).length, 3, 'tocou de novo depois da soneca');

  await s.call('POST', `/reminders/${a.id}/dismiss`);
  s.shack.scheduler.tick(s.advance(10 * MIN));
  assert.equal((await notifications(s)).length, 3, 'dispensado não toca mais');
  assert.equal(s.shack.reminders.get(a.id).status, 'done');
});

test('com o servidor desligado: atrasado dispara, antigo vira perdido, recorrente pula', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-21T10:00:00Z');
  const recent = (await s.call('POST', '/reminders', { text: 'Recente', at: '2026-10-21T07:30' })).body;
  const old = (await s.call('POST', '/reminders', { text: 'Antigo', at: '2026-10-21T07:05' })).body;
  const daily = (await s.call('POST', '/reminders', { text: 'Diário', cron: '10 7 * * *' })).body;
  s.shack.reminders.recover(new Date('2026-10-21T10:02:00Z'));
  let list = await notifications(s);
  assert.equal(list.length, 0, 'nada venceu ainda');

  s.shack.reminders.recover(new Date('2026-10-21T16:20:00Z')); // 6h20 depois do "Antigo"
  list = await notifications(s);
  assert.ok(list.some((n) => n.body.startsWith('Recente (atrasado')));
  assert.ok(list.some((n) => n.title === 'Lembrete perdido' && n.body.startsWith('Antigo')));
  assert.ok(!list.some((n) => n.body.startsWith('Diário')), 'recorrente não dispara o que passou');
  assert.ok(s.shack.reminders.get(daily.id).nextFireAt! > '2026-10-21T16:20:00Z');
  assert.equal(s.shack.reminders.get(recent.id).status, 'done');
  assert.equal(s.shack.reminders.get(old.id).status, 'done');
});

test('timer termina na hora, com prioridade alta', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-21T10:00:00Z');
  const timer = (await s.call('POST', '/timers', { seconds: 60, label: 'Macarrão' })).body;
  const other = (await s.call('POST', '/timers', { seconds: 30 })).body;
  await s.call('DELETE', `/timers/${other.id}`);
  s.shack.scheduler.tick(s.advance(59_000));
  assert.equal((await notifications(s)).length, 0);
  s.shack.scheduler.tick(s.advance(1000));
  const [n] = await notifications(s);
  assert.equal(n!.title, 'Timer terminou');
  assert.equal(n!.body, 'Macarrão');
  assert.equal(n!.priority, 'high');
  assert.equal(s.shack.timers.get(timer.id).status, 'finished');
  assert.equal(s.shack.timers.get(other.id).status, 'cancelled');
});

test('listas: padrão, itens, marcar e limpar; o Renfield cria lista se precisar', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const all = (await s.call('GET', '/lists')).body as Array<{ id: string; name: string }>;
  assert.deepEqual(all.map((l) => l.name), ['Afazeres', 'Mercado']);
  let mercado = (await s.call('POST', '/lists/mercado/items', { text: 'Leite' })).body;
  mercado = (await s.call('PATCH', `/lists/mercado/items/${mercado.items[0].id}`, { done: true })).body;
  assert.equal(mercado.items[0].done, true);
  mercado = (await s.call('POST', '/lists/mercado/clear-done')).body;
  assert.equal(mercado.items.length, 0);

  await tool(s, 'lists_add').run({ list: 'Farmácia', items: ['Protetor solar', 'Vitamina D'] }, { conversationId: 'main' });
  const checked = JSON.parse(await tool(s, 'lists_check').run({ list: 'farmácia', item: 'protetor' }, { conversationId: 'main' }));
  assert.deepEqual(checked.list.items, ['[ ] Vitamina D', '[x] Protetor solar']);
  assert.equal((await s.call('POST', '/lists', { name: 'mercado' })).status, 409);
});

test('notas: título automático, busca e edição', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const n = (await s.call('POST', '/notes', { content: 'Senha do Wi-Fi da casa da praia\nmar123' })).body;
  assert.equal(n.title, 'Senha do Wi-Fi da casa da praia');
  await s.call('POST', '/notes', { title: 'Ideias', content: 'App de receitas' });
  assert.equal((await s.call('GET', '/notes?q=praia')).body.length, 1);
  await s.call('PATCH', `/notes/${n.id}`, { content: 'trocada' });
  assert.equal((await s.call('GET', '/notes?q=trocada')).body.length, 1);
  await s.call('DELETE', `/notes/${n.id}`);
  assert.equal((await s.call('GET', '/notes')).body.length, 1);
});

test('push: assina, entrega, e esquece navegadores que cancelaram', async (t) => {
  const s = setup(); t.after(s.cleanup);
  assert.ok((await s.call('GET', '/push/vapid-key')).body.publicKey.length > 50);
  await s.call('POST', '/push/subscriptions', { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } });
  await s.call('POST', '/notifications/test');
  await waitFor(() => s.pushes.length === 1, 'push enviado');
  assert.equal(s.pushes[0]!.payload.title, 'Teste da Shack');

  s.failPush(410);
  await s.call('POST', '/notifications/test');
  await waitFor(async () => (await s.call('GET', '/push/vapid-key')).body.subscriptions === 0, 'assinatura removida');
});

test('modo foco segura o que não é urgente e manda um resumo no fim', async (t) => {
  const s = setup(); t.after(s.cleanup);
  await s.call('POST', '/push/subscriptions', { endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });
  await s.call('PUT', '/settings/mode', { name: 'foco' });
  s.shack.notifier.notify({ title: 'Lista atualizada', body: 'Leite', priority: 'normal', kind: 'renfield' });
  s.shack.notifier.notify({ title: 'Servidor caiu', body: 'urgente', priority: 'high', kind: 'renfield' });
  await waitFor(() => s.pushes.length === 1, 'só o urgente vai por push');
  assert.equal(s.pushes[0]!.payload.title, 'Servidor caiu');
  assert.equal((await notifications(s)).find((n) => n.title === 'Lista atualizada')!.silenced, true);

  await s.call('PUT', '/settings/mode', { name: null });
  const digest = (await notifications(s))[0]!;
  assert.equal(digest.title, 'Durante o modo foco: 1 aviso');
  assert.match(digest.body, /Lista atualizada: Leite/);

  // a casa mostra o modo ativo: cada troca sai como evento
  const modes = s.shack.bus.list({ since: 0, limit: 100 }).filter((e) => e.type === 'mode.changed').map((e) => (e.data as { active: { name: string } | null }).active?.name ?? null);
  assert.deepEqual(modes, ['foco', null]);
});

test('tarefa de outro agente também vira notificação', async (t) => {
  const s = setup(); t.after(s.cleanup);
  await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Revisar README', prompt: 'p' });
  const n = await waitFor(async () => (await notifications(s)).find((x) => x.kind === 'task'), 'notificação da tarefa');
  assert.equal(n.title, 'etnaD concluiu');
  assert.equal(n.body, 'Revisar README');
});

test('ferramentas do Renfield: compromisso, lembrete recorrente e timer', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-10-21T15:00:00Z');
  const ctx = { conversationId: 'main' };
  const ev = JSON.parse(await tool(s, 'calendar_create').run({ title: 'Reunião', start: '2026-10-22T14:00', end: '2026-10-22T15:00' }, ctx));
  assert.match(ev.created.start, /22\/10.*14:00/);
  const listed = JSON.parse(await tool(s, 'calendar_list').run({ from: '2026-10-22T00:00', to: '2026-10-23T00:00' }, ctx));
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].title, 'Reunião');
  const rem = JSON.parse(await tool(s, 'reminders_create').run({ text: 'Remédio', cron: '0 8 * * 1-5' }, ctx));
  assert.match(rem.created.next, /22\/10.*08:00/);
  const timer = JSON.parse(await tool(s, 'timers_start').run({ minutes: 5, label: 'Chá' }, ctx));
  assert.equal(timer.started.label, 'Chá');
  const changed = (await s.call('GET', '/events?type=data.changed')).body.items.map((e: { data: { entity: string } }) => e.data.entity);
  for (const entity of ['calendar', 'reminders', 'timers']) assert.ok(changed.includes(entity), `faltou data.changed de ${entity}`);
});
