import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { CHAT_WIDTH, clampChatWidth, halfChatWidth } from './chat-ui.ts';

const STEP = 24;

/**
 * Largura do chat no computador. A Shack sempre abre com a casa e o chat em metades iguais,
 * a pedido do usuário: o arraste vale até fechar a janela e não fica guardado.
 * Enquanto ninguém arrasta, a metade acompanha o tamanho da janela.
 */
export function useChatWidth() {
  const [viewport, setViewport] = useState(innerWidth);
  // null = metade da janela.
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    const onResize = () => setViewport(innerWidth);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const width = chosen === null ? halfChatWidth(viewport) : clampChatWidth(chosen, viewport);
  const change = (w: number | null) => setChosen(w === null ? null : clampChatWidth(w, innerWidth));
  return [width, change] as const;
}

/**
 * Divisor entre a casa e o chat, como o do VS Code: arraste para mudar a largura,
 * dois cliques para voltar à metade, setas do teclado para ajustar. Só existe no computador.
 * `onChange(null)` volta à metade.
 */
export function Splitter({ width, onChange }: { width: number; onChange(width: number | null): void }) {
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
    onChange(d.last);
  };
  // Soltar, cancelar ou perder o ponteiro (trocar de janela no meio) encerra o arraste. A largura já veio
  // do move; um clique sem arraste não a fixa, e a metade continua acompanhando a janela.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.classList.remove('resizing');
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = { ArrowLeft: STEP, ArrowRight: -STEP };
    if (e.key in by) { e.preventDefault(); onChange(width + by[e.key]!); } else if (e.key === 'Home') { e.preventDefault(); onChange(null); }
  };

  return (
    <div
      className="splitter" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label="Largura do chat" aria-valuenow={width} aria-valuemin={CHAT_WIDTH.min} aria-valuemax={CHAT_WIDTH.max}
      title="Arraste para mudar a largura do chat. Dois cliques voltam à metade."
      data-dragging={dragging || undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onDoubleClick={() => onChange(null)} onKeyDown={key}
    />
  );
}
