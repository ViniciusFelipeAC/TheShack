import type { ShackNotification } from '@shack/shared';
import { useEffect, useState } from 'react';
import { api } from './live.ts';
import { isIOS, pushBlocker } from './pwa.ts';

/** Liga o push do navegador: permissão, service worker e assinatura no servidor. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  const blocked = pushBlocker();
  if (blocked) return { ok: false, message: blocked };
  // O pedido de permissão vem antes de qualquer outra espera: o iPhone só mostra o pedido logo após um toque.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      message: isIOS()
        ? 'A permissão foi negada. No iPhone, abra Ajustes, depois Notificações, depois Shack, e ative "Permitir Notificações".'
        : 'A permissão foi negada. Libere as notificações deste site nas configurações do navegador.',
    };
  }
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/vapid-key');
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
  await api('/push/subscriptions', { method: 'POST', body: sub.toJSON() });
  return { ok: true, message: 'Notificações do navegador ativadas neste dispositivo.' };
}

export async function pushStatus(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (pushBlocker()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const time = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Avisos que aparecem no alto da tela. Alarmes ficam até você dispensar; avisos de tarefa abrem o agente. */
export function Toasts({ items, onClose, onOpenTask }: { items: ShackNotification[]; onClose(id: string): void; onOpenTask(taskId: string): void }) {
  useEffect(() => {
    const timers = items.filter((n) => n.kind !== 'alarm').map((n) => setTimeout(() => onClose(n.id), 9000));
    return () => timers.forEach(clearTimeout);
  }, [items, onClose]);
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="assertive">
      {items.map((n) => (
        <div key={n.id} className={`toast ${n.kind} ${n.priority}`} role="status">
          <div className="grow">
            <b>{n.title}</b>
            <p>{n.body}</p>
          </div>
          <div className="row">
            {n.kind === 'alarm' && n.refId ? (
              <>
                <button className="btn small primary" type="button" onClick={() => { void api(`/reminders/${n.refId}/dismiss`, { method: 'POST' }); onClose(n.id); }}>Dispensar</button>
                <button className="btn small" type="button" onClick={() => { void api(`/reminders/${n.refId}/snooze`, { method: 'POST', body: { minutes: 10 } }); onClose(n.id); }}>Soneca 10 min</button>
              </>
            ) : (
              <>
                {n.kind === 'task' && n.refId && <button className="btn small" type="button" onClick={() => { onOpenTask(n.refId!); onClose(n.id); }}>Ver</button>}
                <button className="btn small ghost" type="button" aria-label="Fechar aviso" onClick={() => onClose(n.id)}>Fechar</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lista das notificações recentes, aberta pelo sino. */
export function NotificationsPanel({ onClose, onRead }: { onClose(): void; onRead(): void }) {
  const [items, setItems] = useState<ShackNotification[] | null>(null);
  useEffect(() => {
    api<{ items: ShackNotification[] }>('/notifications?limit=40').then((r) => setItems(r.items));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    onRead();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <section className="panel bell-panel" role="dialog" aria-modal="true" aria-label="Notificações" onClick={(e) => e.stopPropagation()}>
        <header className="row between">
          <h2>Notificações</h2>
          <div className="row">
            <button className="btn small" type="button" onClick={readAll}>Marcar todas como lidas</button>
            <button className="btn small ghost" type="button" onClick={onClose}>Fechar</button>
          </div>
        </header>
        {items === null && <p className="muted">Carregando…</p>}
        {items?.length === 0 && <p className="muted">Nenhuma notificação ainda.</p>}
        <ul className="list">
          {items?.map((n) => (
            <li key={n.id} className={`row-item ${n.readAt ? 'off' : ''}`}>
              <div className="grow">
                <b>{n.title}</b> <span className="muted small">{time(n.createdAt)}</span>
                {n.silenced && <span className="tags"><span className="tag">segurada pelo modo</span></span>}
                <p className="small pre">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
