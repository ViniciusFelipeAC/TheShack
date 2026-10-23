import { randomUUID } from 'node:crypto';
import type { Reminder, ReminderInput, ReminderPatch } from '@shack/shared';
import { Cron } from 'croner';
import type { EventBus } from '../core/events.ts';
import type { Db } from '../db/database.ts';
import { badRequest, notFound } from '../errors.ts';
import type { Notifier } from '../notifications/notifier.ts';
import { fmtWhen, parseWhen } from './time.ts';

const RING_EVERY_MS = 2 * 60_000;
const MAX_RINGS = 10;
const LATE_GRACE_MS = 6 * 3_600_000;
type Row = Record<string, unknown>;
type Cause = 'schedule' | 'snooze' | 'ring';

/** Lembretes e alarmes, únicos ou recorrentes. Quem dispara é o agendador do servidor, não o navegador. */
export class Reminders {
  #db: Db;
  #bus: EventBus;
  #notifier: Notifier;
  #tz: string;
  #clock: () => Date;

  constructor(o: { db: Db; bus: EventBus; notifier: Notifier; timezone: string; clock?: () => Date }) {
    this.#db = o.db;
    this.#bus = o.bus;
    this.#notifier = o.notifier;
    this.#tz = o.timezone;
    this.#clock = o.clock ?? (() => new Date());
  }

  list(status?: Reminder['status']): Reminder[] {
    const rows = status
      ? this.#db.prepare('SELECT * FROM reminders WHERE status = ? ORDER BY COALESCE(next_fire_at, snoozed_until, last_fired_at)').all(status)
      : this.#db.prepare(`SELECT * FROM reminders ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, COALESCE(next_fire_at, snoozed_until, last_fired_at) LIMIT 200`).all();
    return rows.map((r) => this.#map(r));
  }

  get(id: string): Reminder {
    const r = this.#db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!r) throw notFound('Lembrete');
    return this.#map(r);
  }

  create(input: ReminderInput): Reminder {
    const now = this.#clock();
    const priority = input.priority ?? (input.kind === 'alarm' ? 'high' : 'normal');
    const { at, cron, next } = this.#schedule(input.at, input.cron, now);
    const id = randomUUID(), stamp = now.toISOString();
    this.#db.prepare(`INSERT INTO reminders (id, text, kind, priority, at, cron, timezone, status, next_fire_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(id, input.text, input.kind, priority, at, cron, this.#tz, next, stamp, stamp);
    this.#changed();
    return this.get(id);
  }

  update(id: string, patch: ReminderPatch): Reminder {
    const cur = this.get(id);
    const now = this.#clock();
    let { at, cron, nextFireAt: next } = cur;
    if (patch.at || patch.cron) ({ at, cron, next } = this.#schedule(patch.at, patch.cron, now));
    const status = patch.status ?? (patch.at || patch.cron ? 'active' : cur.status);
    if (status === 'cancelled') next = null;
    this.#db.prepare(`UPDATE reminders SET text = ?, priority = ?, at = ?, cron = ?, status = ?, next_fire_at = ?, snoozed_until = NULL,
      ringing = CASE WHEN ? = 'cancelled' THEN 0 ELSE ringing END, updated_at = ? WHERE id = ?`)
      .run(patch.text ?? cur.text, patch.priority ?? cur.priority, at, cron, status, next, status, now.toISOString(), id);
    this.#changed();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.#db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    this.#changed();
  }

  snooze(id: string, minutes: number): Reminder {
    this.get(id);
    const now = this.#clock();
    const until = new Date(now.getTime() + minutes * 60_000).toISOString();
    this.#db.prepare(`UPDATE reminders SET snoozed_until = ?, ringing = 0, ring_count = 0, status = 'active', updated_at = ? WHERE id = ?`)
      .run(until, now.toISOString(), id);
    this.#changed();
    return this.get(id);
  }

  dismiss(id: string): Reminder {
    const r = this.get(id);
    this.#db.prepare(`UPDATE reminders SET ringing = 0, ring_count = 0, snoozed_until = NULL, status = ?, updated_at = ? WHERE id = ?`)
      .run(r.cron ? r.status : 'done', this.#clock().toISOString(), id);
    this.#changed();
    return this.get(id);
  }

  /** Dispara o que venceu. O agendador chama a cada segundo. */
  processDue(at: Date): void {
    const t = at.toISOString();
    const ringBefore = new Date(at.getTime() - RING_EVERY_MS).toISOString();
    const rows = this.#db.prepare(`SELECT * FROM reminders WHERE status = 'active' AND (
        (snoozed_until IS NOT NULL AND snoozed_until <= ?)
        OR (snoozed_until IS NULL AND next_fire_at IS NOT NULL AND next_fire_at <= ?)
        OR (ringing = 1 AND last_fired_at <= ? AND ring_count < ?))`).all(t, t, ringBefore, MAX_RINGS);
    for (const r of rows) {
      const cause: Cause = r.snoozed_until && String(r.snoozed_until) <= t ? 'snooze' : r.next_fire_at && String(r.next_fire_at) <= t ? 'schedule' : 'ring';
      this.#fire(r, at, cause, false);
    }
  }

  /** No boot: dispara com atraso o que venceu há pouco, e pula o que é antigo demais. */
  recover(at: Date): void {
    const t = at.toISOString();
    const graceStart = new Date(at.getTime() - LATE_GRACE_MS).toISOString();
    const overdue = this.#db.prepare(`SELECT * FROM reminders WHERE status = 'active' AND snoozed_until IS NULL AND next_fire_at IS NOT NULL AND next_fire_at <= ?`).all(t);
    for (const r of overdue) {
      if (r.cron) {
        this.#db.prepare('UPDATE reminders SET next_fire_at = ? WHERE id = ?').run(this.#nextCron(String(r.cron), at), String(r.id));
      } else if (String(r.next_fire_at) >= graceStart) {
        this.#fire(r, at, 'schedule', true);
      } else {
        this.#db.prepare(`UPDATE reminders SET status = 'done', next_fire_at = NULL WHERE id = ?`).run(String(r.id));
        this.#notifier.notify({ title: 'Lembrete perdido', body: `${r.text} (era para ${fmtWhen(String(r.next_fire_at), this.#tz)}, com a Shack desligada)`, priority: 'normal', kind: 'reminder', refId: String(r.id) });
      }
    }
    if (overdue.length) this.#changed();
  }

  #fire(r: Row, at: Date, cause: Cause, late: boolean): void {
    const id = String(r.id);
    const isAlarm = r.kind === 'alarm';
    const ringCount = cause === 'ring' ? Number(r.ring_count) + 1 : 1;
    const text = `${r.text}${late ? ' (atrasado: a Shack estava desligada)' : ''}`;
    this.#notifier.notify({
      title: isAlarm ? (cause === 'ring' ? 'Alarme tocando' : 'Alarme') : 'Lembrete',
      body: text, priority: r.priority as Reminder['priority'], kind: isAlarm ? 'alarm' : 'reminder', refId: id,
    });

    let next = r.next_fire_at === null ? null : String(r.next_fire_at);
    if (cause === 'schedule') next = r.cron ? this.#nextCron(String(r.cron), at) : null;
    const stillRinging = isAlarm && ringCount < MAX_RINGS;
    const status = r.cron || stillRinging ? 'active' : 'done';
    this.#db.prepare(`UPDATE reminders SET last_fired_at = ?, snoozed_until = NULL, next_fire_at = ?, ringing = ?, ring_count = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(at.toISOString(), next, stillRinging ? 1 : 0, stillRinging ? ringCount : 0, status, at.toISOString(), id);
    this.#bus.publish('reminder.fired', { id, text: String(r.text), kind: r.kind, cause, late });
    this.#changed();
  }

  #schedule(atText: string | undefined, cronText: string | undefined, now: Date) {
    if (atText) {
      const d = parseWhen(atText, this.#tz);
      if (d.getTime() <= now.getTime()) throw badRequest(`Esse horário já passou (${fmtWhen(d, this.#tz)}).`);
      return { at: d.toISOString(), cron: null, next: d.toISOString() };
    }
    if (!cronText) throw badRequest('Informe "at" ou "cron".');
    const cron = cronText.trim().replace(/\s+/g, ' ');
    if (cron.split(' ').length !== 5) throw badRequest('Use cron de 5 campos: minuto hora dia mês dia-da-semana. Ex.: "0 8 * * 1-5".');
    let next: string | null;
    try { next = this.#nextCron(cron, now); } catch { throw badRequest(`Recorrência inválida: "${cronText}".`); }
    if (!next) throw badRequest('Essa recorrência nunca acontece.');
    return { at: null, cron, next };
  }

  #nextCron(cron: string, from: Date): string | null {
    return new Cron(cron, { timezone: this.#tz, paused: true }).nextRun(from)?.toISOString() ?? null;
  }

  #changed(): void {
    this.#bus.publish('data.changed', { entity: 'reminders' });
  }

  #map(r: Row): Reminder {
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
    return {
      id: String(r.id), text: String(r.text), kind: r.kind as Reminder['kind'], priority: r.priority as Reminder['priority'],
      at: str(r.at), cron: str(r.cron), timezone: String(r.timezone), status: r.status as Reminder['status'],
      nextFireAt: str(r.next_fire_at), snoozedUntil: str(r.snoozed_until), ringing: Number(r.ringing) === 1,
      lastFiredAt: str(r.last_fired_at), createdAt: String(r.created_at),
    };
  }
}
