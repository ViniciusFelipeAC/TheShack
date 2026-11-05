import { randomUUID } from 'node:crypto';
import type { CalendarEvent, CalendarEventInput, CalendarEventPatch, CalendarOccurrence } from '@shack/shared';
import rrulePkg from 'rrule';
import { type Db, now } from '../db/database.ts';
import { badRequest, notFound } from '../errors.ts';
import { parseWhen, tzOffsetMs } from './time.ts';

const { rrulestr } = rrulePkg as unknown as typeof import('rrule');
type Row = Record<string, unknown>;

/** Qualquer agenda: a local agora, o Google Calendar depois, sem mudar a API nem as ferramentas do Renfield. */
export interface CalendarProvider {
  list(from: Date, to: Date): CalendarOccurrence[];
  get(id: string): CalendarEvent;
  create(input: CalendarEventInput): CalendarEvent;
  update(id: string, patch: CalendarEventPatch): CalendarEvent;
  delete(id: string): void;
}

/** Agenda guardada no SQLite. */
export class LocalCalendar implements CalendarProvider {
  #db: Db;
  #tz: string;
  #changed: () => void;

  constructor(db: Db, tz: string, onChange: () => void) {
    this.#db = db;
    this.#tz = tz;
    this.#changed = onChange;
  }

  list(from: Date, to: Date): CalendarOccurrence[] {
    const f = from.toISOString(), t = to.toISOString();
    const single = this.#db.prepare(`SELECT * FROM calendar_events WHERE rrule IS NULL AND start_at < ? AND COALESCE(end_at, start_at) >= ? ORDER BY start_at`).all(t, f)
      .map((r) => this.#map(r)).map((e) => ({ ...e, occurrenceStart: e.start, occurrenceEnd: e.end }));
    const recurring = this.#db.prepare('SELECT * FROM calendar_events WHERE rrule IS NOT NULL AND start_at < ?').all(t).map((r) => this.#map(r));
    const occurrences = recurring.flatMap((e) => this.#expand(e, from, to));
    return [...single, ...occurrences].sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));
  }

  get(id: string): CalendarEvent {
    const r = this.#db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    if (!r) throw notFound('Evento');
    return this.#map(r);
  }

  create(input: CalendarEventInput): CalendarEvent {
    const start = parseWhen(input.start, this.#tz);
    const end = input.end ? parseWhen(input.end, this.#tz) : null;
    if (end && end < start) throw badRequest('O fim do evento vem antes do começo.');
    const rrule = input.rrule ? this.#validRule(input.rrule, start) : null;
    const id = randomUUID(), at = now();
    this.#db.prepare(`INSERT INTO calendar_events (id, title, start_at, end_at, all_day, location, notes, rrule, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)`).run(id, input.title, start.toISOString(), end?.toISOString() ?? null,
      input.allDay ? 1 : 0, input.location ?? null, input.notes ?? null, rrule, at, at);
    this.#changed();
    return this.get(id);
  }

  update(id: string, patch: CalendarEventPatch): CalendarEvent {
    const cur = this.get(id);
    const start = patch.start ? parseWhen(patch.start, this.#tz).toISOString() : cur.start;
    const end = patch.end === null ? null : patch.end ? parseWhen(patch.end, this.#tz).toISOString() : cur.end;
    if (end && end < start) throw badRequest('O fim do evento vem antes do começo.');
    const rrule = patch.rrule === null ? null : patch.rrule ? this.#validRule(patch.rrule, new Date(start)) : cur.rrule;
    this.#db.prepare(`UPDATE calendar_events SET title = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, notes = ?, rrule = ?, updated_at = ? WHERE id = ?`)
      .run(patch.title ?? cur.title, start, end, (patch.allDay ?? cur.allDay) ? 1 : 0, patch.location ?? cur.location,
        patch.notes ?? cur.notes, rrule, now(), id);
    this.#changed();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.#db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
    this.#changed();
  }

  /** Expande a regra no horário local (relógio de parede), para o dia da semana não escorregar ao converter para UTC. */
  #expand(e: CalendarEvent, from: Date, to: Date): CalendarOccurrence[] {
    const startMs = Date.parse(e.start);
    const duration = e.end ? Date.parse(e.end) - startMs : null;
    const shift = (ms: number) => ms + tzOffsetMs(this.#tz, ms);
    const rule = rrulestr(`RRULE:${e.rrule}`, { dtstart: new Date(shift(startMs)) });
    const span = duration ?? 0;
    const wallDates = rule.between(new Date(shift(from.getTime() - span)), new Date(shift(to.getTime())), true);
    return wallDates.slice(0, 500).map((wall) => {
      const utc = wall.getTime() - tzOffsetMs(this.#tz, wall.getTime() - tzOffsetMs(this.#tz, wall.getTime()));
      return { ...e, occurrenceStart: new Date(utc).toISOString(), occurrenceEnd: duration === null ? null : new Date(utc + duration).toISOString() };
    }).filter((o) => o.occurrenceStart < to.toISOString() && (o.occurrenceEnd ?? o.occurrenceStart) >= from.toISOString());
  }

  #validRule(raw: string, start: Date): string {
    const rule = raw.replace(/^RRULE:/i, '').trim().toUpperCase();
    try { rrulestr(`RRULE:${rule}`, { dtstart: start }).all((_, i) => i < 1); } catch {
      throw badRequest(`Recorrência inválida: "${raw}". Exemplo: FREQ=WEEKLY;BYDAY=MO.`);
    }
    return rule;
  }

  #map(r: Row): CalendarEvent {
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
    return {
      id: String(r.id), title: String(r.title), start: String(r.start_at), end: str(r.end_at), allDay: Number(r.all_day) === 1,
      location: str(r.location), notes: str(r.notes), rrule: str(r.rrule), source: String(r.source),
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    };
  }
}
