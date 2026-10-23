import { upgradeWebSocket } from '@hono/node-server';
import { ClientMessage, type Device, type ServerMessage, WS_CLOSE_UNAUTHORIZED } from '@shack/shared';
import type { WSContext } from 'hono/ws';
import { errorMessage, HttpError } from '../errors.ts';
import type { Shack } from '../shack.ts';

const AUTH_TIMEOUT_MS = 5000;
const REPLAY_BATCH = 500;

/** Conexões abertas por dispositivo, para derrubar na hora quando um token é revogado. */
export class WsHub {
  #sockets = new Map<string, Set<WSContext>>();

  add(deviceId: string, ws: WSContext): void {
    const set = this.#sockets.get(deviceId) ?? new Set();
    set.add(ws);
    this.#sockets.set(deviceId, set);
  }

  remove(deviceId: string, ws: WSContext): void {
    this.#sockets.get(deviceId)?.delete(ws);
  }

  closeDevice(deviceId: string): void {
    for (const ws of this.#sockets.get(deviceId) ?? []) ws.close(WS_CLOSE_UNAUTHORIZED, 'Dispositivo revogado.');
    this.#sockets.delete(deviceId);
  }
}

/**
 * Protocolo (detalhes em docs/API.md):
 * 1. a primeira mensagem tem que ser { type: "auth", token } em até 5 s;
 * 2. { type: "subscribe", since? } liga o stream de eventos, com replay a partir de `since`.
 */
export function wsHandler(shack: Shack, hub: WsHub) {
  return upgradeWebSocket(() => {
    let conn: WSContext | null = null;
    let device: Device | null = null;
    let unsubscribe: (() => void) | null = null;
    let authTimer: NodeJS.Timeout | undefined;

    const send = (msg: ServerMessage) => conn?.send(JSON.stringify(msg));
    const fail = (code: string, message: string) => send({ type: 'error', code, message });

    const handle = (msg: ClientMessage, d: Device) => {
      switch (msg.type) {
        case 'auth':
          return fail('already_authenticated', 'Esta conexão já está autenticada.');
        case 'subscribe': {
          if (unsubscribe) return;
          let since = msg.since ?? shack.bus.lastSeq();
          for (;;) {
            const batch = shack.bus.list({ since, limit: REPLAY_BATCH });
            for (const event of batch) send({ type: 'event', event });
            if (batch.length < REPLAY_BATCH) break;
            since = batch[batch.length - 1]!.seq;
          }
          const offEvents = shack.bus.subscribe((event) => send({ type: 'event', event }));
          const offDeltas = shack.chat.onDelta((delta) => send({ type: 'chat.delta', conversationId: delta.conversationId, messageId: delta.streamId, text: delta.text }));
          unsubscribe = () => { offEvents(); offDeltas(); };
          return;
        }
        case 'approval.respond':
          try { shack.approvals.resolve(msg.approvalId, msg.decision, msg.answer, d.id); } catch (err) {
            fail(err instanceof HttpError ? err.code : 'internal', errorMessage(err));
          }
          return;
        case 'chat.send':
          try { shack.chat.send(msg.conversationId, msg.text, msg.style ?? 'normal', d.id); } catch (err) {
            fail(err instanceof HttpError ? err.code : 'internal', errorMessage(err));
          }
          return;
        case 'ping':
          return send({ type: 'pong' });
      }
    };

    return {
      onOpen(_evt, ws) {
        conn = ws;
        authTimer = setTimeout(() => { if (!device) ws.close(WS_CLOSE_UNAUTHORIZED, 'Autenticação não recebida.'); }, AUTH_TIMEOUT_MS);
      },
      onMessage(evt, ws) {
        conn = ws;
        let parsed: ReturnType<typeof ClientMessage.safeParse>;
        try { parsed = ClientMessage.safeParse(JSON.parse(String(evt.data))); } catch { return fail('invalid_json', 'JSON inválido.'); }
        if (!parsed.success) return fail('invalid_message', 'Mensagem inválida.');
        const msg = parsed.data;

        if (!device) {
          device = msg.type === 'auth' ? shack.auth.verify(msg.token) : null;
          if (!device) return ws.close(WS_CLOSE_UNAUTHORIZED, msg.type === 'auth' ? 'Token inválido ou revogado.' : 'Autentique primeiro.');
          clearTimeout(authTimer);
          hub.add(device.id, ws);
          return send({ type: 'auth.ok', deviceId: device.id });
        }
        handle(msg, device);
      },
      onClose(_evt, ws) {
        clearTimeout(authTimer);
        unsubscribe?.();
        if (device) hub.remove(device.id, ws);
        conn = null;
      },
    };
  });
}
