import { ATTACHMENT_LIMITS, attachmentKind, type AgentInfo, type Approval, type ChatMessage, type ChatStyle } from '@shack/shared';
import { type ClipboardEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import { checkFile, type PendingFile, prepareImage, uploadAttachment } from '../attach.ts';
import { Portrait } from '../Portrait.tsx';
import { MessageAttachments, PendingTray } from './ChatAttachments.tsx';

// No iPhone, "image/*" oferece Fototeca e Câmera e já entrega a foto em JPEG.
const ACCEPT = 'image/*,application/pdf,text/*,.md,.csv,.json,.yaml,.yml,.log';

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
  onSend(text: string, style: ChatStyle, attachmentIds: string[]): void;
  onRespond(id: string, decision: 'approve' | 'deny', answer?: string): void;
  /** Abre o Quadro (calendário, compras e afazeres), que o Renfield mantém em dia. */
  onBoard(): void;
};

/** Coluna de conversa com o Renfield, sempre ao lado da casa. */
export function ChatPanel({ messages, streams, agents, approvals, open, onOpenChange, prefill, onSend, onRespond, onBoard }: Props) {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<ChatStyle>('normal');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(0);
  const list = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const renfield = agents.find((a) => a.chat);

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, streams, open]);
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    input.current?.focus();
  }, [prefill]);

  const patch = (key: string, p: Partial<PendingFile>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const drop = (key: string) => setFiles((fs) => {
    const gone = fs.find((f) => f.key === key);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    return fs.filter((f) => f.key !== key);
  });

  /** Cada arquivo sobe assim que é escolhido: na hora de enviar, só falta a mensagem. */
  const attach = (chosen: File[]) => {
    if (!chosen.length) return;
    onOpenChange(true);
    const room = ATTACHMENT_LIMITS.perMessage - files.length;
    setNotice(chosen.length > room ? `No máximo ${ATTACHMENT_LIMITS.perMessage} anexos por mensagem.` : null);
    for (const original of chosen.slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      const problem = checkFile(original.name, original.type, original.size);
      const isImage = original.type.startsWith('image/') || attachmentKind(original.name, original.type) === 'image';
      setFiles((fs) => [...fs, {
        key, name: original.name || 'arquivo', kind: isImage ? 'image' : attachmentKind(original.name, original.type), size: original.size,
        preview: null, status: problem ? 'error' : 'uploading', error: problem, attachment: null,
      }]);
      if (problem) continue;
      void (async () => {
        try {
          const file = await prepareImage(original);
          patch(key, { name: file.name, size: file.size, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
          patch(key, { status: 'ready', attachment: await uploadAttachment(file) });
        } catch (err) {
          patch(key, { status: 'error', error: err instanceof Error ? err.message : 'Não consegui enviar o arquivo.' });
        }
      })();
    }
  };

  const ready = files.filter((f) => f.status === 'ready');
  const uploading = files.some((f) => f.status === 'uploading');
  const failed = files.find((f) => f.status === 'error');
  const canSend = !uploading && (text.trim().length > 0 || ready.length > 0);

  const send = (value: string) => {
    if (uploading || (!value.trim() && !ready.length)) return;
    onSend(value.trim(), style, ready.map((f) => f.attachment!.id));
    for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles([]);
    setNotice(null);
    setText('');
    onOpenChange(true);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = [...e.clipboardData.files];
    if (!pasted.length) return;
    e.preventDefault();
    attach(pasted);
  };
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const sub = renfield?.status === 'working' ? `${renfield.activity ?? 'Trabalhando'}…` : 'Às suas ordens';

  return (
    <aside
      className={`chat${open ? ' open' : ''}${dragging > 0 ? ' dragging' : ''}`} aria-label={`Conversa com o ${renfield?.name ?? 'Renfield'}`}
      onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging((n) => n + 1); } }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={(e) => { if (hasFiles(e)) setDragging((n) => Math.max(0, n - 1)); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDragging(0); attach([...e.dataTransfer.files]); }}
    >
      <div className="chead">
        {renfield && <Portrait id={renfield.id} appearance={renfield.appearance} />}
        <div className="who"><span className="name">{renfield?.name ?? 'Renfield'}</span><span className="sub">{sub}</span></div>
        {!open && approvals.length > 0 && (
          <span className="pending">{approvals.length === 1 ? '1 pedido' : `${approvals.length} pedidos`}</span>
        )}
        <button className="tbtn" type="button" onClick={onBoard} title="Calendário, compras e afazeres">Quadro</button>
        <button className="tbtn ctoggle" type="button" aria-expanded={open} onClick={() => onOpenChange(!open)}>{open ? 'Fechar' : 'Abrir'}</button>
      </div>

      <div className="msgs" ref={list} aria-live="polite">
        {messages.length === 0 && Object.keys(streams).length === 0 && (
          <p className="muted center-text">Ainda não há conversa. Diga boa tarde ao Renfield ou use uma sugestão abaixo.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : ''} ${m.kind}`}>
            {m.attachments?.length > 0 && <MessageAttachments items={m.attachments} />}
            {m.text}
          </div>
        ))}
        {Object.entries(streams).map(([id, t]) => <div key={id} className="msg streaming">{t}</div>)}
        {renfield?.status === 'working' && Object.keys(streams).length === 0 && <p className="typing">{renfield.name} está escrevendo…</p>}
      </div>

      {approvals.length > 0 && (
        <div className="chat-approvals">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} agentName={agents.find((x) => x.id === a.agentId)?.name ?? a.agentId} onRespond={onRespond} />
          ))}
        </div>
      )}

      {messages.length < 2 && !files.length && (
        <div className="chips">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" type="button" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <PendingTray items={files} onRemove={drop} />
      {(notice || failed?.error) && <p className="error small compose-note" role="alert">{notice ?? failed!.error}</p>}

      <form className="compose" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <button className="btn attach-btn" type="button" aria-label="Anexar foto ou arquivo" title="Anexar foto ou arquivo (ou cole com Ctrl+V)" onClick={() => picker.current?.click()}>+</button>
        <input
          ref={picker} type="file" multiple accept={ACCEPT} hidden
          onChange={(e) => { attach([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
        <label htmlFor="msg" className="sr-only">Mensagem para o Renfield</label>
        <input id="msg" ref={input} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} onFocus={() => onOpenChange(true)} placeholder={files.length ? 'Algo sobre o anexo?' : 'Peça ao Renfield…'} autoComplete="off" />
        <label htmlFor="style" className="sr-only">Estilo da resposta</label>
        <select id="style" value={style} onChange={(e) => setStyle(e.target.value as ChatStyle)} title="Estilo da resposta">
          <option value="normal">Normal</option>
          <option value="short">Curta</option>
          <option value="voice">Para voz</option>
        </select>
        <button className="btn primary" type="submit" disabled={!canSend}>{uploading ? 'Enviando…' : 'Enviar'}</button>
      </form>
      {dragging > 0 && <div className="dropzone" aria-hidden="true">Solte para anexar</div>}
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
