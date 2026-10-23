import type { AccountStatus, AgentInfo, Approval, ChatMessage, ChatStyle, DataEntity, Memory, Mode, Rule, ShackEvent, ShackNotification, Task } from '@shack/shared';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPanel } from './AgentPanel.tsx';
import { Dock, type Section, SECTIONS, TopBar, Welcome, Zoom } from './Hud.tsx';
import { api, ApiError, type Connection, Live, tokenStore } from './live.ts';
import { NotificationsPanel, Toasts } from './Notifications.tsx';
import { AgendaPage } from './pages/Agenda.tsx';
import { ChatPanel } from './pages/Chat.tsx';
import { ListsPage } from './pages/Lists.tsx';
import { NotesPage } from './pages/Notes.tsx';
import { RemindersPage } from './pages/Reminders.tsx';
import { defaultDeviceName, isIOS, isStandalone } from './pwa.ts';
import { SceneCanvas } from './SceneCanvas.tsx';
import type { MapName, SceneHandle, Weather } from './scene/engine.ts';
import { houseOrder } from './scene/model.ts';
import { Settings } from './Settings.tsx';

const WEATHER_KEY = 'shack.weather';
const WELCOME_KEY = 'shack.welcome.v1';
const sectionFromHash = (): Section | null => {
  const h = location.hash.replace('#', '');
  return SECTIONS.some(([s]) => s === h) ? (h as Section) : null;
};
const stored = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ } };

/** "às 15:40" hoje, ou "na sex., às 09:00" em outro dia. */
export function resetText(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `às ${time}` : `${d.toLocaleDateString('pt-BR', { weekday: 'short' })}, às ${time}`;
}

export function App() {
  const [state, setState] = useState<'checking' | 'login' | 'in'>(tokenStore.get() ? 'checking' : 'login');
  useEffect(() => {
    if (state !== 'checking') return;
    api('/me').then(() => setState('in')).catch(() => setState('login'));
  }, [state]);
  const logout = useCallback(() => { tokenStore.clear(); setState('login'); }, []);
  if (state === 'checking') return <main className="center"><p className="muted">Abrindo a casa…</p></main>;
  if (state === 'login') return <Login onDone={() => setState('in')} />;
  return <Shell onLogout={logout} />;
}

function Login({ onDone }: { onDone(): void }) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const [mode, setMode] = useState<'code' | 'token'>(touch ? 'code' : 'token');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(defaultDeviceName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = 'Não consegui falar com o servidor. Ele está rodando?';
  // No iPhone, o app instalado não enxerga o login feito no Safari: o certo é instalar primeiro e entrar pelo ícone.
  const installFirst = isIOS() && !isStandalone();

  const submitToken = async (e: FormEvent) => {
    e.preventDefault();
    tokenStore.set(token.trim());
    try { await api('/me'); onDone(); } catch (err) {
      tokenStore.clear();
      setError(err instanceof ApiError && err.status === 401 ? 'Esse token não foi aceito. Confira se copiou inteiro.' : offline);
    }
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/auth/pair', { method: 'POST', body: { code: code.trim(), deviceName: name.trim() || 'Celular', kind: touch ? 'mobile' : 'web' } });
      tokenStore.set(r.token);
      onDone();
    } catch (err) {
      setError(!(err instanceof ApiError) || err.status >= 500 ? offline
        : err.status === 429 ? 'Muitas tentativas erradas. Espere alguns minutos e gere um código novo no computador.'
          : 'Esse código não vale: confira os números ou gere outro no computador (ele dura 5 minutos e só funciona uma vez).');
    }
    setBusy(false);
  };

  return (
    <main className="center">
      <div className="panel login">
        <h1 className="brand">THE SHACK</h1>
        {installFirst && (
          <div className="box warn">
            <p><b>Instale antes de entrar.</b> Toque em <b>Compartilhar</b> (o quadrado com a seta, embaixo) e depois em <b>Adicionar à Tela de Início</b>. Abra a Shack pelo ícone novo e entre por lá: assim ela abre em tela cheia e pode mandar notificações.</p>
          </div>
        )}
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-pressed={mode === 'code'} onClick={() => { setMode('code'); setError(null); }}>Código de pareamento</button>
          <button type="button" role="tab" aria-pressed={mode === 'token'} onClick={() => { setMode('token'); setError(null); }}>Token</button>
        </div>
        {mode === 'code' ? (
          <form className="stack" onSubmit={submitCode}>
            <p>No computador, abra <b>Menu</b>, <b>Configurações</b>, <b>Dispositivos</b> e toque em <b>Gerar código</b>.</p>
            <label htmlFor="code" className="sr-only">Código de 6 dígitos</label>
            <input id="code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" placeholder="000000" autoFocus={!installFirst} />
            <label htmlFor="devname" className="small muted">Nome deste aparelho</label>
            <input id="devname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={code.length !== 6 || busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={submitToken}>
            <p>Cole o token deste dispositivo para entrar.</p>
            <label htmlFor="token" className="sr-only">Token</label>
            <input id="token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="shk_…" autoFocus={!touch} autoComplete="off" autoCapitalize="off" spellCheck={false} />
            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={!token.trim()}>Entrar</button>
            <p className="muted small">Não tem um token? Na pasta do projeto, rode <code>npm run token -- --name "Meu PC"</code>.</p>
          </form>
        )}
      </div>
    </main>
  );
}

function Shell({ onLogout }: { onLogout(): void }) {
  const [section, setSection] = useState<Section | null>(sectionFromHash);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [versions, setVersions] = useState<Record<DataEntity, number>>({ calendar: 0, reminders: 0, timers: 0, lists: 0, notes: 0 });
  const [taskVersions, setTaskVersions] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<ShackNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toReview, setToReview] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sceneActivity, setSceneActivity] = useState<Record<string, string | null>>({});
  const [mapName, setMapName] = useState<MapName>('in');
  const [weather, setWeather] = useState<Weather>(() => {
    const w = stored(WEATHER_KEY);
    return w === 'rain' || w === 'clear' ? w : 'fog';
  });
  const [welcome, setWelcome] = useState(() => stored(WELCOME_KEY) !== '1');
  const [chatOpen, setChatOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const live = useRef<Live | null>(null);
  const scene = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /** Memórias e regras que o Marvin anotou sozinho e você ainda não conferiu. */
  const countReview = useCallback(async () => {
    const [mems, rules] = await Promise.all([api<Memory[]>('/memories'), api<Rule[]>('/rules')]);
    setToReview(mems.filter((m) => m.isNew).length + rules.filter((r) => r.isNew).length);
  }, []);

  const refresh = useCallback(async () => {
    countReview().catch(() => {});
    const [m, a, p, acc, n, modes] = await Promise.all([
      api<ChatMessage[]>('/conversations/main/messages?limit=100'), api<AgentInfo[]>('/agents'), api<Approval[]>('/approvals'),
      api<AccountStatus>('/system/account'), api<{ unread: number }>('/notifications?limit=1'), api<Mode[]>('/modes'),
    ]);
    setMessages(m); setAgents(a); setApprovals(p); setAccount(acc); setUnread(n.unread);
    setMode(modes.find((x) => x.active)?.name ?? null);
    setVersions((v) => ({ calendar: v.calendar + 1, reminders: v.reminders + 1, timers: v.timers + 1, lists: v.lists + 1, notes: v.notes + 1 }));
    setTaskVersions((v) => Object.fromEntries(a.map((x) => [x.id, (v[x.id] ?? 0) + 1])));
  }, [countReview]);

  const apply = useCallback((e: ShackEvent) => {
    const data = e.data as Record<string, unknown>;
    if (e.agentId && (e.type.startsWith('task.') || e.type.startsWith('approval.'))) {
      const id = e.agentId;
      setTaskVersions((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
    }
    switch (e.type) {
      case 'chat.message': {
        const { message, streamId } = data as { message: ChatMessage; streamId: string | null };
        setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
        if (streamId) setStreams((s) => { const n = { ...s }; delete n[streamId]; return n; });
        // O Marvin pode ter anotado algo nesta resposta.
        if (message.role === 'assistant') countReview().catch(() => {});
        break;
      }
      case 'agent.status':
        setAgents((as) => as.map((a) => (a.id === e.agentId ? { ...a, ...(data as Partial<AgentInfo>) } : a)));
        break;
      case 'approval.requested':
        setApprovals((p) => [data as Approval, ...p.filter((x) => x.id !== data.id)]);
        break;
      case 'approval.resolved':
        setApprovals((p) => p.filter((x) => x.id !== data.id));
        break;
      case 'agent.updated':
        api<AgentInfo[]>('/agents').then(setAgents).catch(() => {});
        break;
      case 'system.quota':
        api<AccountStatus>('/system/account').then(setAccount).catch(() => {});
        break;
      case 'mode.changed':
        setMode((data as { active: Mode | null }).active?.name ?? null);
        break;
      case 'data.changed': {
        const entity = (data as { entity: DataEntity }).entity;
        setVersions((v) => ({ ...v, [entity]: v[entity] + 1 }));
        break;
      }
      case 'notification.created': {
        const n = data as unknown as ShackNotification;
        setUnread((u) => u + 1);
        if (!n.silenced) setToasts((t) => [...t.filter((x) => !(x.kind === 'alarm' && x.refId === n.refId)), n].slice(-4));
        break;
      }
    }
  }, [countReview]);

  useEffect(() => {
    const l = new Live({
      onConnection: (c) => { setConnection(c); if (c === 'online') refresh().catch(() => {}); },
      onUnauthorized: onLogout,
      onDelta: (d) => setStreams((s) => ({ ...s, [d.messageId]: (s[d.messageId] ?? '') + d.text })),
      onEvent: apply,
    });
    live.current = l;
    l.start();
    return () => l.stop();
  }, [apply, refresh, onLogout]);

  const send = (text: string, style: ChatStyle) => {
    const sent = live.current?.send({ type: 'chat.send', conversationId: 'main', text, style, clientId: crypto.randomUUID() });
    if (!sent) api('/conversations/main/messages', { method: 'POST', body: { text, style } }).catch(() => {});
  };
  const respond = (id: string, decision: 'approve' | 'deny', answer?: string) => {
    if (!live.current?.send({ type: 'approval.respond', approvalId: id, decision, answer })) {
      api(`/approvals/${id}`, { method: 'POST', body: { decision, answer } }).catch(() => {});
    }
  };
  const go = useCallback((s: Section | null) => {
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
    setSection(s);
  }, []);
  const closeToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const select = useCallback((id: string) => setFocusId((cur) => (cur === id ? null : id)), []);
  const openTask = (taskId: string) => {
    api<Task>(`/tasks/${taskId}`).then((t) => { go(null); setFocusId(t.assignee); }).catch(() => {});
  };
  const ask = (text: string) => {
    setFocusId(null);
    setChatOpen(true);
    setPrefill((p) => ({ text, n: (p?.n ?? 0) + 1 }));
  };
  const closeWelcome = () => { store(WELCOME_KEY, '1'); setWelcome(false); };
  const changeWeather = (w: Weather) => { store(WEATHER_KEY, w); setWeather(w); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || bellOpen || settingsOpen) return;
      if (welcome) closeWelcome();
      else if (section) go(null);
      else if (focusId) setFocusId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ordered = useMemo(() => houseOrder(agents), [agents]);
  const sceneAgents = useMemo(
    () => agents.map(({ id, name, status, currentTaskId, chat, appearance }) => ({ id, name, status, currentTaskId, chat, appearance })),
    [agents],
  );
  const focused = agents.find((a) => a.id === focusId) ?? null;
  const quota = account?.quota ?? null;
  const quotaBlocked = quota?.status === 'rejected';
  const resetsAt = quota?.resetsAt ? resetText(quota.resetsAt) : null;

  return (
    <div className="house-app">
      <section className="stage" aria-label="A casa">
        <SceneCanvas
          agents={sceneAgents} focusId={focusId} weather={weather} resting={quotaBlocked} handle={scene}
          onSelect={select} onMap={setMapName} onActivity={setSceneActivity}
        />
        <TopBar
          connection={connection} mode={mode} weather={weather} map={mapName} unread={unread} quota={quota} toReview={toReview}
          onToggleMap={() => scene.current?.toggleMap()} onBell={() => setBellOpen(true)} onSection={go}
          onWeather={changeWeather} onSettings={() => setSettingsOpen(true)} onHelp={() => setWelcome(true)} onLogout={onLogout}
        />
        <div className="notices">
          {account?.subscriptionOk === false && <p className="notice err glass">{account.problem} Entre com a sua assinatura usando /login no Claude Code.</p>}
          {quotaBlocked && <p className="notice warn glass">A cota do seu plano acabou por enquanto{resetsAt ? ` e volta ${resetsAt}` : ''}. Os agentes foram descansar e a fila espera.</p>}
          {quota?.status === 'allowed_warning' && (
            <p className="notice warn glass">A cota está perto do limite{quota.percent !== null ? ` (${Math.round(quota.percent)}% usado)` : ''}{resetsAt ? ` e renova ${resetsAt}` : ''}. O Marvin vai confirmar com você antes de mandar tarefas novas ao etnaD.</p>
          )}
          {quota?.overage && <p className="notice err glass">O Claude Code indicou uso de cobrança extra (overage). A Shack é de custo zero: confira os limites de gasto da sua conta no claude.ai.</p>}
        </div>
        <Dock agents={ordered} activity={sceneActivity} focusId={focusId} onSelect={select} />
        <Zoom onZoom={(s) => scene.current?.zoomBy(s)} />
        {focused && (
          <AgentPanel
            agent={focused} agents={agents} sceneActivity={sceneActivity[focused.id] ?? null} approvals={approvals} account={account}
            version={taskVersions[focused.id] ?? 0} onRespond={respond} onAsk={ask} onClose={() => setFocusId(null)}
          />
        )}
        {section && (
          <div className="sheet">
            {section === 'agenda' && <AgendaPage version={versions.calendar} />}
            {section === 'lembretes' && <RemindersPage remindersVersion={versions.reminders} timersVersion={versions.timers} />}
            {section === 'listas' && <ListsPage version={versions.lists} />}
            {section === 'notas' && <NotesPage version={versions.notes} />}
            <button className="tbtn sheet-close" type="button" onClick={() => go(null)}>
              <span className="long">Voltar para a casa</span><span className="short">Voltar</span>
            </button>
          </div>
        )}
        {welcome && <Welcome onClose={closeWelcome} />}
      </section>

      <ChatPanel
        messages={messages} streams={streams} agents={agents} approvals={approvals}
        open={chatOpen} onOpenChange={setChatOpen} prefill={prefill} onSend={send} onRespond={respond}
      />

      <Toasts items={toasts} onClose={closeToast} onOpenTask={openTask} />
      {bellOpen && <NotificationsPanel onClose={() => setBellOpen(false)} onRead={() => setUnread(0)} />}
      {settingsOpen && <Settings account={account} onClose={() => { setSettingsOpen(false); countReview().catch(() => {}); }} />}
    </div>
  );
}
