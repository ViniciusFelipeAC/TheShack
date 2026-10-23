import { randomUUID } from 'node:crypto';
import type { Timer, TimerInput } from '@shack/shared';
import type { EventBus } from '../core/events.ts';
import type { Db } from '../db/database.ts';
import { notFound } from '../errors.ts';
import type { Notifier } from '../notifications/notifier.ts';
import type { Reminders } from './reminders.ts';

type Row = Record<string, unknown>;

/** Timers guardados no banco: continuam contando mesmo se o servidor reiniciar. */
export class Timers {
  #db: Db;
  #bus: EventBus;
  #notifier: Notifier;
  #clock: () => Date;

  constructor(o: { db: Db; bus: EventBus; notifier: Notifier; clock?: () => Date }) {
    this.#db = o.db;
    this.#bus = o.bus;
    this.#notifier = o.notifier;
    this.#clock = o.clock ?? (() => new Date());
  }

  /** Os que estão contando e os que terminaram nos últimos 15 minutos. */
  list(): Timer[] {
    const since = new Date(this.#clock().getTime() - 15 * 60_000).toISOString();
    return this.#db.prepare(`SELECT * FROM timers WHERE status = 'running' OR (status = 'finished' AND ends_at >= ?) ORDER BY ends_at`).all(since).map((r) => this.#map(r));
  }

  get(id: string): Timer {
    const r = this.#db.prepare('SELECT * FROM timers WHERE id = ?').get(id);
    if (!r) throw notFound('Timer');
    return this.#map(r);
  }

  start(input: TimerInput): Timer {
    const now = this.#clock();
    const id = randomUUID();
    this.#db.prepare(`INSERT INTO timers (id, label, duration_ms, ends_at, status, created_at) VALUES (?, ?, ?, ?, 'running', ?)`)
      .run(id, input.label, input.seconds * 1000, new Date(now.getTime() + input.seconds * 1000).toISOString(), now.toISOString());
    this.#changed();
    return this.get(id);
  }

  cancel(id: string): Timer {
    this.get(id);
    this.#db.prepare(`UPDATE timers SET status = 'cancelled' WHERE id = ? AND status = 'running'`).run(id);
    this.#changed();
    return this.get(id);
  }

  processDue(at: Date): void {
    const due = this.#db.prepare(`SELECT * FROM timers WHERE status = 'running' AND ends_at <= ?`).all(at.toISOString());
    for (const r of due) {
      this.#db.prepare(`UPDATE timers SET status = 'finished' WHERE id = ?`).run(String(r.id));
      const late = at.getTime() - Date.parse(String(r.ends_at)) > 60_000;
      this.#notifier.notify({ title: 'Timer terminou', body: `${r.label}${late ? ' (terminou com a Shack desligada)' : ''}`, priority: 'high', kind: 'timer', refId: String(r.id) });
      this.#bus.publish('timer.finished', { id: String(r.id), label: String(r.label) });
    }
    if (due.length) this.#changed();
  }

  #changed(): void {
    this.#bus.publish('data.changed', { entity: 'timers' });
  }

  #map(r: Row): Timer {
    return {
      id: String(r.id), label: String(r.label), durationMs: Number(r.duration_ms), endsAt: String(r.ends_at),
      status: r.status as Timer['status'], createdAt: String(r.created_at),
    };
  }
}

/** Relógio do servidor: a cada segundo, dispara lembretes, alarmes e timers vencidos. */
export class Scheduler {
  #reminders: Reminders;
  #timers: Timers;
  #clock: () => Date;
  #interval: NodeJS.Timeout | null = null;

  constructor(reminders: Reminders, timers: Timers, clock: () => Date = () => new Date()) {
    this.#reminders = reminders;
    this.#timers = timers;
    this.#clock = clock;
  }

  start(): void {
    this.#reminders.recover(this.#clock());
    this.#interval = setInterval(() => this.tick(), 1000);
    this.#interval.unref();
  }

  tick(at: Date = this.#clock()): void {
    try {
      this.#reminders.processDue(at);
      this.#timers.processDue(at);
    } catch (err) {
      console.error('[agendador] erro:', err);
    }
  }

  stop(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
  }
}
