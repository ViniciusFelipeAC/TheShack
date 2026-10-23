import type { AccountStatus, AgentInfo, Approval, ShackEvent, Task, TaskDetail } from '@shack/shared';
import { useEffect, useState } from 'react';
import { api } from './live.ts';
import { ApprovalCard } from './pages/Chat.tsx';
import { Portrait } from './Portrait.tsx';

export const STATUS_TEXT: Record<AgentInfo['status'], string> = {
  idle: 'Ocioso', working: 'Trabalhando', waiting_input: 'Precisa de você', error: 'Com erro', disabled: 'Desativado',
};
const TASK_STATUS: Record<Task['status'], string> = {
  queued: 'Na fila', running: 'Em andamento', waiting_input: 'Esperando você', done: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada',
};

/** O que mostrar em "Agora": o andar pela casa enquanto ele chega, senão a atividade real que o servidor informa. */
export function nowText(a: AgentInfo, scene: string | null | undefined): string {
  if (a.status === 'disabled') return 'Desativado';
  if (a.status === 'idle') return scene ?? 'Descansando';
  return scene ?? a.activity ?? STATUS_TEXT[a.status];
}

const VERIFY_TEXT = { ok: 'conferida', suspect: 'suspeita', unverified: 'não conferida' } as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const tokens = (t: Task) => {
  if (!t.usage) return null;
  const n = t.usage.inputTokens + t.usage.outputTokens;
  return n < 1000 ? `${n} tokens` : `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil tokens`;
};

type Props = {
  agent: AgentInfo;
  agents: AgentInfo[];
  sceneActivity: string | null;
  approvals: Approval[];
  account: AccountStatus | null;
  /** Muda a cada evento de tarefa deste agente, para o painel se atualizar. */
  version: number;
  onRespond(id: string, decision: 'approve' | 'deny', answer?: string): void;
  onAsk(text: string): void;
  onClose(): void;
};

/** Painel do agente: o que está fazendo, o que espera na fila e o que fez há pouco. */
export function AgentPanel({ agent: a, agents, sceneActivity, approvals, account, version, onRespond, onAsk, onClose }: Props) {
  const [current, setCurrent] = useState<TaskDetail | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [queue, setQueue] = useState<Task[]>([]);
  const [recent, setRecent] = useState<Task[] | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // eventos de progresso chegam em rajadas; espera um pouco para buscar uma vez só
    const timer = setTimeout(async () => {
      try {
        const [q, r] = await Promise.all([
          api<{ items: Task[] }>(`/tasks?assignee=${a.id}&status=queued&limit=10`),
          api<{ items: Task[] }>(`/tasks?assignee=${a.id}&limit=15`),
        ]);
        const id = a.currentTaskId;
        const [cur, ev]: [TaskDetail | null, ShackEvent[]] = id
          ? await Promise.all([api<TaskDetail>(`/tasks/${id}`), api<ShackEvent[]>(`/tasks/${id}/events`)])
          : [null, []];
        if (!alive) return;
        setQueue(q.items.reverse());
        setRecent(r.items.filter((t) => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled').slice(0, 5));
        setCurrent(cur);
        setSteps(ev.filter((e) => e.type === 'task.progress').map((e) => String((e.data as { message?: unknown }).message ?? '')).filter(Boolean).slice(-5));
      } catch { /* o painel mostra o que já tinha */ }
    }, version === 0 ? 0 : 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [a.id, a.currentTaskId, version]);

  useEffect(() => { setConfirmCancel(false); }, [a.currentTaskId]);

  const act = async (path: string) => {
    setBusy(true);
    try { await api(path, { method: 'POST' }); } catch { /* o estado real chega pelo WebSocket */ }
    setBusy(false);
    setConfirmCancel(false);
  };
  const nameOf = (id?: string) => agents.find((x) => x.id === id)?.name ?? id ?? '';
  const origin = (t: Task) => (t.origin.kind === 'agent' ? `Pedida por ${nameOf(t.origin.agentId)}` : t.origin.kind === 'schedule' ? 'Agendada' : 'Pedida por você');
  const model = account?.agentModels?.[a.id];
  const mine = approvals.filter((p) => p.agentId === a.id);

  let main;
  if (a.status === 'disabled') {
    main = <div className="box err"><h4>Manifesto com problema</h4><p>{a.manifestError ?? 'O agent.yaml deste agente não pôde ser lido.'}</p><p className="meta">Corrija o arquivo em agents/{a.id}/. O servidor recarrega sozinho.</p></div>;
  } else if (a.status === 'waiting_input') {
    main = (
      <div className="box warn">
        <h4>Precisa de você</h4>
        {current && <p className="strong">{current.title}</p>}
        {mine.length === 0 && <p>{a.activity ?? 'Esperando a sua resposta.'}</p>}
        {mine.map((p) => <ApprovalCard key={p.id} approval={p} agentName={a.name} onRespond={onRespond} compact />)}
      </div>
    );
  } else if (a.status === 'error' && current?.status === 'done' && current.result?.verification?.status === 'suspect') {
    const v = current.result.verification;
    main = (
      <div className="box warn">
        <h4>Confira o resultado</h4>
        <p className="strong">{current.title}</p>
        <p>O {a.name} disse que concluiu, mas o git não confirma. {v.reason}</p>
        {v.files.length > 0 && <p className="meta">Mudou de verdade: {v.files.slice(0, 6).join(', ')}{v.files.length > 6 ? ` e mais ${v.files.length - 6}` : ''}</p>}
        <p className="meta">O relatório dizia: {current.result.summary}</p>
        <div className="row wrap">
          <button className="btn primary" type="button" onClick={() => onAsk(`Revise com o ${a.name} a tarefa "${current.title}": o resultado ficou suspeito. `)}>Pedir ao Marvin</button>
          <button className="btn" type="button" disabled={busy} onClick={() => act(`/agents/${a.id}/clear-error`)}>Já conferi</button>
        </div>
      </div>
    );
  } else if (a.status === 'error') {
    main = (
      <div className="box err">
        <h4>Deu errado</h4>
        {current && <p className="strong">{current.title}</p>}
        <p>{a.activity ?? 'A última tarefa falhou.'}</p>
        <div className="row wrap">
          {a.currentTaskId && <button className="btn primary" type="button" disabled={busy} onClick={() => act(`/tasks/${a.currentTaskId}/retry`)}>Tentar de novo</button>}
          <button className="btn" type="button" disabled={busy} onClick={() => act(`/agents/${a.id}/clear-error`)}>Limpar o aviso</button>
        </div>
      </div>
    );
  } else if (a.status === 'working' && current) {
    main = (
      <div className="box">
        <h4>Fazendo agora</h4>
        <p className="strong">{current.title}</p>
        <p className="meta">{origin(current)}{current.startedAt ? ` · começou às ${clock(current.startedAt)}` : ''}</p>
        {steps.length > 0 && <ol className="dlist">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
        <div className="row wrap">
          {confirmCancel ? (
            <>
              <button className="btn danger" type="button" disabled={busy} onClick={() => act(`/tasks/${current.id}/cancel`)}>Sim, cancelar</button>
              <button className="btn ghost" type="button" onClick={() => setConfirmCancel(false)}>Deixar seguir</button>
            </>
          ) : <button className="btn" type="button" onClick={() => setConfirmCancel(true)}>Cancelar tarefa</button>}
        </div>
      </div>
    );
  } else if (a.status === 'working') {
    main = <div className="box"><h4>Fazendo agora</h4><p>{a.activity ?? 'Respondendo você'}.</p></div>;
  } else {
    main = (
      <div className="box">
        <h4>Sem tarefa agora</h4>
        <p>{a.chat ? `O ${a.name} está à disposição. Fale com ele no chat.` : `Para dar trabalho ao ${a.name}, peça ao Marvin no chat.`}</p>
        <div className="row"><button className="btn" type="button" onClick={() => onAsk(a.chat ? '' : `Peça ao ${a.name} para `)}>{a.chat ? 'Ir para o chat' : 'Pedir algo'}</button></div>
      </div>
    );
  }

  return (
    <section className="drawer glass" aria-label={`Detalhes de ${a.name}`}>
      <div className="dhead">
        <Portrait id={a.id} appearance={a.appearance} />
        <div className="grow"><h2>{a.name}</h2><p>{a.role}</p></div>
        <button className="x" type="button" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div><h4>Agora</h4><p className="pill" data-state={a.status}>{nowText(a, sceneActivity)}</p></div>
      {main}
      {queue.length > 0 && (
        <div><h4>Na fila</h4><ul className="dlist">{queue.map((t) => <li key={t.id}>{t.title}</li>)}</ul></div>
      )}
      <div>
        <h4>Feito recentemente</h4>
        {recent === null && <p className="meta">Carregando…</p>}
        {recent?.length === 0 && <p className="meta">Nada ainda.</p>}
        <ul className="history">
          {recent?.map((t) => (
            <li key={t.id}>
              <div className="row between">
                <span className="strong ellipsis">{t.title}</span>
                <span className="tags">
                  {t.result?.verification && t.result.verification.status !== 'ok' && <span className={`tag ${t.result.verification.status}`}>{VERIFY_TEXT[t.result.verification.status]}</span>}
                  <span className={`tag ${t.status}`}>{TASK_STATUS[t.status]}</span>
                </span>
              </div>
              <span className="meta">{when(t.finishedAt ?? t.createdAt)}{tokens(t) ? ` · ${tokens(t)}` : ''}</span>
              {t.result && (
                <details>
                  <summary>Relatório</summary>
                  <p>{t.result.summary}</p>
                  {t.result.changes.length > 0 && <ul className="dlist">{t.result.changes.map((c) => <li key={c.path}><code>{c.path}</code> {c.what}</li>)}</ul>}
                  {t.result.howToTest && <p className="meta">Como testar: {t.result.howToTest}</p>}
                  {t.result.verification && (
                    <p className="meta">Conferência ({VERIFY_TEXT[t.result.verification.status]}): {t.result.verification.reason}{t.result.verification.diffstat ? ` · ${t.result.verification.diffstat}` : ''}</p>
                  )}
                </details>
              )}
              {t.handoff && (
                <details>
                  <summary>Nota de passagem</summary>
                  <p className="pre">{t.handoff}</p>
                </details>
              )}
              {t.status === 'failed' && t.error && <p className="meta">{t.error}</p>}
            </li>
          ))}
        </ul>
      </div>
      {model && <p className="meta">Modelo do plano: {model}</p>}
    </section>
  );
}
