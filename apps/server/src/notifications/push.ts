import { randomUUID } from 'node:crypto';
import type { PushSubscriptionInput, ShackNotification } from '@shack/shared';
import webpush from 'web-push';
import { type Db, now } from '../db/database.ts';

export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: { TTL: number; urgency: 'normal' | 'high' }) => Promise<unknown>;

/**
 * Push do navegador (Web Push com VAPID), gratuito e sem conta em serviço nenhum.
 * As chaves são geradas na primeira vez e ficam no banco.
 */
export class WebPush {
  #db: Db;
  #send: PushSender;
  readonly publicKey: string;

  constructor(db: Db, opts: { sender?: PushSender; subject?: string } = {}) {
    this.#db = db;
    const read = (k: string) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value as string | undefined;
    let pub = process.env.VAPID_PUBLIC_KEY || read('vapid_public');
    let priv = process.env.VAPID_PRIVATE_KEY || read('vapid_private');
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      for (const [k, v] of [['vapid_public', pub], ['vapid_private', priv]] as const) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
      }
    }
    this.publicKey = pub;
    // O push da Apple (iPhone) recusa o token quando o assunto não é um mailto: ou https: válido; domínio .local não serve.
    const subject = opts.subject ?? (process.env.VAPID_SUBJECT || 'mailto:the-shack@example.com');
    this.#send = opts.sender ?? ((sub, payload, options) => webpush.sendNotification(sub, payload, { ...options, vapidDetails: { subject, publicKey: pub!, privateKey: priv! } }));
  }

  subscribe(deviceId: string | null, sub: PushSubscriptionInput): void {
    this.#db.prepare(`INSERT INTO push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(randomUUID(), deviceId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now());
  }

  unsubscribe(endpoint: string): boolean {
    return Number(this.#db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes) > 0;
  }

  /** Remove as assinaturas de um dispositivo revogado. */
  forgetDevice(deviceId: string): void {
    this.#db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(deviceId);
  }

  count(): number {
    return Number(this.#db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n ?? 0);
  }

  async send(n: ShackNotification): Promise<void> {
    const subs = this.#db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all();
    const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body, kind: n.kind, priority: n.priority });
    await Promise.all(subs.map(async (s) => {
      const sub = { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } };
      try {
        await this.#send(sub, payload, { TTL: 3600, urgency: n.priority === 'high' ? 'high' : 'normal' });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) this.unsubscribe(sub.endpoint); // o navegador cancelou a assinatura
        else console.error('[push] falhou:', (err as Error).message);
      }
    }));
  }
}
