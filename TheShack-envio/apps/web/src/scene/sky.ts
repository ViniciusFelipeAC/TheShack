/* Hora de São Paulo, cor do céu e neblina. A cena escurece à noite e clareia de dia. */
import type { Rect } from './layout.ts';
import { clamp, type Ctx, mix, mk, rng } from './pixel.ts';

export type Weather = 'fog' | 'rain' | 'clear';
export type Sky = { top: string; bot: string; dark: number; dusk: number };

let spFmt: Intl.DateTimeFormat | null = null;
try { spFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { /* sem fusos no navegador */ }

export function spHour(): number {
  if (!spFmt) { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  let h = 0, m = 0;
  for (const p of spFmt.formatToParts(new Date())) { if (p.type === 'hour') h = +p.value; if (p.type === 'minute') m = +p.value; }
  return (h % 24) + m / 60;
}

export function tf(h: number): { dark: number; dusk: number } {
  let dark = 0;
  if (h >= 19 || h < 5) dark = 1; else if (h >= 17) dark = (h - 17) / 2; else if (h < 7) dark = 1 - (h - 5) / 2;
  const dusk = clamp(Math.max(1 - Math.abs(h - 18) / 1.3, (1 - Math.abs(h - 6) / 1.1) * 0.7), 0, 1);
  return { dark, dusk };
}

export function sky(h: number): Sky {
  const { dark, dusk } = tf(h);
  let top = mix('#a9b5b6', '#0c1216', dark), bot = mix('#d2dad8', '#152026', dark);
  if (dusk > 0) { top = mix(top, '#4a5566', dusk * 0.6); bot = mix(bot, '#7d7480', dusk * 0.5); }
  return { top, bot, dark, dusk };
}

/** Força da neblina em cada clima. Lá fora ela pesa um pouco mais que em volta da casa. */
export const FOG_ALPHA: Record<Weather, { out: number; around: number; glass: number }> = {
  fog: { out: 0.26, around: 0.22, glass: 0.14 },
  rain: { out: 0.16, around: 0.13, glass: 0.1 },
  clear: { out: 0.05, around: 0.05, glass: 0.05 },
};

export function buildFog(): HTMLCanvasElement {
  const [c, g] = mk(160, 90);
  g.imageSmoothingEnabled = true;
  const r = rng(77);
  for (let i = 0; i < 60; i++) {
    const x = r() * 160, y = r() * 90, rad = 8 + r() * 22;
    for (const ox of [-160, 0, 160]) for (const oy of [-90, 0, 90]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, 'rgba(196,208,210,0.2)');
      gr.addColorStop(1, 'rgba(196,208,210,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  return c;
}

/** Duas camadas de neblina deslizando em sentidos opostos, cobrindo o retângulo do mundo pedido. */
export function drawFog(ctx: Ctx, fog: HTMLCanvasElement, area: Rect, alpha: number, t: number, still: boolean): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ([[still ? 0 : 6, 1], [still ? 0 : -3.5, 0.7]] as const).forEach(([v, k], li) => {
    ctx.globalAlpha = alpha * k;
    const ox = (((t * v + li * 90) % 320) + 320) % 320, oy = li * 40 - 90;
    const x0 = Math.floor((area.x + ox) / 320) * 320 - ox, y0 = Math.floor((area.y - oy) / 180) * 180 + oy;
    for (let x = x0; x < area.x + area.w; x += 320) for (let y = y0; y < area.y + area.h; y += 180) ctx.drawImage(fog, x, y, 320, 180);
  });
  ctx.restore();
}
