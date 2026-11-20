/* Luz por cima da cena: um véu escuro com furos onde há luz, e halos coloridos somados por cima. */
import type { Light } from './art.ts';
import type { Ctx } from './pixel.ts';

/** Câmera em pixels do canvas, para levar as luzes do mundo para a tela. */
export type View = { cw: number; ch: number; zoom: number; offX: number; offY: number };

/**
 * Quanto a cena escurece de dia e quanto a noite soma. O tom multiplica a cena toda.
 * Os valores foram baixados para a casa ficar mais clara; as luzes ainda furam o escuro à noite.
 */
const VEIL = {
  in: { day: 0.1, night: 0.36, tint: 'rgb(228,227,231)' },
  out: { day: 0.05, night: 0.47, tint: 'rgb(206,216,217)' },
};

export function applyLight(ctx: Ctx, layer: HTMLCanvasElement, v: View, lights: Light[], out: boolean, dark: number, dusk: number): void {
  const { cw, ch, zoom, offX, offY } = v, veil = out ? VEIL.out : VEIL.in;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = veil.tint;
  ctx.fillRect(0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
  if (dusk > 0) { ctx.fillStyle = `rgba(58,70,110,${(0.15 * dusk).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
  const lctx = layer.getContext('2d')!, a = veil.day + dark * veil.night;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, cw, ch);
  lctx.fillStyle = `rgba(5,9,14,${a.toFixed(3)})`;
  lctx.fillRect(0, 0, cw, ch);
  lctx.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const sx = offX + l.x * zoom, sy = offY + l.y * zoom, r = l.r * zoom, gr = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    gr.addColorStop(0, `rgba(0,0,0,${l.cut ?? 0.92})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = gr;
    lctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const gk = 0.35 + 0.65 * dark;
  for (const l of lights) {
    const sx = offX + l.x * zoom, sy = offY + l.y * zoom, r = l.r * zoom * 0.8, gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    gr.addColorStop(0, `rgba(${l.c},${(l.g * gk).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${l.c},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
