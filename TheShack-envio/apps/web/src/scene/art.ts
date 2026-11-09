/* Arte estática da casa, feita em código: chão, paredes, móveis e a vista de fora.
   Tudo é desenhado uma vez em canvases fora da tela; só telas, fogo, luz e neblina mudam a cada quadro. */
import { ANNEX_PX, annexX, type HouseLayout, type Rect, type Station, T, wingLeft } from './layout.ts';
import { circle, type Ctx, ellipse, mk, R, rng } from './pixel.ts';

export type Furniture = { x: number; y: number; img: HTMLCanvasElement; sortY: number; extra?: () => void };
export type Light = { x: number; y: number; r: number; c: string; g: number; cut?: number };
export type ForestView = { rect: Rect; far: Array<{ x: number; h: number }>; near: Array<{ x: number; h: number }> };

const FLOOR = '#36281f';

function planks(g: Ctx, r: () => number, x0: number, x1: number): void {
  const w = x1 - x0;
  for (let y = 48; y < 192; y += 4) {
    R(g, x0, y, w, 4, (y / 4) % 2 ? '#3b2c23' : FLOOR);
    R(g, x0, y, w, 1, '#2a1e17');
    let x = x0 + Math.floor(r() * 40);
    while (x < x1) { R(g, x, y + 1, 1, 3, '#2a1e17'); x += 26 + Math.floor(r() * 38); }
    for (let k = 0; k < Math.round(w / 48); k++) {
      R(g, x0 + Math.floor(r() * (w - 2)), y + 1 + Math.floor(r() * 3), 2 + Math.floor(r() * 4), 1, r() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,220,180,0.05)');
    }
  }
}

/** Parede lateral vista de cima. Uma parede entre dois cômodos tem acabamento dos dois lados e uma passagem. */
function sideWall(g: Ctx, x: number, H: number, faces: 'left' | 'right' | 'both', doorway: boolean): void {
  R(g, x, 0, 16, H, '#070909');
  if (faces !== 'left') { R(g, x, 0, 6, H, '#16191c'); R(g, x, 0, 1, H, '#2a2f33'); }
  if (faces !== 'right') { R(g, x + 10, 0, 6, H, '#16191c'); R(g, x + 15, 0, 1, H, '#2a2f33'); }
  if (!doorway) return;
  R(g, x, 80, 16, 48, FLOOR);
  for (let y = 80; y < 128; y += 4) R(g, x, y, 16, 1, '#2a1e17');
  R(g, x + 2, 80, 12, 48, 'rgba(255,220,180,0.03)');
  R(g, x, 78, 16, 2, '#0e1012');
  R(g, x, 128, 16, 2, '#0e1012');
}

export function buildInterior(L: HouseLayout): HTMLCanvasElement {
  const W = L.w * T, H = L.h * T;
  const [c, g] = mk(W, H);
  const r = rng(7);
  R(g, 0, 0, W, H, '#0b0f10');
  planks(g, r, 16, 304);
  // tapete da sala: carvão com losangos ferrugem
  R(g, 48, 112, 80, 64, '#141618'); R(g, 50, 114, 76, 60, '#25282b'); R(g, 50, 124, 76, 1, '#8a4a32'); R(g, 50, 163, 76, 1, '#8a4a32');
  for (let x = 56; x < 120; x += 12) {
    for (let d = -5; d <= 5; d++) { const w = 5 - Math.abs(d); R(g, x + 6 - w, 144 + d, w * 2 + 1, 1, '#6e3c2a'); }
    for (let d = -2; d <= 2; d++) { const w = 2 - Math.abs(d); R(g, x + 6 - w, 144 + d, w * 2 + 1, 1, '#25282b'); }
  }
  for (let y = 114; y < 174; y += 2) { R(g, 46, y, 2, 1, '#5d5a54'); R(g, 128, y, 2, 1, '#5d5a54'); }
  // tapete do sofá e capacho
  R(g, 196, 162, 72, 28, '#18241f'); R(g, 198, 164, 68, 24, '#22322b');
  for (let x = 203; x < 264; x += 8) for (let y = 168; y < 186; y += 8) R(g, x, y, 2, 2, '#2c4038');
  // dois controles largados no tapete, um de cada lado da TV
  for (const [x, y, b] of [[208, 165, '#d9534f'], [250, 167, '#4f8fd9']] as const) {
    R(g, x + 1, y, 5, 1, '#3c4048'); R(g, x, y + 1, 7, 2, '#2a2d33'); R(g, x, y + 3, 2, 1, '#2a2d33'); R(g, x + 5, y + 3, 2, 1, '#2a2d33');
    R(g, x + 1, y + 1, 1, 1, '#5a5f66'); R(g, x + 5, y + 1, 1, 1, b); R(g, x + 4, y + 2, 1, 1, '#d9c34f'); R(g, x, y + 4, 7, 1, 'rgba(0,0,0,0.25)');
  }
  R(g, 146, 178, 28, 12, '#1a1714'); R(g, 148, 180, 24, 8, '#2a241f'); R(g, 148, 183, 24, 1, '#1a1714'); R(g, 148, 186, 24, 1, '#1a1714');
  // parede de cima: vidro (pintado a cada quadro) e um trecho de madeira escura com arandela
  R(g, 16, 0, 224, 44, '#0f1517');
  for (let x = 240; x < 304; x += 4) { R(g, x, 0, 4, 44, (x / 4) % 2 ? '#2e221c' : '#2a1f19'); R(g, x, 0, 1, 44, '#1f1712'); }
  R(g, 262, 12, 6, 8, '#16181b'); R(g, 263, 13, 4, 6, '#d9a24a');
  R(g, 16, 44, 288, 4, '#15181b'); R(g, 16, 44, 288, 1, '#2a2f33');
  R(g, 16, 48, 288, 3, 'rgba(0,0,0,0.3)');
  sideWall(g, 0, H, 'left', false);
  R(g, 16, 192, 288, 16, '#070909'); R(g, 10, 192, 300, 6, '#16191c'); R(g, 16, 192, 288, 1, '#2a2f33');

  for (let k = 0; k < L.wings; k++) {
    const ox = wingLeft(k) * T;
    planks(g, r, ox + 16, ox + 176);
    // tapete listrado entre as mesas
    R(g, ox + 64, 112, 80, 56, '#141618'); R(g, ox + 66, 114, 76, 52, '#1f2a26');
    for (let y = 120; y < 164; y += 8) R(g, ox + 66, y, 76, 1, '#2c4038');
    for (let y = 114; y < 166; y += 2) { R(g, ox + 62, y, 2, 1, '#5d5a54'); R(g, ox + 144, y, 2, 1, '#5d5a54'); }
    R(g, ox + 16, 0, 160, 44, '#0f1517');
    R(g, ox + 16, 44, 160, 4, '#15181b'); R(g, ox + 16, 44, 160, 1, '#2a2f33');
    R(g, ox + 16, 48, 160, 3, 'rgba(0,0,0,0.3)');
    R(g, ox + 16, 192, 160, 16, '#070909'); R(g, ox + 10, 192, 172, 6, '#16191c'); R(g, ox + 16, 192, 160, 1, '#2a2f33');
  }
  // paredes entre cômodos e a parede da direita
  for (let k = 0; k < L.wings; k++) sideWall(g, wingLeft(k) * T, H, 'both', true);
  sideWall(g, W - 16, H, 'right', false);

  // vão da porta: chão da floresta lá fora
  R(g, 144, 192, 32, 16, FLOOR); R(g, 144, 196, 32, 3, '#16191c'); R(g, 144, 199, 32, 9, '#24231d'); R(g, 144, 199, 32, 1, '#1a1a15');
  R(g, 150, 203, 2, 1, '#3a5236'); R(g, 163, 205, 3, 1, '#3a5236'); R(g, 170, 202, 1, 2, '#4a6b45');
  R(g, 142, 192, 2, 8, '#0e1012'); R(g, 176, 192, 2, 8, '#0e1012');
  return c;
}

/** Caixilhos do vidro, desenhados por cima da vista da floresta. */
export function buildFrame(L: HouseLayout): HTMLCanvasElement {
  const [c, g] = mk(L.w * T, 48);
  R(g, 16, 0, 224, 4, '#0d0f11'); R(g, 16, 4, 224, 1, '#22262a');
  for (const x of [16, 52, 88, 124, 160, 196]) { R(g, x, 0, 2, 44, '#0d0f11'); R(g, x + 2, 4, 1, 40, 'rgba(255,255,255,0.05)'); }
  R(g, 232, 0, 8, 44, '#0d0f11'); R(g, 18, 30, 214, 2, '#0d0f11'); R(g, 18, 32, 214, 1, 'rgba(255,255,255,0.05)');
  for (let k = 0; k < L.wings; k++) {
    const ox = wingLeft(k) * T;
    R(g, ox + 16, 0, 160, 4, '#0d0f11'); R(g, ox + 16, 4, 160, 1, '#22262a');
    for (const x of [16, 56, 96, 136]) { R(g, ox + x, 0, 2, 44, '#0d0f11'); R(g, ox + x + 2, 4, 1, 40, 'rgba(255,255,255,0.05)'); }
    R(g, ox + 170, 0, 6, 44, '#0d0f11'); R(g, ox + 18, 30, 152, 2, '#0d0f11'); R(g, ox + 18, 32, 152, 1, 'rgba(255,255,255,0.05)');
  }
  return c;
}

/** Trechos de vidro da parede de cima, cada um com a sua floresta ao fundo. */
export function forestViews(L: HouseLayout): ForestView[] {
  const rects: Rect[] = [{ x: 18, y: 4, w: 214, h: 40 }];
  for (let k = 0; k < L.wings; k++) rects.push({ x: wingLeft(k) * T + 18, y: 4, w: 152, h: 40 });
  return rects.map((rect, i) => {
    const r = rng(21 + i * 13), far: ForestView['far'] = [], near: ForestView['near'] = [];
    for (let x = 4; x < rect.w + 6; x += 6 + Math.floor(r() * 6)) far.push({ x, h: 12 + Math.floor(r() * 12) });
    for (let x = 10; x < rect.w + 6; x += 20 + Math.floor(r() * 14)) near.push({ x, h: 24 + Math.floor(r() * 14) });
    return { rect, far, near };
  });
}

/* ---------- móveis, ordenados por Y junto com os personagens ---------- */

function chair(g: Ctx, cx: number, cy: number): void {
  R(g, cx - 5, cy - 9, 10, 8, '#15171a'); R(g, cx - 4, cy - 8, 8, 6, '#202328'); R(g, cx - 5, cy - 9, 10, 1, '#2e3238');
  for (let x = cx - 3; x < cx + 4; x += 2) R(g, x, cy - 7, 1, 4, '#1a1c20');
  R(g, cx - 1, cy - 1, 2, 2, '#0e1012'); R(g, cx - 5, cy + 1, 10, 1, '#0e1012'); R(g, cx - 6, cy + 1, 1, 1, '#08090a'); R(g, cx + 5, cy + 1, 1, 1, '#08090a');
}

function leaf(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  R(g, x + 1, y, w - 2, h, c); R(g, x, y + 1, w, h - 2, c); R(g, x + 1, y + 1, 2, 1, '#5a8f5d');
}

/** Mesa de madeira com um monitor, luminária, xícara e caderno. */
function deskSingle(g: Ctx, cx: number): void {
  R(g, cx - 23, 62, 46, 2, 'rgba(0,0,0,0.35)'); R(g, cx - 22, 53, 2, 10, '#0e1012'); R(g, cx + 20, 53, 2, 10, '#0e1012');
  R(g, cx + 6, 53, 13, 10, '#16181b'); R(g, cx + 6, 58, 13, 1, '#22262a'); R(g, cx + 11, 55, 3, 1, '#b08a4a'); R(g, cx + 11, 60, 3, 1, '#b08a4a');
  R(g, cx - 24, 45, 48, 7, '#4a3628'); R(g, cx - 24, 45, 48, 1, '#5c4434'); R(g, cx - 24, 51, 48, 2, '#2a1e17');
  R(g, cx - 12, 26, 24, 16, '#0e1012'); R(g, cx - 11, 27, 22, 14, '#1a1d21'); R(g, cx - 2, 42, 4, 4, '#1a1d21'); R(g, cx - 6, 46, 12, 1, '#0e1012');
  R(g, cx - 21, 47, 6, 2, '#16181b'); R(g, cx - 19, 37, 1, 10, '#b08a4a'); R(g, cx - 19, 37, 4, 1, '#b08a4a');
  R(g, cx - 17, 35, 6, 3, '#c7913f'); R(g, cx - 17, 35, 6, 1, '#d9a24a'); R(g, cx - 16, 38, 4, 1, '#ffe0a6');
  R(g, cx + 7, 46, 4, 4, '#cfc9bd'); R(g, cx + 11, 47, 1, 2, '#cfc9bd'); R(g, cx + 7, 46, 4, 1, '#4a2f20');
  R(g, cx + 13, 46, 8, 5, '#2c3b36'); R(g, cx + 13, 46, 8, 1, '#3a4d47'); R(g, cx + 14, 47, 1, 4, '#e8a75a');
}

/** Mesa preta com dois monitores, teclado com luz, caneca e um cacto. */
function deskDual(g: Ctx, cx: number): void {
  R(g, cx - 23, 62, 46, 2, 'rgba(0,0,0,0.35)'); R(g, cx - 22, 53, 2, 10, '#0b0c0e'); R(g, cx + 20, 53, 2, 10, '#0b0c0e');
  R(g, cx - 24, 45, 48, 7, '#16181b'); R(g, cx - 24, 45, 48, 1, '#2a2e33'); R(g, cx - 24, 51, 48, 2, '#0b0c0e');
  for (const bx of [cx - 22, cx + 1]) { R(g, bx, 26, 22, 15, '#0b0c0e'); R(g, bx + 1, 27, 20, 13, '#181b1f'); }
  R(g, cx - 2, 41, 4, 4, '#181b1f'); R(g, cx - 8, 45, 16, 1, '#0b0c0e');
  R(g, cx - 10, 47, 20, 3, '#0f1113'); R(g, cx - 9, 47, 18, 1, '#24282d');
  for (let x = cx - 9; x < cx + 9; x += 2) R(g, x, 48, 1, 1, 'rgba(232,167,90,0.55)');
  R(g, cx + 13, 48, 3, 2, '#0f1113'); R(g, cx - 19, 45, 3, 5, '#8a949c'); R(g, cx - 19, 47, 3, 1, '#2c3b36');
  R(g, cx + 18, 47, 4, 3, '#2a2d31'); R(g, cx + 19, 43, 2, 4, '#447a4b'); R(g, cx + 18, 44, 1, 2, '#447a4b');
}

function concreteVase(g: Ctx, px: number): void {
  R(g, px - 6, 190, 13, 2, 'rgba(0,0,0,0.3)'); R(g, px - 5, 183, 10, 8, '#474b4e'); R(g, px - 6, 182, 12, 2, '#5a5f63');
  circle(g, px, 176, 7, '#2c5234'); circle(g, px - 2, 174, 4, '#376640'); circle(g, px + 3, 177, 3, '#376640'); R(g, px - 3, 172, 2, 1, '#5a8f5d');
}

export function buildFurniture(L: HouseLayout, hooks: { screens(s: Station): void; fire(): void; tv(): void }): Furniture[] {
  const F: Furniture[] = [];
  const add = (x: number, y: number, w: number, h: number, sortY: number, fn: (g: Ctx) => void, extra?: () => void) => {
    const [c, g] = mk(w, h);
    g.translate(-x, -y);
    fn(g);
    F.push({ x, y, img: c, sortY, extra });
  };

  for (const s of L.stations) {
    add(s.cx - 26, 22, 52, 44, 64, (g) => (s.kind === 'dual' ? deskDual(g, s.cx) : deskSingle(g, s.cx)), s.agentId ? () => hooks.screens(s) : undefined);
    add(s.cx - 8, 52, 16, 16, 66.5, (g) => chair(g, s.cx, 66));
  }

  add(76, 26, 56, 40, 64, (g) => { // ilha da cozinha com cafeteira
    R(g, 81, 62, 46, 2, 'rgba(0,0,0,0.3)');
    R(g, 80, 52, 48, 11, '#141618'); R(g, 103, 53, 1, 10, '#202327'); R(g, 100, 56, 1, 3, '#b08a4a'); R(g, 106, 56, 1, 3, '#b08a4a'); R(g, 80, 62, 48, 1, '#0b0c0e');
    R(g, 79, 45, 50, 7, '#474b4e'); R(g, 79, 45, 50, 1, '#5a5f63'); R(g, 79, 51, 50, 1, '#33373a');
    R(g, 104, 30, 14, 17, '#2a2d31'); R(g, 104, 30, 14, 2, '#3a3e43'); R(g, 106, 35, 10, 7, '#151719'); R(g, 110, 35, 2, 2, '#b08a4a'); R(g, 107, 41, 8, 1, '#8a8f95'); R(g, 109, 38, 4, 3, '#cfc9bd'); R(g, 115, 32, 1, 1, '#e8a75a');
    R(g, 86, 38, 6, 8, '#5d6a6e'); R(g, 87, 41, 4, 4, '#3a2418'); R(g, 86, 37, 6, 1, '#8a8f95');
    R(g, 121, 42, 6, 4, '#2a2d31'); R(g, 122, 38, 4, 4, '#447a4b'); R(g, 121, 39, 1, 2, '#376640'); R(g, 126, 38, 1, 2, '#376640');
    R(g, 94, 42, 3, 3, '#cfc9bd'); R(g, 98, 42, 3, 3, '#8a4a32');
  });
  add(126, 16, 20, 50, 63.5, (g) => { // figueira
    R(g, 130, 62, 12, 2, 'rgba(0,0,0,0.3)'); R(g, 131, 53, 10, 9, '#1a1c1f'); R(g, 130, 52, 12, 2, '#2a2d31'); R(g, 135, 30, 2, 22, '#3a2a20');
    for (const [x, y, w, h, c] of [[129, 25, 7, 5, '#2c5234'], [136, 21, 7, 6, '#376640'], [131, 32, 7, 5, '#376640'], [137, 30, 7, 5, '#2c5234'], [130, 40, 6, 4, '#2c5234'], [137, 39, 6, 5, '#376640'], [133, 17, 5, 5, '#447a4b']] as const) leaf(g, x, y, w, h, c);
  });
  add(254, 0, 36, 66, 64, (g) => { // estante
    R(g, 257, 62, 30, 2, 'rgba(0,0,0,0.35)'); R(g, 256, 6, 32, 58, '#2e2119'); R(g, 256, 6, 32, 1, '#3e2d22'); R(g, 259, 9, 26, 52, '#160f0b');
    const r = rng(11), cols = ['#6b2f2f', '#2f4a3f', '#8a6a3a', '#2e3e55', '#a9a294', '#5a3f2c', '#4a3b55', '#3d5a44'];
    for (const sy of [21, 34, 47, 60]) {
      R(g, 259, sy, 26, 2, '#3e2d22');
      let x = 260;
      while (x < 283) {
        const w = 2 + Math.floor(r() * 3), h = 8 + Math.floor(r() * 4);
        if (x + w > 284) break;
        R(g, x, sy - h, w, h, cols[Math.floor(r() * cols.length)]); R(g, x, sy - h, w, 1, 'rgba(255,255,255,0.12)');
        x += w + (r() < 0.2 ? 2 : 0);
      }
    }
    R(g, 264, 3, 6, 3, '#2a2d31'); R(g, 262, 0, 4, 3, '#376640'); R(g, 267, 0, 4, 3, '#447a4b'); R(g, 262, 3, 1, 5, '#2c5234');
  });
  add(284, 24, 24, 42, 63.5, (g) => { // costela-de-adão
    R(g, 289, 62, 14, 2, 'rgba(0,0,0,0.3)'); R(g, 290, 53, 12, 9, '#474b4e'); R(g, 289, 52, 14, 2, '#5a5f63'); R(g, 295, 44, 2, 9, '#2c4a30');
    for (const [x, y, w, h, c] of [[286, 34, 10, 8, '#2c5234'], [294, 28, 10, 9, '#376640'], [288, 42, 9, 7, '#376640'], [296, 39, 9, 8, '#2c5234'], [291, 25, 7, 6, '#447a4b']] as const) {
      leaf(g, x, y, w, h, c); R(g, x + 3, y + 2, 1, 2, '#1e3a22'); R(g, x + w - 3, y + 3, 1, 2, '#1e3a22');
    }
  });
  add(202, 118, 60, 44, 140, (g) => { // sofá de veludo verde
    R(g, 208, 156, 48, 3, 'rgba(0,0,0,0.35)');
    R(g, 210, 123, 44, 15, '#2b443a'); R(g, 210, 123, 44, 2, '#3a5a4d'); R(g, 224, 127, 1, 8, '#22382f'); R(g, 239, 127, 1, 8, '#22382f');
    R(g, 206, 130, 7, 26, '#2f4a3f'); R(g, 206, 130, 7, 2, '#41624f'); R(g, 251, 130, 7, 26, '#2f4a3f'); R(g, 251, 130, 7, 2, '#41624f');
    for (let i = 0; i < 3; i++) { R(g, 213 + i * 13, 137, 12, 9, '#335246'); R(g, 213 + i * 13, 137, 12, 1, '#44695a'); R(g, 224 + i * 13, 137, 1, 9, '#2a463b'); }
    R(g, 210, 146, 44, 9, '#2b443a'); R(g, 210, 154, 44, 1, '#1d3029'); R(g, 211, 155, 2, 2, '#0e0b09'); R(g, 251, 155, 2, 2, '#0e0b09');
    R(g, 241, 127, 9, 8, '#8a4a2e'); R(g, 241, 127, 9, 1, '#a55c3a');
  });
  add(256, 86, 20, 70, 154, (g) => { // lareira de aço preto
    R(g, 259, 152, 16, 3, 'rgba(0,0,0,0.4)'); R(g, 258, 150, 18, 4, '#202327'); R(g, 258, 150, 18, 1, '#33373c');
    R(g, 265, 88, 4, 30, '#0d0f11'); R(g, 266, 88, 1, 30, '#25292e');
    R(g, 259, 118, 16, 32, '#121417'); R(g, 260, 118, 14, 1, '#2a2e33'); R(g, 259, 119, 1, 30, '#24282d');
    R(g, 261, 129, 12, 15, '#060707');
  }, hooks.fire);
  add(204, 158, 56, 36, 190, (g) => { // rack com a TV de costas para nós, virada para o sofá, e o videogame
    R(g, 207, 189, 50, 2, 'rgba(0,0,0,0.4)'); R(g, 208, 189, 2, 2, '#120d0a'); R(g, 254, 189, 2, 2, '#120d0a');
    R(g, 206, 180, 52, 9, '#2a1f19'); R(g, 206, 184, 52, 1, '#221913'); R(g, 206, 180, 1, 9, '#352820'); R(g, 231, 181, 1, 7, '#1a1310');
    R(g, 206, 177, 52, 3, '#4a3628'); R(g, 206, 177, 52, 1, '#5c4434');
    R(g, 218, 160, 28, 17, '#16181b'); R(g, 218, 160, 28, 1, '#2b2f35'); R(g, 218, 160, 1, 17, '#23262b'); R(g, 218, 176, 28, 1, '#0d0e10');
    R(g, 223, 163, 18, 11, '#1d2024'); R(g, 223, 163, 18, 1, '#2c3036');
    for (let y = 165; y < 172; y += 2) for (let x = 226; x < 239; x += 3) R(g, x, y, 2, 1, '#0f1113');
    R(g, 237, 171, 3, 2, '#3a3e44'); R(g, 229, 176, 6, 2, '#1d2024'); R(g, 225, 177, 14, 2, '#25282d'); R(g, 233, 177, 1, 4, '#0e0f11');
    // o console branco com a faixa de luz, e a pilha de jogos do outro lado
    R(g, 207, 173, 11, 4, '#d6d8dc'); R(g, 207, 173, 11, 1, '#eceef0'); R(g, 207, 177, 11, 2, '#9ea3aa'); R(g, 208, 175, 5, 1, '#7fb2ff');
    R(g, 209, 177, 1, 1, '#2a2d31'); R(g, 212, 177, 2, 1, '#2a2d31'); R(g, 216, 177, 1, 1, '#2a2d31');
    for (const [y, c] of [[175, '#2e5a8a'], [173, '#8a2e3a'], [171, '#3a7a4a']] as const) { R(g, 248, y, 9, 2, c); R(g, 248, y, 9, 1, 'rgba(255,255,255,0.18)'); R(g, 256, y, 1, 2, '#e8e1d2'); }
  }, hooks.tv);
  add(14, 160, 20, 34, 191, (g) => { // espada-de-são-jorge
    R(g, 18, 190, 12, 2, 'rgba(0,0,0,0.3)'); R(g, 19, 183, 10, 8, '#1a1c1f'); R(g, 18, 182, 12, 2, '#2a2d31');
    R(g, 20, 170, 2, 12, '#2c5234'); R(g, 23, 165, 2, 17, '#376640'); R(g, 26, 169, 2, 13, '#2c5234'); R(g, 21, 168, 1, 4, '#9a9a5a'); R(g, 24, 163, 1, 3, '#9a9a5a');
  });
  add(286, 160, 22, 34, 191, (g) => concreteVase(g, 296));

  for (let k = 0; k < L.wings; k++) {
    const ox = wingLeft(k) * T, ax = ox + 40; // centro da poltrona
    add(ox + 16, 84, 18, 62, 142, (g) => { // luminária de pé
      R(g, ox + 21, 141, 9, 2, 'rgba(0,0,0,0.35)'); R(g, ox + 22, 139, 7, 3, '#16181b'); R(g, ox + 25, 96, 1, 43, '#202327');
      R(g, ox + 20, 86, 11, 10, '#c7a26a'); R(g, ox + 20, 86, 11, 1, '#e0bf86'); R(g, ox + 21, 95, 9, 1, '#ffe0a6');
    });
    add(ax - 14, 118, 28, 44, 140, (g) => { // poltrona de couro
      R(g, ax - 11, 156, 22, 3, 'rgba(0,0,0,0.35)');
      R(g, ax - 9, 123, 18, 15, '#5a3326'); R(g, ax - 9, 123, 18, 2, '#7a4a36');
      R(g, ax - 13, 130, 5, 26, '#4e2c21'); R(g, ax - 13, 130, 5, 2, '#6b4030'); R(g, ax + 8, 130, 5, 26, '#4e2c21'); R(g, ax + 8, 130, 5, 2, '#6b4030');
      R(g, ax - 8, 137, 16, 9, '#653a2b'); R(g, ax - 8, 137, 16, 1, '#7f4c38');
      R(g, ax - 8, 146, 16, 9, '#5a3326'); R(g, ax - 8, 154, 16, 1, '#3a2018'); R(g, ax - 12, 155, 2, 2, '#0e0b09'); R(g, ax + 10, 155, 2, 2, '#0e0b09');
    });
    add(ox + 150, 16, 24, 50, 63.5, (g) => { // figueira do canto
      const cx = ox + 168;
      R(g, cx - 6, 62, 12, 2, 'rgba(0,0,0,0.3)'); R(g, cx - 5, 53, 10, 9, '#474b4e'); R(g, cx - 6, 52, 12, 2, '#5a5f63'); R(g, cx - 1, 30, 2, 22, '#3a2a20');
      for (const [x, y, w, h, c] of [[-7, 25, 7, 5, '#2c5234'], [0, 21, 7, 6, '#376640'], [-5, 32, 7, 5, '#376640'], [1, 30, 6, 5, '#2c5234'], [-6, 40, 6, 4, '#2c5234'], [0, 39, 6, 5, '#376640'], [-3, 17, 5, 5, '#447a4b']] as const) leaf(g, cx + x, y, w, h, c);
    });
    add(ox + 158, 160, 22, 34, 191, (g) => concreteVase(g, ox + 168));
  }
  return F;
}

/** Luzes fixas do interior: luminárias, arandela, lareira e a claridade que entra pelo vidro. */
export function interiorLights(L: HouseLayout, flicker: number): Light[] {
  const lights: Light[] = [
    { x: 265, y: 16, r: 28, c: '255,190,110', g: 0.18 },
    { x: 267, y: 138, r: 62 + flicker, c: '255,150,70', g: 0.3 },
  ];
  for (const s of L.stations) if (s.kind === 'single') lights.push({ x: s.cx - 16, y: 37, r: 40, c: '255,190,110', g: 0.22 });
  for (let k = 0; k < L.wings; k++) lights.push({ x: wingLeft(k) * T + 25, y: 92, r: 46, c: '255,190,110', g: 0.24 });
  for (const v of forestViews(L)) for (let x = v.rect.x + 17; x < v.rect.x + v.rect.w; x += 36) lights.push({ x, y: 30, r: 30, c: '170,195,210', g: 0.04, cut: 0.45 });
  return lights;
}

/* ---------- exterior ---------- */

export const BOLLARDS = [{ x: 220, y: 252 }, { x: 264, y: 276 }, { x: 224, y: 302 }];

/** Vidros da fachada que acendem à noite, e o vidro da porta. */
export function exteriorPanes(L: HouseLayout): { panes: Rect[]; door: Rect } {
  const panes: Rect[] = [];
  for (const x of [168, 186, 204, 222, 240, 258, 276, 294]) panes.push({ x, y: 115, w: 16, h: 16 }, { x, y: 133, w: 16, h: 15 });
  for (const x of [166, 186, 206, 256, 276, 296]) panes.push({ x, y: 160, w: 18, h: 16 }, { x, y: 178, w: 18, h: 16 });
  for (let k = 0; k < L.wings; k++) {
    for (let j = 0; j < 5; j++) panes.push({ x: annexX(k) + 10 + j * 21, y: 160, w: 18, h: 16 }, { x: annexX(k) + 10 + j * 21, y: 178, w: 18, h: 16 });
  }
  return { panes, door: { x: 231, y: 160, w: 18, h: 34 } };
}

export function exteriorLights(L: HouseLayout): Light[] {
  const warm = (x: number, y: number, r: number): Light => ({ x, y, r, c: '255,186,100', g: 0.26 });
  const lights = [warm(200, 131, 52), warm(262, 131, 52), warm(302, 131, 42), warm(192, 177, 46), warm(286, 177, 46), warm(240, 178, 32), warm(126, 137, 30), warm(126, 183, 30)];
  for (let k = 0; k < L.wings; k++) lights.push(warm(annexX(k) + 40, 177, 46), warm(annexX(k) + 90, 177, 46));
  for (const b of BOLLARDS) lights.push({ x: b.x, y: b.y - 9, r: 24, c: '255,200,130', g: 0.22 });
  return lights;
}

function fir(g: Ctx, x: number, y: number, h: number): void {
  ellipse(g, x, y, Math.round(h * 0.16), 3, 'rgba(0,0,0,0.32)');
  R(g, x - 2, y - 12, 4, 12, '#2e241d'); R(g, x + 1, y - 12, 1, 12, '#221a15');
  const n = Math.max(4, Math.round(h / 13)), maxW = Math.round(h * 0.2);
  for (let k = 0; k < n; k++) {
    const top = Math.round(y - h + (k * (h - 14)) / n), th = 16, hw = 3 + Math.round(((k + 1) * maxW) / n);
    for (let r = 0; r < th; r++) {
      const w = Math.round((hw * r) / th) + 1;
      R(g, x - w, top + r, w * 2, 1, '#1a2a23'); R(g, x - w, top + r, Math.max(1, Math.floor(w * 0.7)), 1, '#21362c'); R(g, x + w - 1, top + r, 1, 1, '#13201a');
    }
  }
}

function fern(g: Ctx, x: number, y: number, s: number): void {
  for (const [dx, dy] of [[-7, -3], [-4, -7], [0, -9], [4, -7], [7, -3]]) {
    for (let i = 1; i <= 8; i++) {
      const k = i / 8, px = Math.round(x + dx * k * s), py = Math.round(y + dy * k * s + k * k * 2);
      R(g, px, py, 1, 1, '#2f4a33');
      if (i % 2) R(g, px + (dx < 0 ? -1 : 1), py + 1, 1, 1, '#3f6340');
    }
  }
}

function rock(g: Ctx, x: number, y: number, w: number, h: number): void {
  ellipse(g, x, y + 1, w + 1, 2, 'rgba(0,0,0,0.3)'); ellipse(g, x, y - h + 2, w, h, '#3a3f42'); ellipse(g, x - 1, y - h, w - 2, h - 2, '#4a5054'); ellipse(g, x - 1, y - h - 1, Math.max(2, w - 4), 2, '#3e5a38');
}

function mossyLog(g: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = Math.round(x1 + (x2 - x1) * k), y = Math.round(y1 + (y2 - y1) * k);
    R(g, x - 1, y + 3, 3, 2, 'rgba(0,0,0,0.3)'); R(g, x, y - 4, 2, 7, '#3a2e26'); R(g, x, y - 4, 2, 2, '#4a3b30');
    if (i % 3 === 0) R(g, x, y - 5, 2, 2, i % 2 ? '#4f6b45' : '#3f5a3a');
  }
  circle(g, x1, y1 - 1, 4, '#5a4636'); circle(g, x1, y1 - 1, 2, '#3a2e26');
}

/** A casa de vidro sobre palafitas, com duas varandas e escada até o caminho. */
function house(g: Ctx): void {
  R(g, 98, 198, 250, 40, 'rgba(0,0,0,0.4)');
  for (const x of [110, 146, 196, 286, 322]) { R(g, x, 202, 5, 34, '#22272a'); R(g, x, 202, 1, 34, '#353b3f'); R(g, x - 1, 234, 7, 2, 'rgba(0,0,0,0.45)'); }
  R(g, 140, 62, 200, 44, '#1b1e21'); R(g, 140, 62, 200, 1, '#2c3135');
  for (let y = 66; y < 104; y += 6) R(g, 142, y, 196, 1, '#181b1e');
  R(g, 298, 46, 7, 18, '#0d0f11'); R(g, 298, 46, 7, 1, '#2c3135'); R(g, 297, 44, 9, 3, '#16181b');
  R(g, 136, 104, 208, 6, '#0c0e10'); R(g, 136, 104, 208, 1, '#2c3135');
  R(g, 150, 110, 182, 40, '#2e221c'); for (let x = 150; x < 332; x += 4) R(g, x, 110, 1, 40, '#251b16');
  R(g, 150, 110, 182, 3, 'rgba(0,0,0,0.4)');
  R(g, 166, 113, 146, 37, '#0c0e10');
  R(g, 100, 124, 52, 26, '#2a2420'); for (let x = 100; x < 152; x += 6) R(g, x, 124, 1, 26, '#211c19');
  R(g, 100, 142, 52, 8, 'rgba(170,200,205,0.16)'); R(g, 100, 142, 52, 1, '#8e9a9c'); R(g, 100, 124, 1, 26, '#8e9a9c');
  R(g, 100, 150, 232, 6, '#0c0e10'); R(g, 100, 150, 232, 1, '#2a2f33');
  R(g, 150, 156, 182, 40, '#2e221c'); for (let x = 150; x < 332; x += 4) R(g, x, 156, 1, 40, '#251b16');
  R(g, 164, 158, 62, 38, '#0c0e10'); R(g, 229, 158, 22, 38, '#0c0e10'); R(g, 254, 158, 62, 38, '#0c0e10');
  R(g, 100, 170, 52, 26, '#2a2420'); for (let x = 100; x < 152; x += 6) R(g, x, 170, 1, 26, '#211c19');
  R(g, 100, 188, 52, 8, 'rgba(170,200,205,0.16)'); R(g, 100, 188, 52, 1, '#8e9a9c'); R(g, 100, 170, 1, 26, '#8e9a9c');
  R(g, 100, 196, 232, 6, '#0c0e10'); R(g, 100, 196, 232, 1, '#2a2f33');
  for (let i = 0; i < 5; i++) { R(g, 230, 202 + i * 5, 22, 4, '#3a2f28'); R(g, 230, 202 + i * 5, 22, 1, '#4a3c33'); }
}

/** Anexo térreo de vidro, um para cada ala nova da casa. */
function annex(g: Ctx, k: number): void {
  const ax = annexX(k);
  R(g, ax, 198, ANNEX_PX, 40, 'rgba(0,0,0,0.4)');
  for (const x of [ax + 40, ax + 100]) { R(g, x, 202, 5, 34, '#22272a'); R(g, x, 202, 1, 34, '#353b3f'); R(g, x - 1, 234, 7, 2, 'rgba(0,0,0,0.45)'); }
  R(g, ax - 2, 146, ANNEX_PX + 2, 10, '#1b1e21'); R(g, ax - 2, 146, ANNEX_PX + 2, 1, '#2c3135'); R(g, ax - 2, 155, ANNEX_PX + 2, 1, '#0c0e10');
  R(g, ax, 156, ANNEX_PX - 4, 40, '#2e221c'); for (let x = ax; x < ax + ANNEX_PX - 4; x += 4) R(g, x, 156, 1, 40, '#251b16');
  R(g, ax + 8, 158, 108, 38, '#0c0e10');
  R(g, ax, 196, ANNEX_PX - 4, 6, '#0c0e10'); R(g, ax, 196, ANNEX_PX - 4, 1, '#2a2f33');
}

/** Chão da floresta em volta da casa, num ladrilho que se repete. Preenche o que a câmera vê além das paredes. */
export function buildForestFloor(): HTMLCanvasElement {
  const S = 128;
  const [c, g] = mk(S, S);
  const r = rng(91);
  R(g, 0, 0, S, S, '#191812');
  for (let i = 0; i < 260; i++) R(g, Math.floor(r() * S), Math.floor(r() * S), 2, 1, r() < 0.5 ? '#1f1d17' : '#13120e');
  for (let i = 0; i < 70; i++) R(g, Math.floor(r() * S), Math.floor(r() * S), 1, 2, '#2a231c');
  for (let i = 0; i < 5; i++) circle(g, 12 + Math.floor(r() * (S - 24)), 12 + Math.floor(r() * (S - 24)), 2 + Math.floor(r() * 3), r() < 0.5 ? '#222f20' : '#283824');
  for (let i = 0; i < 6; i++) fern(g, 14 + Math.floor(r() * (S - 28)), 16 + Math.floor(r() * (S - 28)), 0.7 + r() * 0.4);
  return c;
}

const TREES: Array<[number, number, number]> = [[20, 62, 70], [50, 48, 80], [84, 66, 72], [118, 50, 86], [160, 40, 70], [200, 30, 60], [250, 26, 64], [290, 34, 70], [330, 28, 64], [352, 52, 84], [384, 66, 74], [414, 46, 88], [440, 64, 70],
  [24, 120, 84], [60, 150, 78], [18, 196, 90], [70, 236, 80], [30, 272, 86], [420, 120, 86], [392, 170, 80], [436, 214, 90], [404, 262, 84], [440, 306, 88], [150, 300, 82], [340, 300, 78], [110, 318, 84]];
const ROCKS: Array<[number, number, number, number]> = [[176, 262, 9, 5], [300, 244, 7, 4], [96, 290, 10, 6], [364, 236, 8, 5]];

/**
 * Vista de fora. Com `front`, devolve também um recorte só com o que fica na frente da linha `y`
 * dentro de `rect`, já pintado: quem anda nessa linha passa atrás dos pinheiros e da cerca.
 */
export function buildExterior(L: HouseLayout, front?: { rect: Rect; y: number }): { img: HTMLCanvasElement; front: HTMLCanvasElement | null } {
  const W = L.outW * T, H = L.outH * T, grow = ANNEX_PX * L.wings, houseEnd = 346 + grow;
  // o que fica à direita da casa anda junto quando ela ganha anexos
  const shift = (x: number, y: number) => (x > 340 && y < 320 ? x + grow : x);
  const [c, g] = mk(W, H);
  const r = rng(42);
  R(g, 0, 0, W, H, '#26251f');
  for (let i = 0; i < 1800 + grow * 4; i++) R(g, Math.floor(r() * W), Math.floor(r() * H), 2, 1, r() < 0.5 ? '#2d2b24' : '#201f1a');
  for (let i = 0; i < 500 + grow; i++) R(g, Math.floor(r() * W), Math.floor(r() * H), 1, 2, '#3a2f26');
  for (let i = 0; i < 40 + grow / 8; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (x > 130 && x < houseEnd + 4 && y < 240) continue;
    circle(g, x, y, 2 + Math.floor(r() * 4), r() < 0.5 ? '#2c3f2b' : '#344a31');
  }
  // caminho de pedras até a escada
  const px = (y: number) => 241 + Math.round(Math.sin((y - 228) / 30) * 10 * Math.min(1, (y - 228) / 40));
  for (let y = 228; y < H; y++) R(g, px(y) - 10, y, 20, 1, '#2f2e28');
  for (let y = 232; y < H; y += 10) { const cx = px(y) + ((y / 10) % 2 ? -2 : 2); ellipse(g, cx, y, 7, 3, '#45494b'); R(g, cx - 5, y - 3, 9, 1, '#5a5f62'); }

  const O: Array<{ y: number; d: (g: Ctx) => void }> = [];
  O.push({ y: 236, d: (g) => { house(g); for (let k = 0; k < L.wings; k++) annex(g, k); } });
  for (const [x, y, h] of TREES) O.push({ y, d: (g) => fir(g, shift(x, y), y, h) });
  for (const [x, y, w, h] of ROCKS) O.push({ y, d: (g) => rock(g, shift(x, y), y, w, h) });
  O.push({ y: 300, d: (g) => { mossyLog(g, 292, 302, 382, 282); R(g, 330, 286, 2, 1, '#c9b8a0'); R(g, 330, 287, 1, 1, '#8a7a66'); R(g, 352, 281, 2, 1, '#c9b8a0'); R(g, 352, 282, 1, 1, '#8a7a66'); } });
  for (const b of BOLLARDS) O.push({ y: b.y, d: (g) => { R(g, b.x - 1, b.y - 8, 3, 8, '#16181b'); R(g, b.x - 2, b.y - 10, 5, 3, '#2a2e33'); R(g, b.x - 1, b.y - 9, 3, 1, '#ffcf85'); } });
  for (let i = 0; i < 80 + grow / 6; i++) {
    const x = Math.floor(r() * W), y = 40 + Math.floor(r() * (H - 40)), s = 0.8 + r() * 0.6;
    if (x > 94 && x < houseEnd && y < 242) continue;
    if (Math.abs(x - px(y)) < 16 && y > 224) continue;
    O.push({ y, d: (g) => fern(g, x, y, s) });
  }
  O.push({ y: 9999, d: (g) => { // cercas de madeira nas bordas
    R(g, 2, 0, 12, H, '#15110e'); R(g, 4, 0, 2, H, '#211a15'); for (let y = 6; y < H; y += 14) R(g, 7, y, 4, 1, '#0d0a08');
    const rx = W - 12; R(g, rx, 0, 10, H, '#15110e'); R(g, rx + 2, 0, 2, H, '#211a15'); for (let y = 12; y < H; y += 16) R(g, rx + 4, y, 4, 1, '#0d0a08');
  } });
  O.sort((a, b) => a.y - b.y).forEach((o) => o.d(g));
  if (!front) return { img: c, front: null };
  const { rect } = front, [fc, fg] = mk(rect.w, rect.h);
  fg.translate(-rect.x, -rect.y);
  for (const o of O) if (o.y > front.y) o.d(fg);
  // só fica o que é sólido (sombras não), com a cor que já está na vista
  const m = fg.getImageData(0, 0, rect.w, rect.h), base = g.getImageData(rect.x, rect.y, rect.w, rect.h);
  for (let i = 0; i < m.data.length; i += 4) {
    const solid = m.data[i + 3] >= 200;
    for (let k = 0; k < 3; k++) m.data[i + k] = base.data[i + k];
    m.data[i + 3] = solid ? 255 : 0;
  }
  fg.putImageData(m, 0, 0);
  return { img: c, front: fc };
}
