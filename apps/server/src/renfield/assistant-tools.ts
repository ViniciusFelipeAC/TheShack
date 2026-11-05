import type { CalendarOccurrence, Reminder, TodoList } from '@shack/shared';
import type { CalendarProvider } from '../assistant/calendar.ts';
import type { Lists, Notes } from '../assistant/organizer.ts';
import type { Reminders } from '../assistant/reminders.ts';
import { fmtWhen, parseWhen } from '../assistant/time.ts';
import type { Timers } from '../assistant/timers.ts';
import type { Notifier } from '../notifications/notifier.ts';
import { bool, id, num, priority, text, textList, when as whenArg } from './lenient.ts';
import { listOut, type RenfieldTool } from './tools.ts';

const out = (v: unknown) => JSON.stringify(v);
const WHEN = 'ISO 8601, por exemplo 2026-10-22T08:00 (sem fuso vale o fuso da casa)';

/** As duas listas do Quadro. Pelo id, que não muda quando o nome muda. */
export const BOARD_LISTS = { shopping: 'mercado', todo: 'afazeres' } as const;
const ALIASES: Array<[RegExp, string]> = [
  [/^(a )?(lista (de |do )?)?(compras?|supermercado|mercado|feira)$/i, BOARD_LISTS.shopping],
  [/^(a )?(lista (de |do )?)?(to[ -]?dos?|afazeres|pend[eê]ncias|coisas a fazer|o que fazer)$/i, BOARD_LISTS.todo],
];

/** "lista de compras" é a Mercado e "to-do" é a Afazeres, as duas do Quadro, mesmo que tenham outro nome. */
export function listAlias(ref: string, lists: Pick<Lists, 'find'>): TodoList | null {
  const target = ALIASES.find(([re]) => re.test(ref.trim()))?.[1];
  return target ? lists.find(target) : null;
}

export type AssistantDeps = {
  calendar: CalendarProvider; reminders: Reminders; timers: Timers; lists: Lists; notes: Notes; notifier: Notifier; timezone: string;
};

export function assistantTools(d: AssistantDeps): RenfieldTool[] {
  const tz = d.timezone;
  const when = (iso: string | null) => (iso ? fmtWhen(iso, tz) : null);
  const occ = (e: CalendarOccurrence) => ({ id: e.id, title: e.title, start: when(e.occurrenceStart), end: when(e.occurrenceEnd), allDay: e.allDay, location: e.location, recurring: Boolean(e.rrule) });
  const rem = (r: Reminder) => ({ id: r.id, text: r.text, kind: r.kind, next: when(r.snoozedUntil ?? r.nextFireAt), recurring: r.cron, ringing: r.ringing, status: r.status });
  const list = (l: TodoList) => ({ id: l.id, name: l.name, items: l.items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`) });
  const findList = (ref: string, create = false): TodoList => {
    const l = d.lists.find(ref) ?? listAlias(ref, d.lists);
    if (l) return l;
    if (create) return d.lists.create(ref);
    throw new Error(`Não existe lista "${ref}". Listas: ${d.lists.all().map((x) => x.name).join(', ')}.`);
  };

  return [
    /* ---------- agenda ---------- */
    {
      name: 'calendar_list', group: 'calendar', reads: true,
      description: 'Compromissos num intervalo. Sem datas, mostra os próximos 7 dias.',
      shape: { from: whenArg().optional().describe(WHEN), to: whenArg().optional().describe(WHEN) },
      run: (a) => {
        const from = a.from ? parseWhen(String(a.from), tz) : new Date();
        const to = a.to ? parseWhen(String(a.to), tz) : new Date(from.getTime() + 7 * 86_400_000);
        return listOut(d.calendar.list(from, to).map(occ), 'nenhum compromisso nesse intervalo');
      },
    },
    {
      name: 'calendar_create', group: 'calendar',
      description: 'Marca um compromisso. Para repetir, use rrule no formato do Google Calendar, por exemplo FREQ=WEEKLY;BYDAY=MO.',
      shape: {
        title: text(200, 1), start: whenArg().describe(WHEN), end: whenArg().optional().describe(WHEN),
        all_day: bool().optional(), location: text(200).optional(), notes: text(2000).optional(), rrule: text(300).optional(),
      },
      run: (a) => {
        const e = d.calendar.create({
          title: String(a.title), start: String(a.start), end: a.end as string | undefined, allDay: Boolean(a.all_day),
          location: a.location as string | undefined, notes: a.notes as string | undefined, rrule: a.rrule as string | undefined,
        });
        return out({ created: { id: e.id, title: e.title, start: when(e.start), end: when(e.end), rrule: e.rrule } });
      },
    },
    {
      name: 'calendar_update', group: 'calendar',
      description: 'Muda um compromisso (título, horário, local ou notas).',
      shape: { id: id(), title: text(200).optional(), start: whenArg().optional().describe(WHEN), end: whenArg().optional().describe(WHEN), location: text(200).optional(), notes: text(2000).optional() },
      run: (a) => {
        const patch: Record<string, unknown> = {};
        for (const k of ['title', 'start', 'end', 'location', 'notes'] as const) if (a[k] !== undefined) patch[k] = a[k];
        const e = d.calendar.update(String(a.id), patch);
        return out({ updated: { id: e.id, title: e.title, start: when(e.start), end: when(e.end) } });
      },
    },
    {
      name: 'calendar_delete', group: 'calendar',
      description: 'Cancela um compromisso. Ação destrutiva: o dono da casa confirma antes.',
      shape: { id: id() },
      run: (a) => { d.calendar.delete(String(a.id)); return out({ deleted: a.id }); },
    },

    /* ---------- lembretes e alarmes ---------- */
    {
      name: 'reminders_list', group: 'reminders', reads: true,
      description: 'Lembretes e alarmes ativos, com o próximo horário.',
      shape: {},
      run: () => listOut(d.reminders.list('active').map(rem), 'nenhum lembrete ou alarme ativo'),
    },
    {
      name: 'reminders_create', group: 'reminders',
      description: 'Cria um lembrete ou alarme. Use "at" para horário único ou "cron" para repetir. '
        + 'Cron tem 5 campos (minuto hora dia mês dia-da-semana) no fuso da casa. Ex.: dias úteis às 8h = "0 8 * * 1-5"; todo dia às 21h = "0 21 * * *". '
        + 'Alarme toca de novo a cada 2 minutos até ser dispensado.',
      shape: {
        text: text(500, 1), at: whenArg().optional().describe(WHEN), cron: text(100).optional(),
        alarm: bool().optional(), priority: priority().optional(),
      },
      run: (a) => {
        const r = d.reminders.create({
          text: String(a.text), kind: a.alarm ? 'alarm' : 'reminder', priority: a.priority as Reminder['priority'] | undefined,
          at: a.at as string | undefined, cron: a.cron as string | undefined,
        });
        return out({ created: rem(r) });
      },
    },
    {
      name: 'reminders_update', group: 'reminders',
      description: 'Muda o texto, o horário (at), a recorrência (cron) ou a prioridade de um lembrete.',
      shape: { id: id(), text: text(500).optional(), at: whenArg().optional().describe(WHEN), cron: text(100).optional(), priority: priority().optional() },
      run: (a) => {
        const patch: Record<string, unknown> = {};
        for (const k of ['text', 'at', 'cron', 'priority'] as const) if (a[k] !== undefined) patch[k] = a[k];
        return out({ updated: rem(d.reminders.update(String(a.id), patch)) });
      },
    },
    {
      name: 'reminders_delete', group: 'reminders',
      description: 'Apaga um lembrete ou alarme. Ação destrutiva: o dono da casa confirma antes.',
      shape: { id: id() },
      run: (a) => { d.reminders.delete(String(a.id)); return out({ deleted: a.id }); },
    },
    {
      name: 'reminders_snooze', group: 'reminders',
      description: 'Adia um lembrete ou alarme por alguns minutos (soneca).',
      shape: { id: id(), minutes: num({ min: 1, max: 1440, int: true }).optional() },
      run: (a) => out({ snoozed: rem(d.reminders.snooze(String(a.id), (a.minutes as number) ?? 10)) }),
    },
    {
      name: 'reminders_dismiss', group: 'reminders',
      description: 'Dispensa um alarme que está tocando.',
      shape: { id: id() },
      run: (a) => out({ dismissed: rem(d.reminders.dismiss(String(a.id))) }),
    },

    /* ---------- timers ---------- */
    {
      name: 'timers_start', group: 'timers',
      description: 'Começa um timer. Informe minutos e/ou segundos.',
      shape: { minutes: num({ min: 0, max: 1440 }).optional(), seconds: num({ min: 0, max: 86_400, int: true }).optional(), label: text(100).optional() },
      run: (a) => {
        const seconds = Math.round(((a.minutes as number) ?? 0) * 60 + ((a.seconds as number) ?? 0));
        if (seconds < 1) return 'Erro: informe a duração.';
        const t = d.timers.start({ seconds, label: (a.label as string) || 'Timer' });
        return out({ started: { id: t.id, label: t.label, endsAt: when(t.endsAt) } });
      },
    },
    {
      name: 'timers_list', group: 'timers', reads: true,
      description: 'Timers contando e os que terminaram há pouco.',
      shape: {},
      run: () => listOut(d.timers.list().map((t) => ({ id: t.id, label: t.label, status: t.status, endsAt: when(t.endsAt), secondsLeft: Math.max(0, Math.round((Date.parse(t.endsAt) - Date.now()) / 1000)) })), 'nenhum timer contando ou terminado há pouco'),
    },
    {
      name: 'timers_cancel', group: 'timers',
      description: 'Cancela um timer.',
      shape: { id: id() },
      run: (a) => out({ cancelled: d.timers.cancel(String(a.id)).id }),
    },

    /* ---------- listas ---------- */
    {
      name: 'lists_all', group: 'lists', reads: true,
      description: 'Todas as listas com os itens ([x] = marcado).',
      shape: {},
      run: () => listOut(d.lists.all().map(list), 'nenhuma lista criada'),
    },
    {
      name: 'lists_add', group: 'lists',
      description: 'Adiciona itens a uma lista (por nome). Compras vão para "Mercado" e afazeres (to-do) para "Afazeres": as duas aparecem no Quadro. Cria a lista se ela não existir.',
      shape: { list: text(60, 1), items: textList({ maxItems: 50, maxLength: 200 }) },
      run: (a) => { const l = findList(String(a.list), true); return out({ list: list(d.lists.addItems(l.id, a.items as string[])) }); },
    },
    {
      name: 'lists_check', group: 'lists',
      description: 'Marca (ou desmarca, com done=false) um item de uma lista.',
      shape: { list: text(60, 1), item: text(200, 1).describe('texto ou id do item'), done: bool().optional() },
      run: (a) => {
        const l = findList(String(a.list));
        const item = d.lists.findItem(l, String(a.item));
        if (!item) return `Erro: não achei "${a.item}" na lista ${l.name}.`;
        return out({ list: list(d.lists.updateItem(l.id, item.id, { done: a.done !== false })) });
      },
    },
    {
      name: 'lists_remove_item', group: 'lists',
      description: 'Tira um item de uma lista.',
      shape: { list: text(60, 1), item: text(200, 1) },
      run: (a) => {
        const l = findList(String(a.list));
        const item = d.lists.findItem(l, String(a.item));
        if (!item) return `Erro: não achei "${a.item}" na lista ${l.name}.`;
        return out({ list: list(d.lists.removeItem(l.id, item.id)) });
      },
    },
    {
      name: 'lists_clear_done', group: 'lists',
      description: 'Tira de uma lista os itens já marcados.',
      shape: { list: text(60, 1) },
      run: (a) => out({ list: list(d.lists.clearDone(findList(String(a.list)).id)) }),
    },
    {
      name: 'lists_create', group: 'lists',
      description: 'Cria uma lista nova.',
      shape: { name: text(60, 1) },
      run: (a) => out({ created: list(d.lists.create(String(a.name))) }),
    },
    {
      name: 'lists_delete', group: 'lists',
      description: 'Apaga uma lista inteira. Ação destrutiva: o dono da casa confirma antes.',
      shape: { list: text(60, 1) },
      run: (a) => { const l = findList(String(a.list)); d.lists.delete(l.id); return out({ deleted: l.name }); },
    },

    /* ---------- notas ---------- */
    {
      name: 'notes_list', group: 'notes', reads: true,
      description: 'Notas rápidas, com busca opcional por texto.',
      shape: { query: text(200).optional() },
      run: (a) => listOut(d.notes.list((a.query as string | undefined) || undefined).map((n) => ({ id: n.id, title: n.title, preview: n.content.slice(0, 200), updated: when(n.updatedAt) })), a.query ? 'nenhuma nota com esse texto' : 'nenhuma nota guardada'),
    },
    {
      name: 'notes_create', group: 'notes',
      description: 'Guarda uma nota rápida.',
      shape: { content: text(20_000, 1), title: text(200).optional() },
      run: (a) => { const n = d.notes.create((a.title as string) ?? '', String(a.content)); return out({ created: { id: n.id, title: n.title } }); },
    },
    {
      name: 'notes_update', group: 'notes',
      description: 'Muda o título ou o conteúdo de uma nota.',
      shape: { id: id(), title: text(200).optional(), content: text(20_000).optional() },
      run: (a) => {
        const patch: Record<string, string> = {};
        if (typeof a.title === 'string') patch.title = a.title;
        if (typeof a.content === 'string') patch.content = a.content;
        const n = d.notes.update(String(a.id), patch);
        return out({ updated: { id: n.id, title: n.title } });
      },
    },
    {
      name: 'notes_delete', group: 'notes',
      description: 'Apaga uma nota. Ação destrutiva: o dono da casa confirma antes.',
      shape: { id: id() },
      run: (a) => { d.notes.delete(String(a.id)); return out({ deleted: a.id }); },
    },

    /* ---------- avisos ---------- */
    {
      name: 'notify_user', group: 'notify',
      description: 'Manda uma notificação ao dono da casa (aparece no app e no navegador). O modo ativo pode segurar avisos de prioridade baixa.',
      shape: { title: text(120, 1), body: text(1000), priority: priority().optional() },
      run: (a) => out({ sent: d.notifier.notify({ title: String(a.title), body: String(a.body), priority: (a.priority as 'low' | 'normal' | 'high') ?? 'normal', kind: 'renfield' }).id }),
    },
  ];
}
