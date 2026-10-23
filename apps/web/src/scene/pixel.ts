/* Utilitários de pixel art: cores, formas simples e canvases fora da tela. */

export type Ctx = CanvasRenderingContext2D;

/** Gerador pseudoaleatório com semente, para a arte sair igual em toda carga. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Semente estável a partir de um texto, como o id de um agente. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function R(g: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

function parse(c: string): number[] {
  if (c.charAt(0) === '#') {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return c.slice(c.indexOf('(') + 1, c.indexOf(')')).split(',').slice(0, 3).map(Number);
}

/** "r,g,b" de uma cor, para montar rgba() com transparência. */
export const rgbOf = (c: string): string => parse(c).join(',');

/** Clareia (a > 0) ou escurece (a < 0) uma cor. */
export function shade(c: string, a: number): string {
  return `rgb(${parse(c).map((v) => clamp(Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a), 0, 255)).join(',')})`;
}

export function mix(c1: string, c2: string, k: number): string {
  const a = parse(c1), b = parse(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

export function circle(g: Ctx, cx: number, cy: number, r: number, col: string): void {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    R(g, cx - w, cy + dy, w * 2, 1, col);
  }
}

export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, col: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    R(g, cx - w, cy + dy, w * 2, 1, col);
  }
}

const GLYPH: Record<string, string[]> = {
  '?': ['111', '001', '010', '000', '010'],
  x: ['101', '101', '010', '101', '101'],
  z: ['111', '001', '010', '100', '111'],
};

/** Letra de 3x5 pixels, para os balões e as telas. */
export function glyph(g: Ctx, ch: string, x: number, y: number, col: string): void {
  const rows = GLYPH[ch];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r].charAt(c) === '1') R(g, x + c, y + r, 1, 1, col);
}
