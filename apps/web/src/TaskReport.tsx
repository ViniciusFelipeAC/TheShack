import { type AgentInfo, named, type Task, type Workspace } from '@shack/shared';
import { useState } from 'react';
import { CopyButton } from './CopyButton.tsx';
import { DesignDetails } from './DesignReport.tsx';
import { api } from './live.ts';

const VERIFY_TEXT = { ok: 'conferida', suspect: 'suspeita', unverified: 'não conferida' } as const;
const ITEM_TEXT = { met: 'atendido', partial: 'parcial', missing: 'faltou' } as const;

type SendProps = { label: string; to: AgentInfo; base: { title: string; prompt: string; parentId: string }; workspaceId?: string | null };

/**
 * Manda o texto pronto como tarefa nova, filha desta: o seu toque é a aprovação.
 * Sem workspace definido (o prompt), pergunta em qual projeto; a correção já vai para o projeto conferido.
 */
function SendButton({ label, to, base, workspaceId }: SendProps) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Workspace[] | null>(null);
  const [ws, setWs] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const send = async (id: string) => {
    setBusy(true);
    setNote(null);
    try {
      await api('/tasks', { method: 'POST', body: { assignee: to.id, ...base, workspaceId: id } });
      setNote(`Mandado. ${named(to.name, to.article, 'o', true)} vai começar.`);
      setOpen(false);
    } catch (err) { setNote((err as Error).message); }
    setBusy(false);
  };
  const start = async () => {
    if (workspaceId) { await send(workspaceId); return; }
    setOpen(true);
    try {
      const w = await api<Workspace[]>('/workspaces');
      setList(w);
      if (w.length) setWs(w[0]!.id);
    } catch { setList([]); }
  };

  return (
    <div className="stack tight">
      {!open && <button className="btn small primary" type="button" disabled={busy} onClick={start}>{label}</button>}
      {open && (
        <div className="row wrap">
          {list === null && <span className="meta">Carregando os projetos…</span>}
          {list?.length === 0 && <span className="meta">Nenhum projeto cadastrado. Cadastre em Configurações, Workspaces.</span>}
          {list && list.length > 0 && (
            <>
              <label className="sr-only" htmlFor={`ws-${base.parentId}`}>Projeto</label>
              <select id={`ws-${base.parentId}`} value={ws} onChange={(e) => setWs(e.target.value)}>
                {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button className="btn small primary" type="button" disabled={busy || !ws} onClick={() => send(ws)}>Mandar</button>
            </>
          )}
          <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
      )}
      {note && <p className="meta">{note}</p>}
    </div>
  );
}

type Props = {
  task: Task;
  agents: AgentInfo[];
  /** A conferência já pedida para esta tarefa, se houver. */
  review?: Task | null;
};

/** O relatório de uma tarefa concluída. Da Mina: o prompt pronto ou a conferência, com os botões para seguir. */
export function TaskReport({ task: t, agents, review }: Props) {
  const r = t.result;
  const [checking, setChecking] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<{ to: AgentInfo; reviewed: Task } | null>(null);
  if (!r) return null;
  // Entrega do Harker: a galeria, a legenda e o Ajustar.
  if (r.images) return <DesignDetails task={t} agents={agents} />;
  const coder = agents.find((x) => x.runner === 'code') ?? null;
  const reviewer = agents.find((x) => x.runner === 'text') ?? null;
  const doer = agents.find((x) => x.id === t.assignee);
  const pending = r.review?.items.filter((i) => i.status !== 'met') ?? [];

  const askReview = async () => {
    if (!reviewer) return;
    setChecking('Pedindo…');
    try {
      await api('/tasks', { method: 'POST', body: { assignee: reviewer.id, title: `Conferir: ${t.title}`.slice(0, 200), prompt: 'Confira se a entrega atende ao pedido.', reviewOf: t.id } });
      setChecking(`${named(reviewer.name, reviewer.article, 'o', true)} vai conferir.`);
    } catch (err) { setChecking((err as Error).message); }
  };
  /** A correção volta para quem fez a entrega conferida, no mesmo projeto e partindo do branch dela. */
  const loadFix = async () => {
    if (!t.reviewOf || fixTarget) return;
    try {
      const reviewed = await api<Task>(`/tasks/${t.reviewOf}`);
      const to = agents.find((x) => x.id === reviewed.assignee);
      if (to) setFixTarget({ to, reviewed });
    } catch { /* o botão fica escondido */ }
  };

  return (
    <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void loadFix(); }}>
      <summary>{r.review ? 'Conferência' : r.output ? 'Prompt pronto' : 'Relatório'}</summary>
      <p>{r.summary}</p>
      {r.review && (
        <div className="stack tight">
          <p className="strong">{r.review.verdict === 'pass' ? 'Tudo o que foi pedido foi atendido.' : `${pending.length} pendência(s).`}</p>
          <ul className="checks">
            {r.review.items.map((i, k) => (
              <li key={k}>
                <span className={`tag ${i.status}`}>{ITEM_TEXT[i.status]}</span>
                <span>{i.requirement}{i.evidence && <> · <code>{i.evidence}</code></>}{i.note && <span className="meta"> {i.note}</span>}</span>
              </li>
            ))}
          </ul>
          {r.review.aiSignals && (
            <p className="meta">
              Sinais de cara de IA: {r.review.aiSignals.count} (escala de Krebs: 0 ou 1 é bom, 2 ou 3 pede atenção, 4 ou mais é forte)
              {r.review.aiSignals.found.length > 0 && `: ${r.review.aiSignals.found.map((f) => f.where ? `${f.signal} (${f.where})` : f.signal).join('; ')}`}
            </p>
          )}
        </div>
      )}
      {r.output && (
        <div className="stack tight">
          {r.review && <p className="meta">Prompt de correção:</p>}
          <pre className="prompt">{r.output}</pre>
          <div className="row wrap">
            <CopyButton text={r.output} />
            {!t.reviewOf && coder && (
              <SendButton label={`Mandar para ${named(coder.name, coder.article)}`} to={coder} base={{ title: t.title.replace(/^prompt:\s*/i, '').slice(0, 200), prompt: r.output, parentId: t.id }} />
            )}
            {t.reviewOf && fixTarget && (
              <SendButton
                label={`Mandar correção para ${named(fixTarget.to.name, fixTarget.to.article)}`} to={fixTarget.to} workspaceId={fixTarget.reviewed.workspaceId}
                base={{ title: `Correção: ${fixTarget.reviewed.title.replace(/^correção:\s*/i, '')}`.slice(0, 200), prompt: r.output, parentId: t.id }}
              />
            )}
          </div>
        </div>
      )}
      {r.changes.length > 0 && <ul className="dlist">{r.changes.map((c) => <li key={c.path}><code>{c.path}</code> {c.what}</li>)}</ul>}
      {r.howToTest && <p className="meta">Como testar: {r.howToTest}</p>}
      {r.notes && <p className="meta pre">{r.notes}</p>}
      {r.verification && (
        <p className="meta">Conferência do servidor ({VERIFY_TEXT[r.verification.status]}): {r.verification.reason}{r.verification.diffstat ? ` · ${r.verification.diffstat}` : ''}</p>
      )}
      {doer?.runner === 'code' && reviewer && t.status === 'done' && (
        review
          ? <p className="meta">{reviewStatus(review, reviewer)}</p>
          : checking ? <p className="meta">{checking}</p>
            : <div className="row"><button className="btn small" type="button" onClick={askReview}>Conferir com {named(reviewer.name, reviewer.article)}</button></div>
      )}
    </details>
  );
}

/** Uma linha sobre a conferência desta entrega: em andamento, tudo certo ou com pendência. */
function reviewStatus(review: Task, reviewer: AgentInfo): string {
  const who = named(reviewer.name, reviewer.article, 'o', true);
  if (review.status === 'done') {
    return review.result?.review?.verdict === 'pass' ? `${who} conferiu: tudo certo.` : `${who} conferiu: há pendências. Veja no painel ${named(reviewer.name, reviewer.article, 'do')}.`;
  }
  if (review.status === 'failed' || review.status === 'cancelled') return `A conferência ${named(reviewer.name, reviewer.article, 'do')} não terminou.`;
  return `${who} está conferindo.`;
}
