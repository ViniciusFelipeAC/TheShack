import type { Conversation } from '@shack/shared';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { conversationLabel, visibleConversations } from '../chat-ui.ts';
import { api } from '../live.ts';

const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `hoje, ${time}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;
};
const count = (n: number) => (n === 1 ? '1 mensagem' : `${n} mensagens`);

type Props = {
  currentId: string | null;
  /** O botão que abriu o menu: tocar nele de novo fecha, em vez de fechar e reabrir. */
  anchor: RefObject<HTMLButtonElement | null>;
  onOpen(id: string): void;
  onClose(): void;
};

/** Conversas anteriores com o Renfield, como o /resume do Claude Code. */
export function ConversationMenu({ currentId, anchor, onOpen, onClose }: Props) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api<Conversation[]>('/conversations').then(setItems).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);
  useEffect(() => { box.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus(); }, [items]);

  const shown = items ? visibleConversations(items, currentId) : [];
  return (
    <div
      ref={box} className="conv-menu glass" role="menu" aria-label="Conversas anteriores"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.current?.focus(); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
      }}
    >
      <h4>Conversas</h4>
      {failed && <p className="error small">Indisponível: não consegui carregar as conversas.</p>}
      {!failed && items === null && <p className="meta">Carregando…</p>}
      {shown.map((c) => (
        <button
          key={c.id} type="button" role="menuitemradio" aria-checked={c.id === currentId}
          onClick={() => { if (c.id !== currentId) onOpen(c.id); onClose(); }}
        >
          <span className="ellipsis">{conversationLabel(c)}</span>
          <span className="meta">{c.id === currentId ? 'Aberta · ' : ''}{when(c.updatedAt)} · {count(c.messageCount)}</span>
        </button>
      ))}
    </div>
  );
}
