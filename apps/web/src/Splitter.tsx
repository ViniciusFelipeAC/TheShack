import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { CHAT_WIDTH, clampChatWidth } from './chat-ui.ts';

const KEY = 'shack.chatWidth';
const STEP = 24;

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return clampChatWidth(v || CHAT_WIDTH.default, innerWidth);
  } catch { return CHAT_WIDTH.default; }
}
const saveWidth = (w: number) => { try { localStorage.setItem(KEY, String(w)); } catch { /* sem armazenamento */ } };

/** Largura do chat no computador. Cada aparelho guarda a sua: é preferência de tela, não dado da casa. */
export function useChatWidth() {
  const [width, setWidth] = useState(loadWidth);
  useEffect(() => {
    const onResize = () => setWidth((w) => clampChatWidth(w, innerWidth));
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const change = (w: number, persist = true) => {
    const next = clampChatWidth(w, innerWidth);
    setWidth(next);
    if (persist) saveWidth(next);
  };
  return [width, change] as const;
}

/**
 * Divisor entre a casa e o chat, como o do VS Code: arraste para mudar a largura,
 * dois cliques para voltar ao padrão, setas do teclado para ajustar. Só existe no computador.
 */
export function Splitter({ width, onChange }: { width: number; onChange(width: number, persist?: boolean): void }) {
  const drag = useRef<{ x: number; width: number; last: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width, last: width, id: e.pointerId };
    setDragging(true);
    document.documentElement.classList.add('resizing');
  };
  // O chat fica à direita: puxar o divisor para a esquerda alarga o chat.
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.last = d.width + (d.x - e.clientX);
    onChange(d.last, false);
  };
  // Soltar, cancelar ou perder o ponteiro (trocar de janela no meio) grava a última largura vista.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.classList.remove('resizing');
    onChange(d.last);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = { ArrowLeft: STEP, ArrowRight: -STEP };
    if (e.key in by) { e.preventDefault(); onChange(width + by[e.key]!); } else if (e.key === 'Home') { e.preventDefault(); onChange(CHAT_WIDTH.default); }
  };

  return (
    <div
      className="splitter" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label="Largura do chat" aria-valuenow={width} aria-valuemin={CHAT_WIDTH.min} aria-valuemax={CHAT_WIDTH.max}
      title="Arraste para mudar a largura do chat. Dois cliques voltam ao padrão."
      data-dragging={dragging || undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onDoubleClick={() => onChange(CHAT_WIDTH.default)} onKeyDown={key}
    />
  );
}
