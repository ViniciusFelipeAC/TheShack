/* Contas do Quadro: grade do mês, compromissos por dia e as duas listas. Sem React, para testar no Node. */
import type { CalendarOccurrence, TodoList } from '@shack/shared';

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-05", no fuso deste aparelho (o mesmo da casa, na prática). */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-05" de volta para a meia-noite local daquele dia. */
export const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** Horário local sem fuso, como o servidor espera ("sem fuso vale o fuso da casa"). */
export const localIso = (d: Date): string => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Semanas do mês, de domingo a sábado, como no calendário de parede brasileiro. Só as semanas que têm
 * dias do mês: fevereiro pode caber em quatro linhas, outros meses pedem seis.
 */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + days) / 7);
  return Array.from({ length: rows }, (_, w) => Array.from({ length: 7 }, (_, d) => new Date(year, month, 1 - first.getDay() + w * 7 + d)));
}

/** Compromissos de cada dia. O que atravessa a meia-noite aparece em todos os dias que ocupa. */
export function eventsByDay(events: CalendarOccurrence[]): Map<string, CalendarOccurrence[]> {
  const out = new Map<string, CalendarOccurrence[]>();
  for (const ev of events) {
    const start = new Date(ev.occurrenceStart);
    let end = ev.occurrenceEnd ? new Date(ev.occurrenceEnd) : start;
    // Terminar à meia-noite em ponto não ocupa o dia seguinte.
    if (end > start && end.getHours() === 0 && end.getMinutes() === 0) end = new Date(end.getTime() - 1);
    if (end < start) end = start;
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 42 && day <= end; i++) {
      const key = dayKey(day);
      out.set(key, [...(out.get(key) ?? []), ev]);
      day.setDate(day.getDate() + 1);
    }
  }
  for (const list of out.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.occurrenceStart.localeCompare(b.occurrenceStart));
  return out;
}

/** As listas do Quadro: pelo id de fábrica, ou pelo nome se você recriou com outro id. */
export function boardLists(lists: TodoList[]): { shopping: TodoList | null; todo: TodoList | null } {
  const by = (id: string, name: RegExp) => lists.find((l) => l.id === id) ?? lists.find((l) => name.test(l.name)) ?? null;
  return { shopping: by('mercado', /mercado|compras|feira/i), todo: by('afazeres', /afazeres|to[ -]?do|pend[eê]ncias/i) };
}

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const DAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const HM = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthTitle = (year: number, month: number) => cap(MONTH.format(new Date(year, month, 1)));
export const dayTitle = (key: string) => cap(DAY.format(fromKey(key)));
export const hm = (iso: string) => HM.format(new Date(iso));
export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "09:00" ou "Dia todo"; o que começou em outro dia mostra "continua". */
export function whenText(ev: CalendarOccurrence, key: string): string {
  if (ev.allDay) return 'Dia todo';
  if (dayKey(new Date(ev.occurrenceStart)) !== key) return 'continua';
  return ev.occurrenceEnd && dayKey(new Date(ev.occurrenceEnd)) === key ? `${hm(ev.occurrenceStart)}–${hm(ev.occurrenceEnd)}` : hm(ev.occurrenceStart);
}
