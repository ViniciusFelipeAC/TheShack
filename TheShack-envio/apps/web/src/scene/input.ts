/* Entrada sobre o canvas: arrastar, pinça, roda do mouse e toque. A cena diz o que cada gesto faz. */
import type { Pt } from './layout.ts';

export type Gestures = {
  /** Ponto do mundo sob o dedo, e o mesmo ponto em pixels do canvas. */
  at(clientX: number, clientY: number): { x: number; y: number; sx: number; sy: number };
  cam(): { x: number; y: number; zoom: number; dpr: number };
  /** Move a câmera para este centro, em pixels do mundo. */
  pan(x: number, y: number): void;
  zoomTo(z: number, sx: number, sy: number): void;
  /** O dedo começou a arrastar: a câmera para de seguir o agente. */
  grabbed(): void;
  /** Há algo tocável aqui, para o cursor virar a mãozinha. */
  hot(w: Pt): boolean;
  tap(w: Pt): void;
};

/** Liga os eventos e devolve a função que os desliga. */
export function attachInput(canvas: HTMLCanvasElement, G: Gestures): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; cx: number; cy: number } | null = null, pinch: { d: number; z: number } | null = null, moved = false, wheelAcc = 0;

  const grab = (x: number, y: number) => { const c = G.cam(); drag = { sx: x, sy: y, cx: c.x, cy: c.y }; };
  const onDown = (e: PointerEvent) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { grab(e.clientX, e.clientY); moved = false; }
    else if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, z: G.cam().zoom };
      drag = null;
      moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) {
      canvas.style.cursor = G.hot(G.at(e.clientX, e.clientY)) ? 'pointer' : 'grab';
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), nz = Math.round((pinch.z * d) / pinch.d);
      if (nz !== G.cam().zoom) { const m = G.at((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); G.zoomTo(nz, m.sx, m.sy); }
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; G.grabbed(); canvas.style.cursor = 'grabbing'; }
      if (moved) { const { zoom, dpr } = G.cam(); G.pan(drag.cx - (dx * dpr) / zoom, drag.cy - (dy * dpr) / zoom); }
    }
  };
  const onUp = (e: PointerEvent) => {
    const tap = pointers.size === 1 && drag && !moved;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (tap) G.tap(G.at(e.clientX, e.clientY));
    if (pointers.size === 0) { drag = null; canvas.style.cursor = 'grab'; }
    else if (pointers.size === 1) { const p = [...pointers.values()][0]; grab(p.x, p.y); moved = true; }
  };
  const onCancel = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = null; drag = null; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 60) return;
    const w = G.at(e.clientX, e.clientY);
    G.zoomTo(G.cam().zoom + (wheelAcc < 0 ? 1 : -1), w.sx, w.sy);
    wheelAcc = 0;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('wheel', onWheel);
  };
}
