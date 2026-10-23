/* Personagens de 16x32 desenhados em código, com quatro direções e as poses da cena. */
import type { Dir } from './layout.ts';
import type { Look } from './model.ts';
import { type Ctx, mk, R, shade } from './pixel.ts';

export type Pose = 'stand' | 'walk' | 'mug' | 'sit_read' | 'sit_type' | 'sit_scratch' | 'browse' | 'water';
export type Sprites = Record<Dir, Partial<Record<Pose, HTMLCanvasElement[]>>>;

/** Quantos quadros cada pose tem em cada direção. A esquerda é a direita espelhada. */
const POSES: Record<'down' | 'up' | 'right', Partial<Record<Pose, number>>> = {
  down: { stand: 2, walk: 4, mug: 2, sit_read: 2 },
  up: { stand: 1, walk: 4, sit_type: 2, sit_scratch: 2, browse: 2 },
  right: { stand: 2, walk: 4, water: 2 },
};

function drawChar(g: Ctx, L: Look, dir: 'down' | 'up' | 'right', pose: Pose, f: number): void {
  const P = (x: number, y: number, w: number, h: number, c: string) => R(g, x, y, w, h, c);
  const ax = 12, ay = 33, walk = pose === 'walk';
  const desk = pose === 'sit_type' || pose === 'sit_scratch', sofa = pose === 'sit_read';
  const dy = desk ? 3 : sofa ? 5 : 0, y0 = ay - 14 + dy, hy = ay - 24 + dy;
  const oD = shade(L.outfit, -0.28), sl = L.sleeve, slD = shade(L.sleeve, -0.22), skD = shade(L.skin, -0.14);
  const hL = shade(L.hair, 0.25), pD = shade(L.pants, -0.25), belt = shade(L.outfit, -0.38), eye = '#1e1818', hp = '#16181b';
  const mouth = shade(L.skin, -0.38), blush = 'rgba(200,90,90,0.4)', blink = pose === 'stand' && f === 1;
  if (!desk && !sofa) { P(ax - 4, ay - 1, 8, 1, 'rgba(0,0,0,0.3)'); P(ax - 5, ay, 10, 1, 'rgba(0,0,0,0.3)'); P(ax - 4, ay + 1, 8, 1, 'rgba(0,0,0,0.18)'); }

  if (dir === 'right') {
    if (walk && (f === 1 || f === 3)) {
      const fr = f === 1;
      P(ax - 4, ay - 6, 3, 4, fr ? pD : L.pants); P(ax - 5, ay - 3, 3, 2, shade(L.shoes, -0.15)); P(ax, ay - 6, 3, 4, fr ? L.pants : pD); P(ax, ay - 2, 4, 2, L.shoes);
    } else { P(ax - 2, ay - 6, 4, 4, L.pants); P(ax - 2, ay - 2, 5, 2, L.shoes); }
    P(ax - 4, y0, 8, 8, L.outfit); P(ax - 4, y0, 2, 8, oD); P(ax - 4, y0 + 7, 8, 1, belt);
    if (L.accessory === 'bowtie') { P(ax + 2, y0, 2, 6, L.shirt); P(ax + 3, y0, 2, 2, L.accent); } else P(ax + 2, y0 + 1, 1, 3, '#cfc9bd');
    P(ax - 4, hy, 9, 10, L.skin); P(ax - 4, hy + 1, 1, 8, skD); P(ax + 5, hy + 5, 1, 2, L.skin);
    if (blink) P(ax + 2, hy + 6, 2, 1, eye); else P(ax + 2, hy + 5, 1, 2, eye);
    P(ax + 1, hy + 7, 1, 1, blush); P(ax + 2, hy + 8, 2, 1, mouth); P(ax - 1, hy + 4, 2, 3, skD);
    if (L.hairStyle === 'neat') { P(ax - 4, hy - 1, 9, 3, L.hair); P(ax - 5, hy, 3, 7, L.hair); P(ax - 2, hy + 2, 2, 2, L.hair); P(ax + 3, hy + 2, 2, 1, L.hair); P(ax - 2, hy - 1, 4, 1, hL); }
    else { P(ax - 4, hy - 1, 9, 3, L.hair); P(ax - 5, hy, 3, 6, L.hair); P(ax - 3, hy - 2, 2, 1, L.hair); P(ax, hy - 3, 2, 2, L.hair); P(ax + 3, hy - 2, 1, 1, L.hair); P(ax + 3, hy + 2, 2, 2, L.hair); P(ax - 2, hy + 2, 1, 1, L.hair); P(ax - 1, hy - 1, 3, 1, hL); }
    if (L.temples) P(ax - 2, hy + 3, 1, 1, L.temples);
    if (L.accessory === 'headphones') { P(ax - 3, hy - 2, 6, 1, hp); P(ax - 3, hy - 1, 1, 4, hp); P(ax - 2, hy + 3, 3, 4, hp); P(ax - 1, hy + 4, 1, 2, L.accent); }
    if (pose === 'water') {
      P(ax - 1, y0 + 1, 3, 3, slD); P(ax + 1, y0 + 3, 3, 2, sl); P(ax + 4, y0 + 3, 2, 2, L.skin);
      P(ax + 5, y0 + 1, 5, 4, '#4f5d63'); P(ax + 5, y0 + 1, 5, 1, '#6b7b82'); P(ax + 10, y0, 1, 1, '#4f5d63'); P(ax + 11, y0 - 1, 1, 1, '#4f5d63'); P(ax + 6, y0 - 1, 3, 1, '#3c474c');
      P(ax + 11, y0 + 1 + f * 2, 1, 1, '#9fc6d6'); P(ax + 11, y0 + 4 - f * 2, 1, 1, '#9fc6d6');
    } else {
      const s = walk ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0;
      P(ax - 1 + s, y0 + 1, 3, 5, slD); P(ax - 1 + s, y0 + 6, 3, 2, L.skin);
    }
    return;
  }

  if (sofa) { P(ax - 4, ay - 1, 3, 4, L.pants); P(ax + 1, ay - 1, 3, 4, pD); P(ax - 4, ay + 3, 3, 2, L.shoes); P(ax + 1, ay + 3, 3, 2, L.shoes); }
  else if (!desk) {
    const lu = walk && f === 1 ? 1 : 0, ru = walk && f === 3 ? 1 : 0;
    P(ax - 4, ay - 6, 3, 4 - lu, L.pants); P(ax - 4, ay - 2 - lu, 3, 2, L.shoes); P(ax + 1, ay - 6, 3, 4 - ru, pD); P(ax + 1, ay - 2 - ru, 3, 2, L.shoes);
  }
  P(ax - 5, y0, 10, 8, L.outfit);
  if (dir === 'down') {
    P(ax + 3, y0, 2, 8, oD);
    if (L.accessory === 'bowtie') {
      P(ax - 1, y0, 2, 7, L.shirt); P(ax - 1, y0 + 3, 1, 1, '#a9a49a'); P(ax - 1, y0 + 5, 1, 1, '#a9a49a');
      P(ax - 3, y0, 2, 2, L.accent); P(ax + 1, y0, 2, 2, L.accent); P(ax - 1, y0, 2, 1, shade(L.accent, -0.3));
    } else { P(ax - 2, y0 + 1, 1, 3, '#cfc9bd'); P(ax + 1, y0 + 1, 1, 3, '#cfc9bd'); P(ax - 3, y0 + 5, 6, 2, shade(L.outfit, -0.14)); }
  } else {
    P(ax - 5, y0, 2, 8, oD);
    if (L.accessory === 'bowtie') P(ax - 1, y0 + 2, 1, 5, shade(L.outfit, -0.2)); else P(ax - 4, y0, 8, 2, shade(L.outfit, -0.16));
  }
  P(ax - 5, y0 + 7, 10, 1, belt);
  const sw = walk ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
  let late: (() => void) | null = null;
  if (dir === 'down') {
    if (pose === 'mug') {
      P(ax - 7, y0 + 1, 2, 5, sl); P(ax - 7, y0 + 6, 2, 2, L.skin);
      if (f === 0) { P(ax + 5, y0 + 1, 2, 3, slD); P(ax + 3, y0 + 3, 3, 2, L.skin); P(ax + 1, y0 + 1, 3, 3, '#dcd6cb'); P(ax + 1, y0 + 1, 3, 1, '#4a2f20'); P(ax, y0 + 2, 1, 1, '#dcd6cb'); }
      else late = () => { P(ax + 5, y0 - 1, 2, 3, slD); P(ax + 3, y0 - 3, 2, 3, L.skin); P(ax, y0 - 5, 3, 3, '#dcd6cb'); P(ax - 1, y0 - 4, 1, 1, '#dcd6cb'); };
    } else if (sofa) {
      P(ax - 7, y0 + 1, 2, 4, sl); P(ax + 5, y0 + 1, 2, 4, slD); P(ax - 6, y0 + 4, 2, 2, L.skin); P(ax + 4, y0 + 4, 2, 2, L.skin);
      const bk = '#5a2a2a';
      P(ax - 4, y0 + 2, 8, 5, bk); P(ax - 4, y0 + 2, 8, 1, shade(bk, 0.25)); P(ax - 1, y0 + 2, 2, 5, shade(bk, -0.3));
      if (f === 1) P(ax - 4, y0 + 1, 4, 1, '#dcd6cb');
    } else { P(ax - 7, y0 + 1 + sw, 2, 5, sl); P(ax - 7, y0 + 6 + sw, 2, 2, L.skin); P(ax + 5, y0 + 1 - sw, 2, 5, slD); P(ax + 5, y0 + 6 - sw, 2, 2, L.skin); }
  } else if (desk) {
    if (pose === 'sit_type') { P(ax - 7, y0 + 1 + f, 2, 4, slD); P(ax + 5, y0 + 2 - f, 2, 4, sl); }
    else late = () => { P(ax - 7, y0 + 1, 2, 5, slD); P(ax + 5, y0 - 4, 2, 6, sl); P(ax + 3 + f, hy + 3, 2, 2, L.skin); };
  } else if (pose === 'browse') { P(ax - 7, y0 + 1, 2, 5, slD); P(ax - 7, y0 + 6, 2, 2, L.skin); P(ax + 5, y0 - 5 - f, 2, 6, sl); P(ax + 5, y0 - 7 - f, 2, 2, L.skin); }
  else { P(ax - 7, y0 + 1 + sw, 2, 5, slD); P(ax - 7, y0 + 6 + sw, 2, 2, L.skin); P(ax + 5, y0 + 1 - sw, 2, 5, sl); P(ax + 5, y0 + 6 - sw, 2, 2, L.skin); }

  P(ax - 5, hy, 10, 10, L.skin);
  if (dir === 'down') {
    P(ax + 4, hy + 1, 1, 8, skD); P(ax - 6, hy + 4, 1, 2, L.skin); P(ax + 5, hy + 4, 1, 2, skD);
    if (blink) { P(ax - 3, hy + 6, 2, 1, eye); P(ax + 2, hy + 6, 2, 1, eye); } else { P(ax - 3, hy + 5, 1, 2, eye); P(ax + 2, hy + 5, 1, 2, eye); }
    P(ax - 4, hy + 7, 1, 1, blush); P(ax + 3, hy + 7, 1, 1, blush); P(ax - 1, hy + 8, 2, 1, mouth);
    if (L.hairStyle === 'neat') { P(ax - 5, hy - 1, 10, 3, L.hair); P(ax - 6, hy, 1, 5, L.hair); P(ax + 5, hy, 1, 4, L.hair); P(ax - 5, hy + 2, 5, 1, L.hair); P(ax + 2, hy + 2, 3, 1, L.hair); P(ax - 3, hy - 1, 4, 1, hL); }
    else { P(ax - 5, hy - 1, 10, 3, L.hair); P(ax - 6, hy, 1, 4, L.hair); P(ax + 5, hy, 1, 4, L.hair); P(ax - 4, hy - 2, 2, 1, L.hair); P(ax - 1, hy - 3, 2, 2, L.hair); P(ax + 2, hy - 2, 2, 1, L.hair); P(ax - 5, hy + 2, 2, 2, L.hair); P(ax - 2, hy + 2, 2, 1, L.hair); P(ax + 1, hy + 2, 3, 2, L.hair); P(ax - 2, hy - 1, 3, 1, hL); }
    if (L.temples) { P(ax - 6, hy + 3, 1, 2, L.temples); P(ax + 5, hy + 3, 1, 1, L.temples); }
  } else {
    P(ax - 5, hy - 1, 10, 8, L.hair); P(ax - 6, hy, 1, 6, L.hair); P(ax + 5, hy, 1, 6, L.hair);
    if (L.hairStyle === 'neat') { P(ax - 3, hy - 1, 5, 1, hL); P(ax - 4, hy + 7, 8, 1, shade(L.hair, -0.15)); }
    else { P(ax - 4, hy - 2, 2, 1, L.hair); P(ax - 1, hy - 3, 2, 2, L.hair); P(ax + 2, hy - 2, 2, 1, L.hair); P(ax - 3, hy + 7, 2, 1, L.hair); P(ax + 1, hy + 7, 3, 1, L.hair); P(ax - 2, hy - 1, 3, 1, hL); }
    P(ax - 6, hy + 5, 1, 2, L.skin); P(ax + 5, hy + 5, 1, 2, skD);
    if (L.temples) { P(ax - 6, hy + 3, 1, 2, L.temples); P(ax + 5, hy + 3, 1, 2, L.temples); }
  }
  if (L.accessory === 'headphones') {
    P(ax - 5, hy - 3, 10, 1, hp); P(ax - 6, hy - 2, 1, 3, hp); P(ax + 5, hy - 2, 1, 3, hp);
    P(ax - 7, hy + 2, 2, 5, hp); P(ax + 5, hy + 2, 2, 5, hp); P(ax - 7, hy + 3, 1, 3, L.accent); P(ax + 6, hy + 3, 1, 3, L.accent);
  }
  if (late) late();
}

/** Desenha todos os quadros uma vez. Cada quadro tem 24x40, com os pés em (12, 33). */
export function buildCharacter(L: Look): Sprites {
  const S: Sprites = { down: {}, up: {}, right: {}, left: {} };
  for (const dir of ['down', 'up', 'right'] as const) {
    for (const [pose, frames] of Object.entries(POSES[dir]) as Array<[Pose, number]>) {
      S[dir][pose] = Array.from({ length: frames }, (_, f) => {
        const [c, g] = mk(24, 40);
        drawChar(g, L, dir, pose, f);
        return c;
      });
    }
  }
  for (const [pose, frames] of Object.entries(S.right) as Array<[Pose, HTMLCanvasElement[]]>) {
    S.left[pose] = frames.map((src) => {
      const [c, g] = mk(24, 40);
      g.translate(24, 0);
      g.scale(-1, 1);
      g.drawImage(src, 0, 0);
      return c;
    });
  }
  return S;
}

/** Retrato 16x16 para os cartões, recortado do quadro de frente. */
export function paintPortrait(canvas: HTMLCanvasElement, S: Sprites): void {
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  R(g, 0, 0, 16, 16, '#1d2a27');
  R(g, 0, 11, 16, 5, '#162120');
  const frame = S.down.stand?.[0];
  if (frame) g.drawImage(frame, 4, 4, 16, 16, 0, 1, 16, 16);
}
