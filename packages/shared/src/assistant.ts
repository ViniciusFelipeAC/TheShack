import { z } from 'zod';

const iso = z.string();
const Priority = z.enum(['low', 'normal', 'high']);

/* ---------- agenda ---------- */
export const CalendarEvent = z.object({
  id: z.string(),
  title: z.string(),
  start: iso,
  end: iso.nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  /** Recorrência no formato do Google Calendar, por exemplo "FREQ=WEEKLY;BYDAY=MO". */
  rrule: z.string().nullable(),
  source: z.string(),
  createdAt: iso,
  updatedAt: iso,
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

/** Uma ocorrência dentro de um intervalo. Para eventos recorrentes, cada repetição vira uma ocorrência. */
export const CalendarOccurrence = CalendarEvent.extend({ occurrenceStart: iso, occurrenceEnd: iso.nullable() });
export type CalendarOccurrence = z.infer<typeof CalendarOccurrence>;

export const CalendarEventInput = z.object({
  title: z.string().trim().min(1).max(200),
  start: z.string().min(10).describe('ISO 8601. Sem fuso, vale o fuso da casa.'),
  end: z.string().min(10).optional(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  rrule: z.string().trim().max(300).optional(),
});
export type CalendarEventInput = z.infer<typeof CalendarEventInput>;
export const CalendarEventPatch = CalendarEventInput.partial().extend({
  end: z.string().min(10).nullable().optional(),
  rrule: z.string().trim().max(300).nullable().optional(),
});
export type CalendarEventPatch = z.infer<typeof CalendarEventPatch>;

/* ---------- lembretes e alarmes ---------- */
export const Reminder = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(['reminder', 'alarm']),
  priority: Priority,
  /** Horário único. */
  at: iso.nullable(),
  /** Recorrência em cron de 5 campos, no fuso `timezone`. Ex.: "0 8 * * 1-5" = dias úteis às 8h. */
  cron: z.string().nullable(),
  timezone: z.string(),
  status: z.enum(['active', 'done', 'cancelled']),
  nextFireAt: iso.nullable(),
  snoozedUntil: iso.nullable(),
  /** Alarme tocando, esperando você dispensar. */
  ringing: z.boolean(),
  lastFiredAt: iso.nullable(),
  createdAt: iso,
});
export type Reminder = z.infer<typeof Reminder>;

export const ReminderInput = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(['reminder', 'alarm']).default('reminder'),
  priority: Priority.optional(),
  at: z.string().min(10).optional(),
  cron: z.string().trim().min(9).max(100).optional(),
}).refine((r) => Boolean(r.at) !== Boolean(r.cron), { message: 'Informe "at" (horário único) ou "cron" (recorrente), não os dois.' });
export type ReminderInput = z.infer<typeof ReminderInput>;

export const ReminderPatch = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  priority: Priority.optional(),
  at: z.string().min(10).optional(),
  cron: z.string().trim().min(9).max(100).optional(),
  status: z.enum(['active', 'cancelled']).optional(),
});
export type ReminderPatch = z.infer<typeof ReminderPatch>;

export const SnoozeInput = z.object({ minutes: z.number().int().min(1).max(24 * 60).default(10) });

/* ---------- timers ---------- */
export const Timer = z.object({
  id: z.string(),
  label: z.string(),
  durationMs: z.number(),
  endsAt: iso,
  status: z.enum(['running', 'finished', 'cancelled']),
  createdAt: iso,
});
export type Timer = z.infer<typeof Timer>;
export const TimerInput = z.object({ seconds: z.number().int().min(1).max(24 * 3600), label: z.string().trim().max(100).default('Timer') });
export type TimerInput = z.infer<typeof TimerInput>;

/* ---------- listas e notas ---------- */
export const ListItem = z.object({ id: z.string(), text: z.string(), done: z.boolean(), createdAt: iso });
export type ListItem = z.infer<typeof ListItem>;
export const TodoList = z.object({ id: z.string(), name: z.string(), items: z.array(ListItem), createdAt: iso, updatedAt: iso });
export type TodoList = z.infer<typeof TodoList>;
export const ListInput = z.object({ name: z.string().trim().min(1).max(60) });
export const ItemInput = z.object({ text: z.string().trim().min(1).max(300) });
export const ItemPatch = z.object({ text: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional() });

export const Note = z.object({ id: z.string(), title: z.string(), content: z.string(), createdAt: iso, updatedAt: iso });
export type Note = z.infer<typeof Note>;
export const NoteInput = z.object({ title: z.string().trim().max(200).default(''), content: z.string().max(20_000) });
export const NotePatch = z.object({ title: z.string().trim().max(200).optional(), content: z.string().max(20_000).optional() });

/* ---------- notificações ---------- */
export const NotificationKind = z.enum(['reminder', 'alarm', 'timer', 'task', 'digest', 'renfield', 'test']);
export const ShackNotification = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  priority: Priority,
  kind: NotificationKind,
  refId: z.string().nullable(),
  /** Segurada pelo modo ativo: não tocou nem apareceu, e entra no resumo quando o modo acabar. */
  silenced: z.boolean(),
  readAt: iso.nullable(),
  createdAt: iso,
});
export type ShackNotification = z.infer<typeof ShackNotification>;

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

/** Tipo de dado que mudou, para as telas se atualizarem (evento `data.changed`). */
export const DataEntity = z.enum(['calendar', 'reminders', 'timers', 'lists', 'notes']);
export type DataEntity = z.infer<typeof DataEntity>;
