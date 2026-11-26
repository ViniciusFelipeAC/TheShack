import type { AccountStatus, AgentInfo, AgentTokens, QuotaWindow } from '@shack/shared';
import { useEffect, useState } from 'react';
import { api } from './live.ts';
import { agoText, orderWindows, resetLabel, tokensText, untilText, windowName } from './usage.ts';
import './usage.css';

const pct = (w: QuotaWindow | undefined) => (w?.percent === null || w?.percent === undefined ? null : Math.round(w.percent));

/** Uma barrinha de uso. Sem número, mostra "–" em vez de fingir 0%. */
function Meter({ w, short, long }: { w: QuotaWindow | undefined; short: string; long: string }) {
  const p = pct(w);
  return (
    <span className="um" data-state={w?.status ?? 'unknown'}>
      <span className="um-label"><span className="long">{long}</span><span className="short">{short}</span></span>
      <span className="qbar"><span style={{ width: `${w?.status === 'rejected' ? 100 : Math.max(0, Math.min(100, p ?? 0))}%` }} /></span>
      <span className="um-pct">{p === null ? '–' : `${p}%`}</span>
    </span>
  );
}

/** No canto da casa: a sessão de 5 horas e a semana, sempre à vista. */
export function UsageMini({ account }: { account: AccountStatus | null }) {
  const windows = account?.quota?.windows ?? [];
  const find = (kind: string) => windows.find((w) => w.kind === kind);
  return (
    <span className="usage-mini">
      <Meter w={find('five_hour')} short="5h" long="Sessão" />
      <Meter w={find('seven_day')} short="7d" long="Semana" />
    </span>
  );
}

type PanelProps = { account: AccountStatus | null; agents: AgentInfo[]; onRefresh(): Promise<void> };

/** O detalhe do uso: cada janela do plano com a hora em que renova, e os tokens das tarefas de cada agente. */
export function UsagePanel({ account, agents, onRefresh }: PanelProps) {
  const [tokens, setTokens] = useState<AgentTokens[] | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    api<AgentTokens[]>('/system/usage/tasks').then((t) => { if (alive) setTokens(t); }, () => { if (alive) setTokens('error'); });
    // "renova em 25 min" anda sozinho enquanto o painel está aberto.
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const refresh = async () => { setBusy(true); await onRefresh(); setBusy(false); };
  const windows = orderWindows(account?.quota?.windows ?? []);
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const plan = account?.subscriptionType ? ` (${account.subscriptionType.replace(/^claude\s+/i, '')})` : '';

  return (
    <div className="usage-pop glass" role="dialog" aria-label="Uso do plano">
      <h4>Uso do plano{plan}</h4>
      {windows.map((w) => (
        <div key={w.kind} className="uw" data-state={w.status}>
          <div className="row between"><span className="strong">{windowName(w.kind)}</span><span className="um-pct">{pct(w) === null ? '–' : `${pct(w)}%`}</span></div>
          <span className="qbar wide"><span style={{ width: `${w.status === 'rejected' ? 100 : Math.max(0, Math.min(100, pct(w) ?? 0))}%` }} /></span>
          {w.resetsAt && <p className="meta">{resetLabel(w.resetsAt)} ({untilText(w.resetsAt)})</p>}
        </div>
      ))}
      {account?.usageError && <p className="meta warn-text">{account.usageError}</p>}
      {!windows.length && !account?.usageError && <p className="meta">{account?.usageCheckedAt ? 'O plano não informou nenhuma janela.' : 'Consultando o uso do plano…'}</p>}
      <div className="row between">
        <span className="meta">{account?.usageCheckedAt ? `Atualizado ${agoText(account.usageCheckedAt)}` : ''}</span>
        <button className="btn small" type="button" disabled={busy} onClick={refresh}>{busy ? 'Atualizando…' : 'Atualizar'}</button>
      </div>

      <h4>Tokens das tarefas</h4>
      {tokens === null && <p className="meta">Carregando…</p>}
      {tokens === 'error' && <p className="meta warn-text">Indisponível: não consegui ler o consumo das tarefas.</p>}
      {Array.isArray(tokens) && tokens.length === 0 && <p className="meta">Consulta feita: nenhuma tarefa com consumo nos últimos 7 dias.</p>}
      {Array.isArray(tokens) && tokens.length > 0 && (
        <table className="utable">
          <thead><tr><th scope="col">Agente</th><th scope="col">Hoje</th><th scope="col">7 dias</th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.agentId}>
                <th scope="row">{name(t.agentId)}</th>
                <td>{tokensText(t.today.inputTokens + t.today.outputTokens)}</td>
                <td>{tokensText(t.week.inputTokens + t.week.outputTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="meta">O plano mede em porcentagem e soma tudo: o Claude Code deste PC, o claude.ai e a Shack. Os tokens acima são só os das tarefas, com o que veio do cache; o chat do Renfield não entra.</p>
    </div>
  );
}
