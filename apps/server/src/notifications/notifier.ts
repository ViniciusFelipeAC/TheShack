import { randomUUID } from 'node:crypto';
import type { ShackNotification } from '@shack/shared';
import type { EventBus } from '../core/events.ts';
import { type Db, now } from '../db/database.ts';
import { notFound } from '../errors.ts';
import type { Mind } from '../renfield/mind.ts';
import type { WebPush } from './push.ts';

type Priority = ShackNotification['priority'];
type Kind = ShackNotification['kind'];
const RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2 };
type Row = Record<string, unknown>;

/**
 * Decide o que chega até você. O modo ativo define a prioridade mínima: o que fica abaixo
 * é guardado em silêncio e vira um resumo quando o modo acaba.
 */
export class Notifier {
  #db: Db;
  #bus: EventBus;
  #mind: Mind;
  #push: WebPush | null;

  constructor(db: Db, bus: EventBus, mind: Mind, push: WebPush | null) {
    this.#db = db;
    this.#bus = bus;
    this.#mind = mind;
    this.#push = push;
    mind.onModeChange((prev, next) => { if (prev && prev.name !== next?.name) this.digest(prev.name); });
  }

  notify(n: { title: string; body: string; priority: Priority; kind: Kind; refId?: string | null }): ShackNotification {
    const mode = this.#mind.activeMode();
    const silenced = mode ? RANK[n.priority] < RANK[mode.minPriority] : false;
    const id = randomUUID();
    this.#db.prepare(`INSERT INTO notifications (id, title, body, priority, kind, ref_id, silenced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, n.title, n.body, n.priority, n.kind, n.refId ?? null, silenced ? 1 : 0, now());
    const created = this.get(id);
    this.#bus.publish('notification.created', created);
    if (!silenced && this.#push) void this.#push.send(created).catch((err) => console.error('[push] erro:', err));
    return created;
  }

  get(id: string): ShackNotification {
    const r = this.#db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!r) throw notFound('Notificação');
    return this.#map(r);
  }

  list(limit = 50): ShackNotification[] {
    return this.#db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map((r) => this.#map(r));
  }

  unread(): number {
    return Number(this.#db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get()?.n ?? 0);
  }

  markRead(id: string): ShackNotification {
    this.get(id);
    this.#db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?').run(now(), id);
    return this.get(id);
  }

  markAllRead(): number {
    return Number(this.#db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now()).changes);
  }

  /** Resumo do que ficou segurado durante um modo. */
  digest(modeName: string): ShackNotification | null {
    const held = this.#db.prepare('SELECT * FROM notifications WHERE silenced = 1 AND digested = 0 ORDER BY created_at').all().map((r) => this.#map(r));
    if (!held.length) return null;
    this.#db.prepare('UPDATE notifications SET digested = 1 WHERE silenced = 1 AND digested = 0').run();
    const lines = held.slice(0, 6).map((h) => `• ${h.title}: ${h.body}`);
    if (held.length > 6) lines.push(`• e mais ${held.length - 6}.`);
    return this.notify({
      title: `Durante o modo ${modeName}: ${held.length} ${held.length === 1 ? 'aviso' : 'avisos'}`,
      body: lines.join('\n'), priority: 'normal', kind: 'digest',
    });
  }

  #map(r: Row): ShackNotification {
    return {
      id: String(r.id), title: String(r.title), body: String(r.body), priority: r.priority as Priority, kind: r.kind as Kind,
      refId: r.ref_id === null ? null : String(r.ref_id), silenced: Number(r.silenced) === 1,
      readAt: r.read_at === null ? null : String(r.read_at), createdAt: String(r.created_at),
    };
  }
}
