import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CalendarEvent, CalendarEventInput, CalendarEventPatch, CalendarOccurrence, ItemInput, ItemPatch, ListInput, Note, NoteInput, NotePatch,
  PushSubscriptionInput, Reminder, ReminderInput, ReminderPatch, ShackNotification, SnoozeInput, Timer, TimerInput, TodoList,
} from '@shack/shared';
import { parseWhen } from '../assistant/time.ts';
import type { Shack } from '../shack.ts';
import { type Env, ERRORS, IdParam, J } from './common.ts';

const Deleted = z.object({ deleted: z.boolean() });
const ok = <T extends z.ZodType>(schema: T, description: string) => ({ 200: { ...J(schema), description } });
const ItemParams = z.object({ id: z.string(), itemId: z.string() });

export function registerAssistantRoutes(api: OpenAPIHono<Env>, shack: Shack) {
  const { calendar, reminders, timers, lists, notes, notifier, push, config } = shack;

  /* ---------- agenda ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/calendar/events', tags: ['Agenda'], summary: 'Compromissos num intervalo. Padrão: os próximos 14 dias.',
    request: { query: z.object({ from: z.string().optional(), to: z.string().optional() }) },
    responses: { ...ok(z.array(CalendarOccurrence), 'Ocorrências em ordem'), 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => {
    const q = c.req.valid('query');
    const from = q.from ? parseWhen(q.from, config.timezone) : new Date();
    const to = q.to ? parseWhen(q.to, config.timezone) : new Date(from.getTime() + 14 * 86_400_000);
    return c.json(calendar.list(from, to), 200);
  });
  api.openapi(createRoute({
    method: 'post', path: '/calendar/events', tags: ['Agenda'], summary: 'Marca um compromisso',
    request: { body: J(CalendarEventInput) },
    responses: { 201: { ...J(CalendarEvent), description: 'Evento' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(calendar.create(c.req.valid('json')), 201));
  api.openapi(createRoute({
    method: 'patch', path: '/calendar/events/{id}', tags: ['Agenda'], summary: 'Muda ou move um compromisso',
    request: { params: IdParam, body: J(CalendarEventPatch) },
    responses: { ...ok(CalendarEvent, 'Evento'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(calendar.update(c.req.valid('param').id, c.req.valid('json')), 200));
  api.openapi(createRoute({
    method: 'delete', path: '/calendar/events/{id}', tags: ['Agenda'], summary: 'Cancela um compromisso (todas as repetições)',
    request: { params: IdParam },
    responses: { ...ok(Deleted, 'Cancelado'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { calendar.delete(c.req.valid('param').id); return c.json({ deleted: true }, 200); });

  /* ---------- lembretes e alarmes ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/reminders', tags: ['Lembretes'], summary: 'Lembretes e alarmes',
    request: { query: z.object({ status: z.enum(['active', 'done', 'cancelled']).optional() }) },
    responses: { ...ok(z.array(Reminder), 'Lembretes'), 401: ERRORS[401] },
  }), (c) => c.json(reminders.list(c.req.valid('query').status), 200));
  api.openapi(createRoute({
    method: 'post', path: '/reminders', tags: ['Lembretes'], summary: 'Cria um lembrete ou alarme, único (at) ou recorrente (cron)',
    request: { body: J(ReminderInput) },
    responses: { 201: { ...J(Reminder), description: 'Lembrete' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(reminders.create(c.req.valid('json')), 201));
  api.openapi(createRoute({
    method: 'patch', path: '/reminders/{id}', tags: ['Lembretes'], summary: 'Muda texto, horário, recorrência, prioridade ou cancela',
    request: { params: IdParam, body: J(ReminderPatch) },
    responses: { ...ok(Reminder, 'Lembrete'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(reminders.update(c.req.valid('param').id, c.req.valid('json')), 200));
  api.openapi(createRoute({
    method: 'delete', path: '/reminders/{id}', tags: ['Lembretes'], summary: 'Apaga um lembrete',
    request: { params: IdParam },
    responses: { ...ok(Deleted, 'Apagado'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { reminders.delete(c.req.valid('param').id); return c.json({ deleted: true }, 200); });
  api.openapi(createRoute({
    method: 'post', path: '/reminders/{id}/snooze', tags: ['Lembretes'], summary: 'Soneca: adia por alguns minutos',
    request: { params: IdParam, body: J(SnoozeInput) },
    responses: { ...ok(Reminder, 'Lembrete'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(reminders.snooze(c.req.valid('param').id, c.req.valid('json').minutes), 200));
  api.openapi(createRoute({
    method: 'post', path: '/reminders/{id}/dismiss', tags: ['Lembretes'], summary: 'Dispensa um alarme tocando',
    request: { params: IdParam },
    responses: { ...ok(Reminder, 'Lembrete'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(reminders.dismiss(c.req.valid('param').id), 200));

  /* ---------- timers ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/timers', tags: ['Timers'], summary: 'Timers contando e os que terminaram há pouco',
    responses: { ...ok(z.array(Timer), 'Timers'), 401: ERRORS[401] },
  }), (c) => c.json(timers.list(), 200));
  api.openapi(createRoute({
    method: 'post', path: '/timers', tags: ['Timers'], summary: 'Começa um timer',
    request: { body: J(TimerInput) },
    responses: { 201: { ...J(Timer), description: 'Timer' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(timers.start(c.req.valid('json')), 201));
  api.openapi(createRoute({
    method: 'delete', path: '/timers/{id}', tags: ['Timers'], summary: 'Cancela um timer',
    request: { params: IdParam },
    responses: { ...ok(Timer, 'Timer'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(timers.cancel(c.req.valid('param').id), 200));

  /* ---------- listas ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/lists', tags: ['Listas'], summary: 'Todas as listas com os itens',
    responses: { ...ok(z.array(TodoList), 'Listas'), 401: ERRORS[401] },
  }), (c) => c.json(lists.all(), 200));
  api.openapi(createRoute({
    method: 'post', path: '/lists', tags: ['Listas'], summary: 'Cria uma lista',
    request: { body: J(ListInput) },
    responses: { 201: { ...J(TodoList), description: 'Lista' }, 400: ERRORS[400], 401: ERRORS[401], 409: ERRORS[409] },
  }), (c) => c.json(lists.create(c.req.valid('json').name), 201));
  api.openapi(createRoute({
    method: 'patch', path: '/lists/{id}', tags: ['Listas'], summary: 'Renomeia uma lista',
    request: { params: IdParam, body: J(ListInput) },
    responses: { ...ok(TodoList, 'Lista'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  }), (c) => c.json(lists.rename(c.req.valid('param').id, c.req.valid('json').name), 200));
  api.openapi(createRoute({
    method: 'delete', path: '/lists/{id}', tags: ['Listas'], summary: 'Apaga uma lista',
    request: { params: IdParam },
    responses: { ...ok(Deleted, 'Apagada'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { lists.delete(c.req.valid('param').id); return c.json({ deleted: true }, 200); });
  api.openapi(createRoute({
    method: 'post', path: '/lists/{id}/items', tags: ['Listas'], summary: 'Adiciona um item',
    request: { params: IdParam, body: J(ItemInput) },
    responses: { ...ok(TodoList, 'Lista'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(lists.addItems(c.req.valid('param').id, [c.req.valid('json').text]), 200));
  api.openapi(createRoute({
    method: 'patch', path: '/lists/{id}/items/{itemId}', tags: ['Listas'], summary: 'Marca, desmarca ou edita um item',
    request: { params: ItemParams, body: J(ItemPatch) },
    responses: { ...ok(TodoList, 'Lista'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { const p = c.req.valid('param'); return c.json(lists.updateItem(p.id, p.itemId, c.req.valid('json')), 200); });
  api.openapi(createRoute({
    method: 'delete', path: '/lists/{id}/items/{itemId}', tags: ['Listas'], summary: 'Tira um item',
    request: { params: ItemParams },
    responses: { ...ok(TodoList, 'Lista'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { const p = c.req.valid('param'); return c.json(lists.removeItem(p.id, p.itemId), 200); });
  api.openapi(createRoute({
    method: 'post', path: '/lists/{id}/clear-done', tags: ['Listas'], summary: 'Tira os itens já marcados',
    request: { params: IdParam },
    responses: { ...ok(TodoList, 'Lista'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(lists.clearDone(c.req.valid('param').id), 200));

  /* ---------- notas ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/notes', tags: ['Notas'], summary: 'Notas, com busca opcional',
    request: { query: z.object({ q: z.string().optional() }) },
    responses: { ...ok(z.array(Note), 'Notas'), 401: ERRORS[401] },
  }), (c) => c.json(notes.list(c.req.valid('query').q), 200));
  api.openapi(createRoute({
    method: 'post', path: '/notes', tags: ['Notas'], summary: 'Cria uma nota',
    request: { body: J(NoteInput) },
    responses: { 201: { ...J(Note), description: 'Nota' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => { const b = c.req.valid('json'); return c.json(notes.create(b.title, b.content), 201); });
  api.openapi(createRoute({
    method: 'patch', path: '/notes/{id}', tags: ['Notas'], summary: 'Edita uma nota',
    request: { params: IdParam, body: J(NotePatch) },
    responses: { ...ok(Note, 'Nota'), 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(notes.update(c.req.valid('param').id, c.req.valid('json')), 200));
  api.openapi(createRoute({
    method: 'delete', path: '/notes/{id}', tags: ['Notas'], summary: 'Apaga uma nota',
    request: { params: IdParam },
    responses: { ...ok(Deleted, 'Apagada'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { notes.delete(c.req.valid('param').id); return c.json({ deleted: true }, 200); });

  /* ---------- notificações e push ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/notifications', tags: ['Notificações'], summary: 'Notificações recentes e quantas não foram lidas',
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) },
    responses: { ...ok(z.object({ items: z.array(ShackNotification), unread: z.number() }), 'Notificações'), 401: ERRORS[401] },
  }), (c) => c.json({ items: notifier.list(c.req.valid('query').limit), unread: notifier.unread() }, 200));
  api.openapi(createRoute({
    method: 'post', path: '/notifications/{id}/read', tags: ['Notificações'], summary: 'Marca como lida',
    request: { params: IdParam },
    responses: { ...ok(ShackNotification, 'Notificação'), 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(notifier.markRead(c.req.valid('param').id), 200));
  api.openapi(createRoute({
    method: 'post', path: '/notifications/read-all', tags: ['Notificações'], summary: 'Marca todas como lidas',
    responses: { ...ok(z.object({ marked: z.number() }), 'Quantas foram marcadas'), 401: ERRORS[401] },
  }), (c) => c.json({ marked: notifier.markAllRead() }, 200));
  api.openapi(createRoute({
    method: 'post', path: '/notifications/test', tags: ['Notificações'], summary: 'Manda uma notificação de teste',
    responses: { ...ok(ShackNotification, 'Notificação'), 401: ERRORS[401] },
  }), (c) => c.json(notifier.notify({ title: 'Teste da Shack', body: 'Se você está vendo isto, as notificações funcionam.', priority: 'high', kind: 'test' }), 200));
  api.openapi(createRoute({
    method: 'get', path: '/push/vapid-key', tags: ['Notificações'], summary: 'Chave pública para assinar o push do navegador',
    responses: { ...ok(z.object({ publicKey: z.string(), subscriptions: z.number() }), 'Chave'), 401: ERRORS[401] },
  }), (c) => c.json({ publicKey: push.publicKey, subscriptions: push.count() }, 200));
  api.openapi(createRoute({
    method: 'post', path: '/push/subscriptions', tags: ['Notificações'], summary: 'Registra o push deste navegador',
    request: { body: J(PushSubscriptionInput) },
    responses: { ...ok(z.object({ subscribed: z.boolean() }), 'Registrado'), 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => { push.subscribe(c.get('device').id, c.req.valid('json')); return c.json({ subscribed: true }, 200); });
  api.openapi(createRoute({
    method: 'delete', path: '/push/subscriptions', tags: ['Notificações'], summary: 'Cancela o push deste navegador',
    request: { body: J(z.object({ endpoint: z.string() })) },
    responses: { ...ok(Deleted, 'Cancelado'), 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json({ deleted: push.unsubscribe(c.req.valid('json').endpoint) }, 200));
}
