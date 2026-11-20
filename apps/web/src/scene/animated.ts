/* Arte que muda a cada quadro: monitores, lareira, TV, a floresta pelo vidro e as janelas vistas de fora. */
import type { ForestView, Light } from './art.ts';
import type { Rect, Station } from './layout.ts';
import { type Ctx, glyph, mix, R, rgbOf } from './pixel.ts';
import { FOG_ALPHA, type Sky, tf, type Weather } from './sky.ts';
import type { Walker } from './walker.ts';

/** O que todo desenho animado precisa: onde desenhar, o tempo e se o movimento está reduzido. */
export type Live = { ctx: Ctx; t: number; still: boolean };

/* ---------- monitores ---------- */

function codeScreen({ ctx, t }: Live, s: Rect, i: number): void {
  R(ctx, s.x, s.y, s.w, s.h, i ? '#0b100e' : '#0d1316');
  const rows = Math.floor((s.h - 1) / 2), off = Math.floor(t * (i ? 2.5 : 5)) + i * 11, cols = ['#8cc29b', '#e8a75a', '#8fb3d9', '#c9c3b6'];
  for (let r = 0; r < rows; r++) {
    const sd = Math.imul(off - r, 2654435761) >>> 0, y = s.y + s.h - 2 - r * 2;
    if (i) { R(ctx, s.x + 1, y, 1, 1, sd % 7 === 0 ? '#ef8170' : '#8cc29b'); R(ctx, s.x + 3, y, Math.min(4 + ((sd >>> 4) % 9), s.w - 4), 1, '#56625d'); }
    else { const ind = sd % 3, len = 3 + ((sd >>> 3) % 10); R(ctx, s.x + 1 + ind * 2, y, Math.min(len, s.w - 2 - ind * 2), 1, cols[(sd >>> 7) % cols.length]); }
  }
  if (!i && Math.floor(t * 2.5) % 2 === 0) R(ctx, s.x + s.w - 4, s.y + s.h - 2, 2, 1, '#e7ece9');
}

function assistantScreen({ ctx, t }: Live, s: Rect): void {
  R(ctx, s.x, s.y, s.w, s.h, '#1a2321'); R(ctx, s.x, s.y, s.w, 2, '#2c3b36');
  for (let cx = 0; cx < 3; cx++) for (let cy = 0; cy < 3; cy++) R(ctx, s.x + 1 + cx * 2, s.y + 4 + cy * 2, 1, 1, '#4a5754');
  if (Math.floor(t * 1.5) % 2 === 0) R(ctx, s.x + 3, s.y + 6, 1, 1, '#e8a75a');
  const off = Math.floor(t * 0.7);
  for (let k = 0; k < 3; k++) {
    const idx = off + k, side = idx % 2, len = 4 + ((Math.imul(idx, 40503) >>> 0) % 6);
    R(ctx, side ? s.x + s.w - 1 - len : s.x + 8, s.y + 3 + k * 3, len, 2, side ? '#e8a75a' : '#4a5754');
  }
}

export function drawScreens(live: Live, st: Station, a: Walker | undefined): void {
  if (!a) return;
  const { ctx, t } = live;
  const busy = a.state === 'working' || a.talking;
  st.screens.forEach((s, i) => {
    if (busy) { if (st.kind === 'dual') codeScreen(live, s, i); else assistantScreen(live, s); }
    else if (a.state === 'waiting') { R(ctx, s.x, s.y, s.w, s.h, '#141a1c'); if (i === 0 && Math.floor(t * 2) % 2 === 0) glyph(ctx, '?', s.x + Math.floor(s.w / 2) - 1, s.y + Math.floor((s.h - 5) / 2), '#f0b05e'); }
    else if (a.state === 'error') { R(ctx, s.x, s.y, s.w, s.h, Math.floor(t * 3) % 2 ? '#2a1012' : '#33141a'); glyph(ctx, 'x', s.x + Math.floor(s.w / 2) - 1, s.y + Math.floor((s.h - 5) / 2), '#ef8170'); }
    else {
      R(ctx, s.x, s.y, s.w, s.h, '#0f1517');
      const span = s.w - 3, p = (t * 5 + i * 7) % (span * 2), vs = s.h - 3, q = (t * 3.3 + i * 3) % (vs * 2);
      R(ctx, s.x + 1 + Math.round(p < span ? p : span * 2 - p), s.y + 1 + Math.round(q < vs ? q : vs * 2 - q), 2, 2, '#2c3b36');
    }
    R(ctx, s.x, s.y, s.w, 1, 'rgba(255,255,255,0.05)');
  });
  for (const b of st.bezels) {
    const col = a.state === 'error' ? (Math.floor(t * 4) % 2 ? '#ff5a4a' : '#5a1a14') : a.state === 'waiting' ? '#f0b05e' : '#8cc29b';
    R(ctx, b.x + b.w - 3, b.y + b.h - 2, 1, 1, col);
  }
}

/* ---------- lareira e TV ---------- */

export function drawFire({ ctx, t, still }: Live): void {
  const k = Math.floor(t * (still ? 2 : 10));
  R(ctx, 261, 141, 12, 3, '#4a170a');
  for (let i = 0; i < 12; i++) {
    const s = Math.imul(k + i * 7, 2654435761) >>> 0, h = 3 + (s % 8);
    R(ctx, 261 + i, 144 - h, 1, h, (s >>> 5) % 3 === 0 ? '#f2a64a' : '#c9542a');
    if (h > 6) R(ctx, 261 + i, 144 - h, 1, 2, '#ffd27a');
  }
  R(ctx, 261, 129, 12, 1, 'rgba(255,255,255,0.07)');
}

/** Cores das fases do jogo na TV. Cada corte de cena troca a luz que bate no sofá. */
const GAME = ['96,160,255', '170,116,255', '86,214,168', '255,126,150', '255,198,112', '120,200,255'];

/** Cor da tela agora, como "r,g,b", com um leve tremor de brilho. */
export function tvColor(t: number, still: boolean): { c: string; k: number } {
  // com movimento reduzido, a cena do jogo troca bem mais devagar
  const scene = Math.floor(t / (still ? 8 : 1.7)), s = Math.imul(scene + 3, 2654435761) >>> 0;
  const c = GAME[s % GAME.length], k = still ? 1 : 0.86 + 0.14 * (((Math.imul(Math.floor(t * 12), 40503) >>> 0) % 100) / 100);
  return { c, k };
}

export const tvLight = (t: number, still: boolean): Light => {
  const { c, k } = tvColor(t, still);
  return { x: 232, y: 154, r: 58, c, g: 0.34 * k, cut: 0.82 * k };
};

/** A tela fica virada para o sofá. No chão, antes dos móveis, aparece o reflexo dela em volta da TV. */
export function drawTvSpill({ ctx, t, still }: Live): void {
  const { c, k } = tvColor(t, still), gr = ctx.createRadialGradient(232, 164, 0, 232, 164, 36);
  gr.addColorStop(0, `rgba(${c},${(0.22 * k).toFixed(3)})`);
  gr.addColorStop(1, `rgba(${c},0)`);
  ctx.save();
  ctx.fillStyle = gr;
  // achatado na vertical, como luz deitada no chão
  ctx.translate(0, 164 * 0.45);
  ctx.scale(1, 0.55);
  ctx.fillRect(196, 128, 72, 72);
  ctx.restore();
}

/** Por cima da TV: a luz da tela escapa pela borda de cima e pelos lados. */
export function drawTv({ ctx, t, still }: Live): void {
  const { c, k } = tvColor(t, still);
  ctx.fillStyle = `rgba(${c},${(0.8 * k).toFixed(3)})`;
  ctx.fillRect(219, 159, 26, 1);
  ctx.fillStyle = `rgba(${c},${(0.45 * k).toFixed(3)})`;
  ctx.fillRect(217, 160, 1, 15); ctx.fillRect(246, 160, 1, 15); ctx.fillRect(218, 158, 28, 1);
}

/* ---------- vista pelo vidro ---------- */

export function forestView({ ctx, t, still }: Live, views: ForestView[], S: Sky, weather: Weather): void {
  const fogC = mix('#a6b2b2', '#1c262a', S.dark), farC = mix(mix('#56665f', '#0b1214', S.dark), fogC, 0.18), nearC = mix('#1f3029', '#060a0b', S.dark);
  for (const { rect, far, near } of views) {
    const rx = rect.x, rw = rect.w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, 4, rw, 40);
    ctx.clip();
    for (let y = 4; y < 44; y += 4) R(ctx, rx, y, rw, 4, mix(S.top, S.bot, (y - 4) / 40));
    for (const tr of far) for (let r = 0; r < tr.h; r++) { const w = Math.round(r * 0.28) + 1; R(ctx, rx + tr.x - w, 40 - tr.h + r, w * 2, 1, farC); }
    ctx.fillStyle = `rgba(${rgbOf(fogC)},${FOG_ALPHA[weather].glass})`;
    ctx.fillRect(rx, 22, rw, 14);
    for (const tr of near) for (let r = 0; r < tr.h; r++) { const w = Math.round(r * 0.32) + 1; R(ctx, rx + tr.x - w, 44 - tr.h + r, w * 2, 1, nearC); }
    R(ctx, rx, 41, rw, 3, mix('#1f2621', '#050707', S.dark));
    if (weather === 'rain' && !still) {
      for (let i = 0; i < Math.round((28 * rw) / 214); i++) R(ctx, rx + ((i * 37) % rw), Math.floor(4 + ((t * 28 + i * 13) % 38)), 1, 2, 'rgba(200,215,220,0.35)');
    }
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = rx + 12; x < rx + rw; x += 36) ctx.fillRect(x, 4, 6, 40);
    ctx.restore();
  }
}

/* ---------- janelas vistas de fora ---------- */

export function windowsOut({ ctx }: Live, h: number, panes: Rect[], door: Rect, stations: Station[], walkers: Map<string, Walker>): void {
  const { dark } = tf(h), base = mix('#a8773f', '#f2b25c', dark), hi = mix('#c99558', '#ffd994', dark);
  panes.forEach((p, i) => {
    R(ctx, p.x, p.y, p.w, p.h, base); R(ctx, p.x, p.y, p.w, 2, hi);
    if (i % 5 === 1) R(ctx, p.x + p.w - 5, p.y + p.h - 9, 3, 9, 'rgba(30,20,12,0.5)');
    if (i % 4 === 0) R(ctx, p.x + 6, p.y + 3, 2, 2, '#fff1c8');
    if (dark < 0.5) R(ctx, p.x + 2, p.y + 2, 1, p.h - 4, 'rgba(200,220,225,0.25)');
  });
  R(ctx, door.x, door.y, door.w, door.h, base); R(ctx, door.x, door.y, door.w, 2, hi); R(ctx, door.x + door.w - 4, door.y + 16, 1, 4, '#d9d2c4');
  for (const st of stations) {
    const a = st.agentId ? walkers.get(st.agentId) : undefined;
    if (a && (a.state === 'working' || a.state === 'error')) {
      R(ctx, st.outside.x, st.outside.y, 6, 10, 'rgba(18,12,8,0.75)');
      R(ctx, st.outside.x + 1, st.outside.y - 4, 4, 4, 'rgba(18,12,8,0.75)');
    }
  }
}
