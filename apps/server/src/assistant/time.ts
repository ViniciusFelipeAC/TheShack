import { badRequest } from '../errors.ts';

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Diferença (ms) entre o horário local de `tz` e UTC no instante `utcMs`. São Paulo hoje: -3h. */
export function tzOffsetMs(tz: string, utcMs: number): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    offsetFormatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/;

/**
 * Lê um horário ISO 8601. Com fuso ("Z" ou "-03:00"), vale como está.
 * Sem fuso ("2026-10-22T08:00" ou só a data), vale no fuso da casa.
 */
export function parseWhen(text: string, tz: string): Date {
  const t = text.trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) throw badRequest(`Data inválida: "${text}".`);
    return d;
  }
  const m = t.match(LOCAL);
  if (!m) throw badRequest(`Data inválida: "${text}". Use, por exemplo, 2026-10-22T08:00.`);
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let utc = wall - tzOffsetMs(tz, wall);
  const second = tzOffsetMs(tz, utc);
  if (wall - second !== utc) utc = wall - second; // ajuste em troca de horário de verão
  return new Date(utc);
}

/** "qui., 22/10, 08:00" no fuso da casa. */
export function fmtWhen(when: string | Date, tz: string, withWeekday = true): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, ...(withWeekday ? { weekday: 'short' } : {}), day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(typeof when === 'string' ? new Date(when) : when);
}
