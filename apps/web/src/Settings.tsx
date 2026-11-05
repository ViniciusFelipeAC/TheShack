import type { AccountStatus, Device, Memory, Mode, Rule, Workspace } from '@shack/shared';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QuotaMeter } from './Hud.tsx';
import { api } from './live.ts';
import { enablePush, pushStatus } from './Notifications.tsx';
import { isIOS, isStandalone, pushBlocker } from './pwa.ts';

type Tab = 'persona' | 'memories' | 'rules' | 'mode' | 'workspaces' | 'devices' | 'notifications' | 'account';
const TABS: Array<[Tab, string]> = [
  ['persona', 'Persona'], ['memories', 'Memórias'], ['rules', 'Regras'], ['mode', 'Modo'],
  ['workspaces', 'Workspaces'], ['devices', 'Dispositivos'], ['notifications', 'Notificações'], ['account', 'Conta'],
];

export function Settings({ account, onClose }: { account: AccountStatus | null; onClose(): void }) {
  const [tab, setTab] = useState<Tab>('persona');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <section className="panel settings" role="dialog" aria-modal="true" aria-label="Configurações do Renfield" onClick={(e) => e.stopPropagation()}>
        <header className="row between">
          <h2>Configurações do Renfield</h2>
          <button className="btn ghost" type="button" onClick={onClose} aria-label="Fechar">Fechar</button>
        </header>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        {tab === 'persona' && <PersonaTab />}
        {tab === 'memories' && <MemoriesTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'mode' && <ModeTab />}
        {tab === 'workspaces' && <WorkspacesTab />}
        {tab === 'devices' && <DevicesTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'account' && <AccountTab account={account} />}
      </section>
    </div>
  );
}

function PersonaTab() {
  const [content, setContent] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api<{ content: string }>('/agents/renfield/persona').then((p) => setContent(p.content)); }, []);
  const save = async () => {
    await api('/agents/renfield/persona', { method: 'PUT', body: { content } });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  if (content === null) return <p className="muted">Carregando…</p>;
  return (
    <div className="stack">
      <p className="muted small">É o arquivo <code>agents/renfield/persona.md</code>. Vale a partir da próxima mensagem.</p>
      <label htmlFor="persona" className="sr-only">Persona</label>
      <textarea id="persona" value={content} onChange={(e) => setContent(e.target.value)} rows={16} />
      <div className="row">
        <button className="btn primary" type="button" onClick={save}>Salvar persona</button>
        {saved && <span className="muted small">Salvo.</span>}
      </div>
    </div>
  );
}

function MemoriesTab() {
  const [items, setItems] = useState<Memory[]>([]);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<Memory['kind']>('fact');
  const load = () => api<Memory[]>('/memories').then(setItems);
  useEffect(() => { void load(); }, []);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await api('/memories', { method: 'POST', body: { content: draft, kind } });
    setDraft('');
    await load();
  };
  return (
    <div className="stack">
      <p className="muted small">O que o Renfield sabe sobre você. Ele também anota sozinho quando você conta algo duradouro. Uma memória errada é pior que nenhuma: corrija ou apague o que estiver velho.</p>
      {items.some((m) => m.isNew) && <p className="small"><span className="tag new">{items.filter((m) => m.isNew).length} para revisar</span> Anotadas pelo Renfield e ainda não conferidas por você.</p>}
      {items.length === 0 && <p className="muted">Nada anotado ainda.</p>}
      <ul className="list">
        {items.map((m) => (
          <EditableRow key={m.id} text={m.content} badge={m.kind === 'preference' ? 'preferência' : 'fato'} isNew={m.isNew}
            onSave={(content) => api(`/memories/${m.id}`, { method: 'PATCH', body: { content } }).then(load)}
            onReviewed={() => api(`/memories/${m.id}`, { method: 'PATCH', body: { isNew: false } }).then(load)}
            onDelete={() => api(`/memories/${m.id}`, { method: 'DELETE' }).then(load)} />
        ))}
      </ul>
      <form className="row" onSubmit={add}>
        <label htmlFor="mem" className="sr-only">Nova memória</label>
        <input id="mem" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: Prefiro reuniões depois das 10h" />
        <label htmlFor="memkind" className="sr-only">Tipo</label>
        <select id="memkind" value={kind} onChange={(e) => setKind(e.target.value as Memory['kind'])}>
          <option value="fact">Fato</option>
          <option value="preference">Preferência</option>
        </select>
        <button className="btn" type="submit">Anotar</button>
      </form>
    </div>
  );
}

function RulesTab() {
  const [items, setItems] = useState<Rule[]>([]);
  const [instruction, setInstruction] = useState('');
  const [trigger, setTrigger] = useState('');
  const load = () => api<Rule[]>('/rules').then(setItems);
  useEffect(() => { void load(); }, []);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    await api('/rules', { method: 'POST', body: { instruction, ...(trigger.trim() ? { trigger } : {}) } });
    setInstruction('');
    setTrigger('');
    await load();
  };
  return (
    <div className="stack">
      <p className="muted small">Comportamentos que o Renfield aprendeu. As que vieram de um feedback seu aparecem como novas até você revisar. Regra que ninguém revisa vira superstição: apague as que não fazem mais sentido.</p>
      {items.some((r) => r.isNew) && <p className="small"><span className="tag new">{items.filter((r) => r.isNew).length} para revisar</span></p>}
      {items.length === 0 && <p className="muted">Nenhuma regra ainda.</p>}
      <ul className="list">
        {items.map((r) => (
          <EditableRow key={r.id} text={r.instruction} badge={r.trigger ? `gatilho: ${r.trigger}` : null} isNew={r.isNew} muted={!r.enabled}
            onSave={(text) => api(`/rules/${r.id}`, { method: 'PATCH', body: { instruction: text } }).then(load)}
            onReviewed={() => api(`/rules/${r.id}`, { method: 'PATCH', body: { isNew: false } }).then(load)}
            onDelete={() => api(`/rules/${r.id}`, { method: 'DELETE' }).then(load)}
            extra={<button className="btn small" type="button" onClick={() => api(`/rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }).then(load)}>{r.enabled ? 'Desligar' : 'Ligar'}</button>} />
        ))}
      </ul>
      <form className="stack" onSubmit={add}>
        <label htmlFor="ruleinst" className="sr-only">Instrução</label>
        <input id="ruleinst" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: Silencie lembretes que não forem urgentes" />
        <div className="row">
          <label htmlFor="ruletrig" className="sr-only">Gatilho</label>
          <input id="ruletrig" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Gatilho opcional, ex.: modo foco" />
          <button className="btn" type="submit">Ensinar</button>
        </div>
      </form>
    </div>
  );
}

function ModeTab() {
  const [modes, setModes] = useState<Mode[]>([]);
  const load = () => api<Mode[]>('/modes').then(setModes);
  useEffect(() => { void load(); }, []);
  const set = (name: string | null) => api('/settings/mode', { method: 'PUT', body: { name } }).then(load);
  const active = modes.find((m) => m.active);
  return (
    <div className="stack">
      <p className="muted small">Modos mudam o que chega até você. No modo foco, só avisos urgentes tocam; o resto chega num resumo quando você desligar o modo.</p>
      <div className="row wrap">
        <button className="btn" type="button" aria-pressed={!active} onClick={() => set(null)}>Nenhum</button>
        {modes.map((m) => (
          <button key={m.name} className="btn" type="button" aria-pressed={m.active} onClick={() => set(m.name)} title={m.description}>{m.name}</button>
        ))}
      </div>
      {active && <p className="small">{active.description}</p>}
    </div>
  );
}

function WorkspacesTab() {
  const [items, setItems] = useState<Workspace[]>([]);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Workspace[]>('/workspaces').then(setItems);
  useEffect(() => { void load(); }, []);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/workspaces', { method: 'POST', body: { name, path } });
      setName('');
      setPath('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não deu certo.'); }
  };
  return (
    <div className="stack">
      <p className="muted small">Pastas de projeto onde o etnaD pode trabalhar. Ele nunca mexe fora delas. Em repositórios git, cada tarefa ganha um branch próprio, com commit no fim, e o seu branch fica intocado.</p>
      {items.length === 0 && <p className="muted">Nenhum workspace ainda. Cadastre a pasta de um projeto para o etnaD trabalhar.</p>}
      <ul className="list">
        {items.map((w) => <WorkspaceRow key={w.id} ws={w} onChange={load} />)}
      </ul>
      <form className="stack" onSubmit={add}>
        <div className="row">
          <label htmlFor="wsname" className="sr-only">Nome</label>
          <input id="wsname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome, ex.: meu-app" />
        </div>
        <div className="row">
          <label htmlFor="wspath" className="sr-only">Caminho da pasta</label>
          <input id="wspath" value={path} onChange={(e) => setPath(e.target.value)} placeholder="Caminho completo, ex.: C:\Users\voce\projetos\meu-app" />
          <button className="btn" type="submit" disabled={!name.trim() || !path.trim()}>Cadastrar</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

function WorkspaceRow({ ws, onChange }: { ws: Workspace; onChange(): Promise<unknown> }) {
  const [rules, setRules] = useState(ws.autoApprove.join('\n'));
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (body: object) => api(`/workspaces/${ws.id}`, { method: 'PATCH', body }).then(onChange);
  return (
    <li className="row-item">
      <div className="grow">
        <b>{ws.name}</b>
        <span className="tags">
          <span className="tag">{ws.isGitRepo ? 'git' : 'sem git'}</span>
          {ws.isGitRepo && <span className="tag">{ws.gitBranching ? 'branch por tarefa' : 'trabalha no branch atual'}</span>}
        </span>
        <div className="muted small ellipsis">{ws.path}</div>
      </div>
      <div className="row">
        {ws.isGitRepo && <button className="btn small" type="button" onClick={() => void patch({ gitBranching: !ws.gitBranching })}>{ws.gitBranching ? 'Sem branch' : 'Com branch'}</button>}
        <button className="btn small" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Comandos liberados</button>
        {confirmDelete
          ? <button className="btn small danger" type="button" onClick={() => void api(`/workspaces/${ws.id}`, { method: 'DELETE' }).then(onChange)}>Confirmar</button>
          : <button className="btn small" type="button" onClick={() => setConfirmDelete(true)}>Remover</button>}
      </div>
      {open && (
        <div className="stack" style={{ flexBasis: '100%' }}>
          <p className="muted small">Um por linha, além dos do manifesto. Exemplo: <code>Bash(npm run build*)</code>. O resto pede sua aprovação.</p>
          <label htmlFor={`rules-${ws.id}`} className="sr-only">Comandos liberados</label>
          <textarea id={`rules-${ws.id}`} rows={4} value={rules} onChange={(e) => setRules(e.target.value)} />
          <div className="row">
            <button className="btn small primary" type="button" onClick={() => void patch({ autoApprove: rules.split('\n').map((r) => r.trim()).filter(Boolean) })}>Salvar</button>
          </div>
        </div>
      )}
    </li>
  );
}

function NotificationsTab() {
  const [status, setStatus] = useState<string>('…');
  const [message, setMessage] = useState<string | null>(null);
  const blocker = pushBlocker();
  const check = () => pushStatus().then((s) => setStatus({ on: 'Ativadas neste aparelho', off: 'Desativadas neste aparelho', denied: 'Bloqueadas pelo navegador', unsupported: 'Indisponíveis aqui' }[s]));
  useEffect(() => { void check(); }, []);
  return (
    <div className="stack">
      <p className="muted small">Com elas ativadas, lembretes, alarmes, timers e avisos dos agentes aparecem como notificação do sistema, mesmo com a aba fechada. Funciona enquanto o servidor da Shack estiver ligado.</p>
      <p><b>Situação:</b> {status}</p>
      {blocker && <div className="box warn"><p>{blocker}</p></div>}
      <div className="row wrap">
        <button className="btn primary" type="button" onClick={() => void enablePush().then((r) => { setMessage(r.message); return check(); }).catch((err) => setMessage(err instanceof Error ? err.message : 'Não deu certo.'))}>Ativar neste aparelho</button>
        <button className="btn" type="button" onClick={() => void api('/notifications/test', { method: 'POST' }).then(() => setMessage('Notificação de teste enviada.'))}>Mandar um teste</button>
      </div>
      {message && <p className="small">{message}</p>}
      <p className="muted small">O modo ativo (aba Modo) segura os avisos de prioridade menor. Eles chegam juntos, num resumo, quando o modo acaba.</p>
    </div>
  );
}

function AccountTab({ account }: { account: AccountStatus | null }) {
  if (!account || account.subscriptionOk === null) {
    return <p className="muted">A conta é verificada na primeira conversa com o Renfield.</p>;
  }
  return (
    <dl className="facts">
      <dt>Uso da cota</dt>
      <dd>
        <QuotaMeter quota={account.quota} />
        {account.quota?.windows.map((w) => (
          <div key={w.kind} className="meta">
            {WINDOW_LABEL[w.kind] ?? w.kind}: {w.percent === null ? 'sem número' : `${Math.round(w.percent)}%`}
            {w.resetsAt ? `, renova em ${new Date(w.resetsAt).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        ))}
      </dd>
      <dt>Assinatura</dt><dd>{account.subscriptionOk ? account.subscriptionType ?? 'Ativa' : `Problema: ${account.problem}`}</dd>
      <dt>Modelos em uso</dt>
      <dd>{Object.entries(account.agentModels).map(([agent, model]) => `${agent}: ${model ?? '—'}`).join(' · ') || '—'}</dd>
      <dt>Cota</dt>
      <dd>{account.quota ? `${account.quota.status === 'rejected' ? 'Esgotada' : 'Disponível'}${account.quota.resetsAt ? `, renova às ${new Date(account.quota.resetsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Sem informação ainda'}</dd>
      <dt>Custo</dt><dd>Zero. A Shack usa só o login da sua assinatura.</dd>
    </dl>
  );
}

const WINDOW_LABEL: Record<string, string> = { five_hour: '5 horas', seven_day: '7 dias', seven_day_opus: '7 dias (Opus)', seven_day_sonnet: '7 dias (Sonnet)' };

type Remote = { tailscale: 'missing' | 'stopped' | 'running'; url: string | null; serving: boolean | null; serveCommand: string; webBuilt: boolean };

/** Conectar o celular: o endereço pelo Tailscale, o código de pareamento e a lista de aparelhos. */
function DevicesTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = () => Promise.all([api<Device[]>('/devices').then(setDevices), api<Device>('/me').then((d) => setMe(d.id))]);
  useEffect(() => {
    void load();
    api<Remote>('/system/remote').then(setRemote).catch(() => setRemote(null));
  }, []);
  useEffect(() => {
    if (!pairing) return;
    const tick = () => {
      const s = Math.max(0, Math.round((Date.parse(pairing.expiresAt) - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setPairing(null);
    };
    tick();
    // Enquanto o código vale, a lista se atualiza sozinha: o celular aparece assim que entrar.
    const id = setInterval(() => { tick(); void api<Device[]>('/devices').then(setDevices).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [pairing]);

  const newCode = () => api<{ code: string; expiresAt: string }>('/auth/pairing-codes', { method: 'POST' }).then(setPairing);
  const revoke = (id: string) => api(`/devices/${id}`, { method: 'DELETE' }).then(load).then(() => setConfirm(null));

  return (
    <div className="stack">
      <h3 className="sub">Conectar o celular</h3>
      {isIOS() && !isStandalone() && (
        <div className="box warn"><p>Você está no Safari. Para instalar a Shack neste iPhone, toque em <b>Compartilhar</b> e em <b>Adicionar à Tela de Início</b>.</p></div>
      )}
      <RemoteSteps remote={remote} />
      <div className="row wrap">
        <button className="btn primary" type="button" onClick={() => void newCode()}>{pairing ? 'Gerar outro código' : 'Gerar código'}</button>
        {pairing && <span className="muted small">vale por {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}, uma vez só</span>}
      </div>
      {pairing && <p className="pair-code" aria-label={`Código ${pairing.code.split('').join(' ')}`}>{pairing.code.slice(0, 3)} {pairing.code.slice(3)}</p>}

      <h3 className="sub">Aparelhos com acesso</h3>
      <ul className="list">
        {devices.filter((d) => !d.revokedAt).map((d) => (
          <li key={d.id} className="row-item">
            <div className="grow">
              <b>{d.name}</b>
              <span className="tags">
                <span className="tag">{d.kind === 'mobile' ? 'celular' : d.kind === 'cli' ? 'terminal' : 'navegador'}</span>
                {d.id === me && <span className="tag new">este aparelho</span>}
              </span>
              <div className="muted small">
                {d.lastSeenAt ? `Visto em ${new Date(d.lastSeenAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Ainda não usado'}
              </div>
            </div>
            {d.id !== me && (confirm === d.id
              ? <button className="btn small danger" type="button" onClick={() => void revoke(d.id)}>Confirmar</button>
              : <button className="btn small" type="button" onClick={() => setConfirm(d.id)}>Revogar</button>)}
          </li>
        ))}
      </ul>
      <p className="muted small">Revogar desconecta o aparelho na hora e para as notificações dele. Perdeu o celular? Revogue aqui.</p>
    </div>
  );
}

function RemoteSteps({ remote }: { remote: Remote | null }) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  if (!remote) return <p className="muted small">Verificando o Tailscale…</p>;
  if (remote.tailscale === 'missing') {
    return (
      <ol className="steps">
        <li>Instale o <b>Tailscale</b> neste computador (tailscale.com/download) e no iPhone (App Store). É gratuito para uso pessoal.</li>
        <li>Entre com a <b>mesma conta</b> nos dois.</li>
        <li>Volte aqui: esta tela mostra o próximo passo.</li>
      </ol>
    );
  }
  if (remote.tailscale === 'stopped') {
    return <p className="small">O Tailscale está instalado, mas desligado ou sem login neste computador. Abra o Tailscale, entre na sua conta e volte aqui.</p>;
  }
  return (
    <ol className="steps">
      {!remote.webBuilt && <li>Gere o app: na pasta do projeto, rode <code>npm run build</code> e reinicie o servidor com <code>npm start</code>.</li>}
      {remote.serving !== true && (
        <li>
          Ligue o HTTPS para o celular: num terminal deste computador, rode <code>{remote.serveCommand}</code>{' '}
          <button className="btn small" type="button" onClick={() => copy(remote.serveCommand)}>{copied ? 'Copiado' : 'Copiar'}</button>
          <div className="muted small">Na primeira vez, o Tailscale pode pedir para ativar HTTPS na sua conta: siga o link que ele mostrar.</div>
        </li>
      )}
      <li>No iPhone, com o Tailscale ligado, abra no <b>Safari</b>: <b className="mono">{remote.url}</b></li>
      <li>Toque em <b>Compartilhar</b> e em <b>Adicionar à Tela de Início</b>.</li>
      <li>Abra a Shack pelo ícone novo, toque em <b>Gerar código</b> aqui e digite os números lá.</li>
      <li>No iPhone, abra <b>Menu</b>, <b>Configurações</b>, <b>Notificações</b> e toque em <b>Ativar neste aparelho</b>.</li>
    </ol>
  );
}

function EditableRow(p: {
  text: string; badge: string | null; isNew: boolean; muted?: boolean; extra?: ReactNode;
  onSave(text: string): Promise<unknown>; onReviewed(): Promise<unknown>; onDelete(): Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <li className={`row-item ${p.muted ? 'off' : ''}`}>
      {editing ? (
        <form className="row grow" onSubmit={(e) => { e.preventDefault(); void p.onSave(value).then(() => setEditing(false)); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Editar texto" autoFocus />
          <button className="btn small primary" type="submit">Salvar</button>
          <button className="btn small" type="button" onClick={() => { setValue(p.text); setEditing(false); }}>Cancelar</button>
        </form>
      ) : (
        <>
          <div className="grow">
            <span>{p.text}</span>
            <span className="tags">
              {p.badge && <span className="tag">{p.badge}</span>}
              {p.isNew && <span className="tag new">nova</span>}
            </span>
          </div>
          <div className="row">
            {p.isNew && <button className="btn small" type="button" onClick={() => void p.onReviewed()}>Revisada</button>}
            {p.extra}
            <button className="btn small" type="button" onClick={() => setEditing(true)}>Editar</button>
            {confirmDelete
              ? <button className="btn small danger" type="button" onClick={() => void p.onDelete()}>Confirmar</button>
              : <button className="btn small" type="button" onClick={() => setConfirmDelete(true)}>Apagar</button>}
          </div>
        </>
      )}
    </li>
  );
}
