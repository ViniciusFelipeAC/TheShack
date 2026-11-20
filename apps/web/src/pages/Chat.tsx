import { ATTACHMENT_LIMITS, attachmentKind, type AgentInfo, type Approval, type ChatMessage, type ChatStyle, type Conversation } from '@shack/shared';
import { type ClipboardEvent, type DragEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { checkFile, type PendingFile, prepareImage, uploadAttachment } from '../attach.ts';
import { isSendKey } from '../chat-ui.ts';
import { Portrait } from '../Portrait.tsx';
import { MessageAttachments, PendingTray } from './ChatAttachments.tsx';
import { ConversationMenu } from './ChatHistory.tsx';

// No iPhone, "image/*" oferece Fototeca e Câmera e já entrega a foto em JPEG.
const ACCEPT = 'image/*,application/pdf,text/*,.md,.csv,.json,.yaml,.yml,.log';

const SUGGESTIONS = [
  'O que tenho amanhã?',
  'Me lembra de tomar o remédio todo dia útil às 8h',
  'Coloca leite e café na lista do mercado',
  'O que o etnaD está fazendo?',
];

type Props = {
  /** A conversa aberta, a mesma em todos os aparelhos. Nula até o servidor responder. */
  conversation: Conversation | null;
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
  /** Começa uma conversa limpa, como o /clear do Claude Code. */
  onNewConversation(): void;
  /** Volta para uma conversa do histórico. */
  onOpenConversation(id: string): void;
};

/** Coluna de conversa com o Renfield, sempre ao lado da casa. */
export function ChatPanel({ conversation, messages, streams, agents, approvals, open, onOpenChange, prefill, onSend, onRespond, onBoard, onNewConversation, onOpenConversation }: Props) {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<ChatStyle>('normal');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(0);
  const [history, setHistory] = useState(false);
  const list = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const historyBtn = useRef<HTMLButtonElement | null>(null);
  const renfield = agents.find((a) => a.chat);
  const closeHistory = useCallback(() => setHistory(false), []);

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, streams, open]);
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    input.current?.focus();
  }, [prefill]);
  // A caixa cresce com o texto até umas seis linhas; depois rola por dentro (o teto está no CSS).
  // Vazia, fica com uma linha: o texto de exemplo não conta, senão ele quebraria e a caixa cresceria à toa.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = '';
    if (!text) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

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
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = [...e.clipboardData.files];
    if (!pasted.length) return;
    e.preventDefault();
    attach(pasted);
  };
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const sub = renfield?.status === 'working' ? `${renfield.activity ?? 'Trabalhando'}…` : 'Às suas ordens';
  const empty = messages.length === 0 && Object.keys(streams).length === 0;
  const startNew = () => {
    setHistory(false);
    onNewConversation();
    input.current?.focus();
  };

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
        <button
          className="tbtn icon-btn conv-btn" type="button" onClick={startNew} disabled={empty}
          aria-label="Nova conversa" title={empty ? 'Esta conversa já está limpa' : 'Nova conversa (começa limpa)'}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-4M14.6 2.9l2.5 2.5L10 12.5 7 13l.5-3z" /></svg>
        </button>
        <button
          ref={historyBtn} className="tbtn icon-btn conv-btn" type="button" aria-label="Conversas anteriores" title="Conversas anteriores"
          aria-haspopup="menu" aria-expanded={history} onClick={() => setHistory((h) => !h)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v3h3M10 6.5V10l2.5 1.5" /></svg>
        </button>
        <button className="tbtn" type="button" onClick={onBoard} title="Calendário, compras e afazeres">Quadro</button>
        <button className="tbtn ctoggle" type="button" aria-expanded={open} onClick={() => onOpenChange(!open)}>{open ? 'Fechar' : 'Abrir'}</button>
        {history && <ConversationMenu currentId={conversation?.id ?? null} anchor={historyBtn} onOpen={onOpenConversation} onClose={closeHistory} />}
      </div>

      <div className="msgs" ref={list} aria-live="polite">
        {empty && (
          <p className="muted center-text">
            {conversation && conversation.id !== 'main'
              ? 'Conversa nova. O Renfield continua com as suas memórias e regras, mas começa sem o que foi dito nas outras conversas. Elas ficam no histórico, no relógio aqui em cima.'
              : 'Ainda não há conversa. Diga boa tarde ao Renfield ou use uma sugestão abaixo.'}
          </p>
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
        <label htmlFor="msg" className="sr-only">Mensagem para o Renfield. Enter envia; Shift+Enter quebra a linha.</label>
        <textarea
          id="msg" ref={input} rows={1} value={text} enterKeyHint="send" autoComplete="off"
          onChange={(e) => setText(e.target.value)} onPaste={onPaste} onFocus={() => onOpenChange(true)}
          onKeyDown={(e) => { if (isSendKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) { e.preventDefault(); send(text); } }}
          placeholder={files.length ? 'Algo sobre o anexo?' : 'Peça ao Renfield…'}
        />
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
