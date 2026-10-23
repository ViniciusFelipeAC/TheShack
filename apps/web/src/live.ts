import type { ClientMessage, ServerMessage, ShackEvent } from '@shack/shared';

const TOKEN_KEY = 'shack.token';

export const tokenStore = {
  get(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(token: string): void { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* sem armazenamento */ } },
  clear(): void { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento */ } },
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Chamada REST com o token do dispositivo. Erros viram ApiError com a mensagem do servidor. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText);
  return data as T;
}

export type Connection = 'connecting' | 'online' | 'offline';
type Delta = Extract<ServerMessage, { type: 'chat.delta' }>;
type Handlers = {
  onEvent(event: ShackEvent): void;
  onDelta(delta: Delta): void;
  onConnection(state: Connection): void;
  onUnauthorized(): void;
};

/** WebSocket da Shack: autentica, assina os eventos e reconecta sozinho, sem perder o que passou. */
export class Live {
  #ws: WebSocket | null = null;
  #since: number | undefined;
  #retry = 0;
  #stopped = false;
  #h: Handlers;

  constructor(handlers: Handlers) {
    this.#h = handlers;
  }

  start(): void { this.#connect(); }

  stop(): void {
    this.#stopped = true;
    this.#ws?.close();
  }

  send(msg: ClientMessage): boolean {
    if (this.#ws?.readyState !== WebSocket.OPEN) return false;
    this.#ws.send(JSON.stringify(msg));
    return true;
  }

  #connect(): void {
    this.#h.onConnection('connecting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/ws`);
    this.#ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: tokenStore.get() ?? '' }));
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as ServerMessage;
      if (msg.type === 'auth.ok') {
        this.#retry = 0;
        ws.send(JSON.stringify({ type: 'subscribe', since: this.#since }));
        this.#h.onConnection('online');
      } else if (msg.type === 'event') {
        this.#since = Math.max(this.#since ?? 0, msg.event.seq);
        this.#h.onEvent(msg.event);
      } else if (msg.type === 'chat.delta') {
        this.#h.onDelta(msg);
      }
    };
    ws.onclose = (e) => {
      this.#ws = null;
      if (this.#stopped) return;
      if (e.code === 4001) { this.#h.onUnauthorized(); return; }
      this.#h.onConnection('offline');
      setTimeout(() => this.#connect(), Math.min(15_000, 500 * 2 ** this.#retry++));
    };
  }
}
