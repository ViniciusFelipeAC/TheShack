import type { AgentInfo, Approval, ChatMessage, ChatStyle } from '@shack/shared';
import { useEffect, useRef, useState } from 'react';
import { Portrait } from '../Portrait.tsx';

const SUGGESTIONS = [
  'O que tenho amanhã?',
  'Me lembra de tomar o remédio todo dia útil às 8h',
  'Coloca leite e café na lista do mercado',
  'O que o etnaD está fazendo?',
];

type Props = {
  messages: ChatMessage[];
  streams: Record<string, string>;
  agents: AgentInfo[];
  approvals: Approval[];
  /** No celular o chat é uma gaveta: fechada, mostra só o cabeçalho e a caixa de texto. */
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Texto para começar a mensagem, vindo do painel de um agente. Muda o `n` a cada pedido. */
  prefill: { text: string; n: number } | null;
  onSend(text: string, style: ChatStyle): void;
  onRespond(id: string, decision: 'approve' | 'deny', answer?: string): void;
};

/** Coluna de conversa com o Marvin, sempre ao lado da casa. */
export function ChatPanel({ messages, streams, agents, approvals, open, onOpenChange, prefill, onSend, onRespond }: Props) {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<ChatStyle>('normal');
  const list = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const marvin = agents.find((a) => a.chat);

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, streams, open]);
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    input.current?.focus();
  }, [prefill]);

  const send = (value: string) => {
    if (!value.trim()) return;
    onSend(value.trim(), style);
    setText('');
    onOpenChange(true);
  };
  const sub = marvin?.status === 'working' ? `${marvin.activity ?? 'Trabalhando'}…` : 'Às suas ordens';

  return (
    <aside className={`chat${open ? ' open' : ''}`} aria-label={`Conversa com o ${marvin?.name ?? 'Marvin'}`}>
      <div className="chead">
        {marvin && <Portrait id={marvin.id} appearance={marvin.appearance} />}
        <div className="who"><span className="name">{marvin?.name ?? 'Marvin'}</span><span className="sub">{sub}</span></div>
        {!open && approvals.length > 0 && (
          <span className="pending">{approvals.length === 1 ? '1 pedido' : `${approvals.length} pedidos`}</span>
        )}
        <button className="tbtn ctoggle" type="button" aria-expanded={open} onClick={() => onOpenChange(!open)}>{open ? 'Fechar' : 'Abrir'}</button>
      </div>

      <div className="msgs" ref={list} aria-live="polite">
        {messages.length === 0 && Object.keys(streams).length === 0 && (
          <p className="muted center-text">Ainda não há conversa. Diga boa tarde ao Marvin ou use uma sugestão abaixo.</p>
        )}
        {messages.map((m) => <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : ''} ${m.kind}`}>{m.text}</div>)}
        {Object.entries(streams).map(([id, t]) => <div key={id} className="msg streaming">{t}</div>)}
        {marvin?.status === 'working' && Object.keys(streams).length === 0 && <p className="typing">{marvin.name} está escrevendo…</p>}
      </div>

      {approvals.length > 0 && (
        <div className="chat-approvals">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} agentName={agents.find((x) => x.id === a.agentId)?.name ?? a.agentId} onRespond={onRespond} />
          ))}
        </div>
      )}

      {messages.length < 2 && (
        <div className="chips">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" type="button" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <form className="compose" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label htmlFor="msg" className="sr-only">Mensagem para o Marvin</label>
        <input id="msg" ref={input} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => onOpenChange(true)} placeholder="Peça algo ao Marvin…" autoComplete="off" />
        <label htmlFor="style" className="sr-only">Estilo da resposta</label>
        <select id="style" value={style} onChange={(e) => setStyle(e.target.value as ChatStyle)} title="Estilo da resposta">
          <option value="normal">Normal</option>
          <option value="short">Curta</option>
          <option value="voice">Para voz</option>
        </select>
        <button className="btn primary" type="submit" disabled={!text.trim()}>Enviar</button>
      </form>
    </aside>
  );
}

/** Pedido de aprovação (Aprovar e Negar) ou pergunta do agente (opções ou resposta livre). */
export function ApprovalCard({ approval: a, agentName, onRespond, compact = false }: {
  approval: Approval; agentName: string; onRespond(id: string, decision: 'approve' | 'deny', answer?: string): void; compact?: boolean;
}) {
  const [answer, setAnswer] = useState('');
  const cls = compact ? 'approval compact' : 'approval';
  if (a.kind === 'question') {
    return (
      <div className={cls}>
        <p><b>{agentName} tem uma pergunta.</b> {a.summary}</p>
        {a.options?.length ? (
          <div className="row wrap">{a.options.map((o) => <button key={o} className="btn" type="button" onClick={() => onRespond(a.id, 'approve', o)}>{o}</button>)}</div>
        ) : null}
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) onRespond(a.id, 'approve', answer.trim()); }}>
          <label htmlFor={`ans-${a.id}${compact ? '-p' : ''}`} className="sr-only">Sua resposta</label>
          <input id={`ans-${a.id}${compact ? '-p' : ''}`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ou escreva a resposta…" />
          <button className="btn primary" type="submit" disabled={!answer.trim()}>Responder</button>
          <button className="btn ghost" type="button" onClick={() => onRespond(a.id, 'deny')}>Não responder</button>
        </form>
      </div>
    );
  }
  return (
    <div className={cls}>
      <p><b>{agentName} precisa de você.</b> {a.summary}</p>
      <div className="row">
        <button className="btn primary" type="button" onClick={() => onRespond(a.id, 'approve')}>Aprovar</button>
        <button className="btn" type="button" onClick={() => onRespond(a.id, 'deny')}>Negar</button>
      </div>
    </div>
  );
}
