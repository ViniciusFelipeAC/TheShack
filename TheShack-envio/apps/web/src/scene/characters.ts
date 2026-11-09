/* Personagens de uns 16x28 pixels desenhados em código, em quadros de 24x40, com quatro direções e as poses da cena.
   A luz vem de cima e da esquerda: cada cor ganha um tom de luz e um de sombra, e o contorno escuro sai no fim. */
import type { Dir } from './layout.ts';
import type { Look } from './model.ts';
import { type Ctx, mk, outline, R, shade } from './pixel.ts';

export type Pose = 'stand' | 'walk' | 'mug' | 'sit_read' | 'sit_type' | 'sit_scratch' | 'browse' | 'water';
export type Sprites = Record<Dir, Partial<Record<Pose, HTMLCanvasElement[]>>>;

/** Quantos quadros cada pose tem em cada direção. A esquerda é a direita espelhada. */
const POSES: Record<'down' | 'up' | 'right', Partial<Record<Pose, number>>> = {
  down: { stand: 2, walk: 4, mug: 2, sit_read: 2 },
  up: { stand: 1, walk: 4, sit_type: 2, sit_scratch: 2, browse: 2 },
  right: { stand: 2, walk: 4, water: 2 },
};

/** Pés do personagem dentro do quadro. */
const AX = 12, AY = 33;
const EYE = '#1e1818', SHINE = '#f4efe6', BLUSH = 'rgba(200,90,90,0.4)', HP = '#16181b', HP_L = '#30353b', BRASS = '#c9a24a', CORD = '#cfc9bd', BOOK = '#5a2a2a', MUG = '#dcd6cb';

type Tones = Record<'sk' | 'skL' | 'skD' | 'hr' | 'hrL' | 'hrD' | 'o' | 'oL' | 'oD' | 'oDD' | 'sl' | 'slL' | 'slD' | 'shirt' | 'shirtD'
  | 'acc' | 'accD' | 'pa' | 'paL' | 'paD' | 'sh' | 'shL' | 'shD' | 'mouth', string>;

function tonesOf(L: Look): Tones {
  return {
    sk: L.skin, skL: shade(L.skin, 0.14), skD: shade(L.skin, -0.16),
    hr: L.hair, hrL: shade(L.hair, 0.28), hrD: shade(L.hair, -0.35),
    o: L.outfit, oL: shade(L.outfit, 0.14), oD: shade(L.outfit, -0.28), oDD: shade(L.outfit, -0.48),
    sl: L.sleeve, slL: shade(L.sleeve, 0.14), slD: shade(L.sleeve, -0.22),
    shirt: L.shirt, shirtD: shade(L.shirt, -0.2),
    acc: L.accent, accD: shade(L.accent, -0.35),
    pa: L.pants, paL: shade(L.pants, 0.14), paD: shade(L.pants, -0.3),
    sh: L.shoes, shL: shade(L.shoes, 0.3), shD: shade(L.shoes, -0.3),
    mouth: shade(L.skin, -0.3),
  };
}

type Paint = (x: number, y: number, w: number, h: number, c: string) => void;
/** Um quadro em desenho: y0 é o alto do tronco e hy o alto da cabeça. */
type Frame = { P: Paint; L: Look; T: Tones; pose: Pose; f: number; walk: boolean; y0: number; hy: number };

/* ---------- pernas e sapatos ---------- */

function shoe(d: Frame, x: number, y: number, back: boolean): void {
  const { P, T } = d;
  P(x, y, 3, 2, T.sh);
  if (back) P(x, y, 3, 1, T.shD); else { P(x, y, 2, 1, T.shL); P(x, y + 1, 3, 1, T.sh); }
}

/** Pernas de frente ou de costas. No sofá, as coxas vêm para a frente e as canelas descem. */
function legs(d: Frame, back: boolean): void {
  const { P, T, pose, f, y0 } = d;
  if (pose === 'sit_read') {
    for (const x of [AX - 4, AX + 1]) { P(x, AY - 1, 3, 4, T.pa); P(x, AY - 1, 3, 1, T.paL); P(x + 2, AY, 1, 3, T.paD); shoe(d, x, AY + 3, false); }
    return;
  }
  const top = y0 + 8, lu = d.walk && f === 1 ? 1 : 0, ru = d.walk && f === 3 ? 1 : 0;
  P(AX - 1, top, 2, 1, T.paD);
  ([[AX - 4, lu, [T.paL, T.pa, T.paD]], [AX + 1, ru, [T.pa, T.pa, T.paD]]] as const).forEach(([x, up, cols]) => {
    const h = AY - 2 - up - top;
    cols.forEach((c, k) => P(x + k, top, 1, h, c));
    shoe(d, x, AY - 2 - up, back);
  });
}

/* ---------- tronco ---------- */

function torsoFront(d: Frame): void {
  const { P, T, L, y0 } = d;
  P(AX - 4, y0, 8, 1, T.o); P(AX - 5, y0 + 1, 10, 7, T.o);
  P(AX - 5, y0 + 1, 1, 6, T.oL); P(AX + 3, y0, 1, 8, T.oD); P(AX + 4, y0 + 1, 1, 7, T.oD);
  P(AX - 5, y0 + 7, 10, 1, T.oDD);
  if (L.accessory === 'bowtie') {
    // colete aberto em V sobre a camisa, gravata-borboleta, dois botões e a corrente do relógio
    P(AX - 2, y0, 4, 2, T.shirt); P(AX - 1, y0 + 2, 2, 2, T.shirt); P(AX, y0 + 2, 1, 2, T.shirtD);
    P(AX - 2, y0 + 2, 1, 2, T.oDD); P(AX + 1, y0 + 2, 1, 2, T.oDD); P(AX - 1, y0 + 4, 2, 1, T.oDD);
    P(AX - 3, y0, 2, 2, T.acc); P(AX + 1, y0, 2, 2, T.acc); P(AX - 1, y0, 2, 1, T.accD); P(AX - 3, y0, 1, 1, shade(L.accent, 0.2));
    P(AX - 1, y0 + 5, 1, 1, BRASS); P(AX - 1, y0 + 6, 1, 1, T.oDD);
    P(AX, y0 + 5, 1, 1, BRASS); P(AX + 1, y0 + 6, 1, 1, BRASS); P(AX + 2, y0 + 5, 1, 1, T.oDD);
    P(AX - 4, y0 + 5, 2, 1, T.oDD);
  } else if (L.accessory === 'headphones') {
    // moletom: gola do capuz, cordões, bolso canguru e a barra canelada
    P(AX - 2, y0, 4, 1, T.skD); P(AX - 4, y0, 2, 1, T.oL); P(AX + 2, y0, 2, 1, T.oL); P(AX - 3, y0 + 1, 6, 1, T.oL);
    P(AX - 2, y0 + 1, 1, 3, CORD); P(AX + 1, y0 + 1, 1, 3, CORD); P(AX - 2, y0 + 4, 1, 1, '#8f8a80'); P(AX + 1, y0 + 4, 1, 1, '#8f8a80');
    P(AX - 3, y0 + 5, 6, 2, T.oD); P(AX - 3, y0 + 5, 6, 1, T.oDD); P(AX - 3, y0 + 5, 1, 2, T.oDD); P(AX + 2, y0 + 5, 1, 2, T.oDD);
    P(AX - 5, y0 + 7, 10, 1, T.oD);
  } else {
    // camisa de gola com uma fileira de botões e o cinto com fivela
    P(AX - 1, y0, 2, 2, T.skD); P(AX - 3, y0, 2, 1, T.shirt); P(AX + 1, y0, 2, 1, T.shirt); P(AX - 2, y0 + 1, 1, 1, T.shirtD); P(AX + 1, y0 + 1, 1, 1, T.shirtD);
    P(AX, y0 + 2, 1, 5, T.oD); P(AX - 1, y0 + 3, 1, 1, T.oDD); P(AX - 1, y0 + 5, 1, 1, T.oDD);
    P(AX - 1, y0 + 7, 2, 1, BRASS);
  }
}

function torsoBack(d: Frame): void {
  const { P, T, L, y0 } = d;
  P(AX - 4, y0, 8, 1, T.o); P(AX - 5, y0 + 1, 10, 7, T.o);
  P(AX - 5, y0 + 1, 2, 7, T.oD); P(AX + 4, y0 + 1, 1, 6, T.oL);
  P(AX - 5, y0 + 7, 10, 1, T.oDD);
  if (L.accessory === 'bowtie') {
    // costas de cetim do colete, com a fivela de ajuste, e a gola da camisa
    P(AX - 3, y0 + 1, 6, 5, shade(L.outfit, 0.08)); P(AX - 1, y0 + 1, 1, 6, T.oD);
    P(AX - 3, y0 + 5, 6, 1, T.oDD); P(AX - 1, y0 + 5, 2, 1, BRASS); P(AX - 2, y0, 4, 1, T.shirt);
  } else if (L.accessory === 'headphones') {
    // o capuz caído nas costas
    P(AX - 3, y0, 6, 3, T.oL); P(AX - 2, y0 + 3, 4, 1, T.oL); P(AX - 1, y0 + 4, 2, 1, T.o); P(AX - 2, y0, 4, 1, T.oD); P(AX - 3, y0 + 2, 1, 1, T.o); P(AX + 2, y0 + 2, 1, 1, T.oD);
    P(AX - 5, y0 + 7, 10, 1, T.oD);
  } else {
    P(AX - 3, y0, 6, 1, T.shirt); P(AX - 1, y0 + 1, 1, 6, T.oD);
  }
}

/* ---------- braços ---------- */

/** Braço pendurado de frente ou de costas: manga com luz e sombra, punho e mão. */
function arm(d: Frame, x: number, y: number, lit: boolean): void {
  const { P, T, L } = d;
  P(x, y, 2, 5, lit ? T.sl : T.slD); P(lit ? x : x + 1, y, 1, 4, lit ? T.slL : shade(L.sleeve, -0.36));
  if (L.accessory === 'headphones') P(x, y + 4, 2, 1, T.oD);
  else if (L.accessory === 'bowtie') P(x, y + 4, 2, 1, T.shirtD);
  P(x, y + 5, 2, 2, T.sk); P(x, y + 6, 2, 1, T.skD);
}

/* ---------- cabeça ---------- */

function faceFront(d: Frame, blink: boolean): void {
  const { P, T, hy } = d;
  P(AX - 5, hy, 10, 9, T.sk); P(AX - 4, hy + 9, 8, 1, T.sk);
  P(AX - 5, hy + 2, 1, 6, T.skL); P(AX + 4, hy + 2, 1, 7, T.skD); P(AX - 4, hy + 9, 8, 1, T.skD); P(AX - 4, hy + 2, 8, 1, T.skD);
  P(AX - 6, hy + 4, 1, 2, T.sk); P(AX + 5, hy + 4, 1, 2, T.skD); P(AX - 6, hy + 5, 1, 1, T.skD);
  if (blink) { P(AX - 3, hy + 6, 2, 1, EYE); P(AX + 2, hy + 6, 2, 1, EYE); }
  else { P(AX - 3, hy + 5, 1, 2, EYE); P(AX + 2, hy + 5, 1, 2, EYE); P(AX - 3, hy + 5, 1, 1, '#3a3236'); P(AX + 2, hy + 5, 1, 1, '#3a3236'); }
  P(AX - 4, hy + 4, 2, 1, T.hrD); P(AX + 2, hy + 4, 2, 1, T.hrD);
  P(AX - 1, hy + 8, 2, 1, T.mouth);
  P(AX - 4, hy + 7, 1, 1, BLUSH); P(AX + 3, hy + 7, 1, 1, BLUSH);
}

function hairFront(d: Frame): void {
  const { P, T, L, hy } = d;
  P(AX - 4, hy - 2, 8, 1, T.hr); P(AX - 5, hy - 1, 10, 3, T.hr); P(AX - 6, hy, 1, 5, T.hr); P(AX + 5, hy, 1, 4, T.hr);
  if (L.hairStyle === 'neat') {
    // risca do lado, penteado para trás, com brilho
    P(AX - 5, hy + 2, 5, 1, T.hr); P(AX + 2, hy + 2, 3, 1, T.hr); P(AX + 1, hy + 1, 1, 1, T.hrD);
    P(AX - 3, hy - 2, 3, 1, T.hrL); P(AX - 4, hy - 1, 2, 1, T.hrL); P(AX + 3, hy, 2, 2, T.hrD); P(AX - 6, hy + 3, 1, 2, T.hrD);
  } else {
    // bagunçado: pontas para cima e franja desigual
    P(AX - 4, hy - 3, 3, 1, T.hr); P(AX - 3, hy - 4, 1, 1, T.hr); P(AX, hy - 3, 2, 1, T.hr); P(AX + 1, hy - 4, 2, 1, T.hr); P(AX + 3, hy - 3, 1, 1, T.hr); P(AX + 4, hy - 2, 1, 1, T.hr);
    P(AX - 5, hy + 2, 2, 2, T.hr); P(AX - 2, hy + 2, 2, 1, T.hr); P(AX + 1, hy + 2, 3, 2, T.hr); P(AX + 4, hy + 2, 1, 1, T.hr);
    P(AX - 2, hy - 2, 3, 1, T.hrL); P(AX + 1, hy - 4, 1, 1, T.hrL); P(AX - 3, hy - 1, 1, 1, T.hrL); P(AX + 3, hy, 2, 1, T.hrD); P(AX - 5, hy + 3, 1, 1, T.hrD);
  }
  if (L.temples) { P(AX - 6, hy + 3, 1, 2, L.temples); P(AX + 5, hy + 3, 1, 1, L.temples); }
}

function headBack(d: Frame): void {
  const { P, T, L, hy } = d;
  P(AX - 3, hy + 8, 6, 2, T.skD); P(AX - 6, hy + 4, 1, 2, T.skD); P(AX + 5, hy + 4, 1, 2, T.skD);
  P(AX - 4, hy - 2, 8, 1, T.hr); P(AX - 5, hy - 1, 10, 9, T.hr); P(AX - 6, hy, 1, 4, T.hr); P(AX + 5, hy, 1, 4, T.hr);
  P(AX - 5, hy + 4, 1, 4, T.hrD); P(AX + 3, hy + 1, 2, 6, T.hrD);
  if (L.hairStyle === 'neat') {
    P(AX - 3, hy - 2, 4, 1, T.hrL); P(AX - 4, hy - 1, 3, 1, T.hrL); P(AX - 2, hy, 2, 1, T.hrL); P(AX - 4, hy + 6, 8, 2, T.hrD);
  } else {
    P(AX - 4, hy - 3, 3, 1, T.hr); P(AX - 3, hy - 4, 1, 1, T.hr); P(AX, hy - 3, 2, 1, T.hr); P(AX + 1, hy - 4, 2, 1, T.hr); P(AX + 3, hy - 3, 1, 1, T.hr); P(AX - 3, hy + 8, 2, 1, T.hr); P(AX + 1, hy + 8, 3, 1, T.hr);
    P(AX - 2, hy - 2, 3, 1, T.hrL); P(AX - 3, hy + 2, 1, 2, T.hrL); P(AX + 1, hy + 4, 1, 2, T.hrD);
  }
  if (L.temples) { P(AX - 6, hy + 3, 1, 1, L.temples); P(AX + 5, hy + 3, 1, 1, L.temples); }
}

function headphones(d: Frame, back: boolean): void {
  const { P, L, hy } = d;
  P(AX - 5, hy - 3, 10, 1, HP); P(AX - 3, hy - 3, 5, 1, HP_L); P(AX - 6, hy - 2, 1, 3, HP); P(AX + 5, hy - 2, 1, 3, HP);
  for (const x of [AX - 7, AX + 5]) { P(x, hy + 1, 2, 6, HP); P(x, hy + 2, 2, 1, HP_L); }
  if (!back) { P(AX - 7, hy + 3, 1, 3, L.accent); P(AX + 6, hy + 3, 1, 3, L.accent); }
}

/* ---------- vistas ---------- */

function side(d: Frame): void {
  const { P, T, L, pose, f, y0, hy } = d;
  const blink = pose === 'stand' && f === 1;
  if (d.walk && (f === 1 || f === 3)) {
    // passada: a perna de trás fica no tom escuro
    const fr = f === 1;
    P(AX - 4, AY - 6, 3, 4, fr ? T.paD : T.pa); P(AX - 5, AY - 3, 3, 2, fr ? T.shD : T.sh);
    P(AX, AY - 6, 3, 4, fr ? T.pa : T.paD); P(AX, AY - 2, 4, 2, fr ? T.sh : T.shD); P(AX + 2, AY - 2, 2, 1, T.shL);
    P(AX - 1, AY - 7, 3, 2, T.pa);
  } else {
    P(AX - 2, AY - 6, 4, 4, T.pa); P(AX + 1, AY - 6, 1, 4, T.paD); P(AX - 2, AY - 6, 1, 4, T.paL);
    P(AX - 2, AY - 2, 5, 2, T.sh); P(AX, AY - 2, 3, 1, T.shL);
  }
  P(AX - 4, y0, 8, 8, T.o); P(AX - 4, y0, 2, 8, T.oD); P(AX + 3, y0 + 1, 1, 5, T.oL); P(AX - 4, y0 + 7, 8, 1, T.oDD);
  if (L.accessory === 'bowtie') { P(AX + 2, y0, 2, 5, T.shirt); P(AX + 2, y0 + 1, 1, 4, T.shirtD); P(AX + 3, y0, 2, 2, T.acc); P(AX + 4, y0, 1, 1, T.accD); P(AX + 3, y0 + 5, 1, 1, BRASS); }
  else if (L.accessory === 'headphones') { P(AX - 5, y0, 3, 4, T.oL); P(AX - 4, y0 + 1, 1, 2, T.oD); P(AX + 2, y0 + 1, 1, 3, CORD); P(AX - 4, y0 + 7, 8, 1, T.oD); }
  else { P(AX + 2, y0, 2, 1, T.shirt); P(AX + 3, y0 + 1, 1, 5, T.oD); }
  // cabeça de perfil: nariz, olho, orelha e cabelo cobrindo a nuca
  P(AX - 4, hy, 9, 9, T.sk); P(AX - 3, hy + 9, 7, 1, T.skD); P(AX + 5, hy + 5, 1, 2, T.sk); P(AX + 5, hy + 6, 1, 1, T.skD);
  P(AX + 3, hy + 2, 2, 1, T.skD); P(AX + 4, hy + 3, 1, 5, T.skL);
  if (blink) P(AX + 2, hy + 6, 2, 1, EYE); else { P(AX + 2, hy + 5, 1, 2, EYE); P(AX + 3, hy + 6, 1, 1, SHINE); }
  P(AX + 2, hy + 4, 2, 1, T.hrD); P(AX + 1, hy + 7, 1, 1, BLUSH); P(AX + 3, hy + 8, 2, 1, T.mouth);
  P(AX - 1, hy + 4, 1, 3, T.skD); P(AX, hy + 5, 1, 1, T.skD);
  P(AX - 4, hy - 1, 9, 3, T.hr); P(AX - 5, hy, 3, 7, T.hr); P(AX - 4, hy + 7, 2, 1, T.hrD);
  if (L.hairStyle === 'neat') { P(AX - 2, hy + 2, 1, 1, T.hr); P(AX + 3, hy + 2, 2, 1, T.hr); P(AX - 3, hy - 1, 5, 1, T.hrL); P(AX - 5, hy + 3, 1, 4, T.hrD); }
  else { P(AX - 3, hy - 2, 2, 1, T.hr); P(AX, hy - 3, 2, 2, T.hr); P(AX + 3, hy - 2, 1, 1, T.hr); P(AX + 3, hy + 2, 2, 2, T.hr); P(AX - 2, hy + 2, 1, 1, T.hr); P(AX - 1, hy - 1, 3, 1, T.hrL); P(AX, hy - 3, 1, 1, T.hrL); P(AX - 6, hy + 1, 1, 2, T.hr); }
  if (L.temples) P(AX - 3, hy + 2, 1, 3, L.temples);
  if (L.accessory === 'headphones') { P(AX - 3, hy - 2, 6, 1, HP); P(AX - 3, hy - 1, 1, 3, HP); P(AX - 2, hy + 2, 4, 5, HP); P(AX - 2, hy + 3, 3, 1, HP_L); P(AX - 1, hy + 4, 2, 2, L.accent); }
  if (pose === 'water') {
    // regador: o braço vai à frente e a água cai em gotas
    P(AX - 1, y0 + 1, 3, 3, T.slD); P(AX + 1, y0 + 3, 3, 2, T.sl); P(AX + 4, y0 + 3, 2, 2, T.sk);
    P(AX + 5, y0 + 1, 5, 4, '#4f5d63'); P(AX + 5, y0 + 1, 5, 1, '#6b7b82'); P(AX + 5, y0 + 4, 5, 1, '#3c474c'); P(AX + 10, y0, 1, 1, '#4f5d63'); P(AX + 11, y0 - 1, 1, 1, '#4f5d63'); P(AX + 6, y0 - 1, 3, 1, '#3c474c');
    P(AX + 11, y0 + 1 + f * 2, 1, 1, '#9fc6d6'); P(AX + 11, y0 + 4 - f * 2, 1, 1, '#9fc6d6');
  } else {
    const s = d.walk ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0;
    P(AX - 1 + s, y0 + 1, 3, 5, T.sl); P(AX - 1 + s, y0 + 1, 1, 5, T.slD); P(AX + 1 + s, y0 + 1, 1, 4, T.slL);
    P(AX - 1 + s, y0 + 6, 3, 2, T.sk); P(AX - 1 + s, y0 + 7, 3, 1, T.skD);
  }
}

function frontOrBack(d: Frame, dir: 'down' | 'up'): void {
  const { P, T, pose, f, y0, hy } = d;
  const desk = pose === 'sit_type' || pose === 'sit_scratch', back = dir === 'up';
  if (!desk) legs(d, back);
  if (back) torsoBack(d); else torsoFront(d);
  const sw = d.walk ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
  let late: (() => void) | null = null;
  if (!back) {
    if (pose === 'mug') {
      arm(d, AX - 7, y0 + 1, true);
      if (f === 0) { P(AX + 5, y0 + 1, 2, 3, T.slD); P(AX + 3, y0 + 3, 3, 2, T.sk); P(AX + 1, y0 + 1, 3, 3, MUG); P(AX + 1, y0 + 1, 3, 1, '#4a2f20'); P(AX, y0 + 2, 1, 1, MUG); P(AX + 3, y0 + 2, 1, 2, '#b9b2a6'); }
      else late = () => { P(AX + 5, y0 - 1, 2, 3, T.slD); P(AX + 3, hy + 7, 2, 3, T.sk); P(AX, hy + 5, 3, 3, MUG); P(AX - 1, hy + 6, 1, 1, MUG); P(AX + 2, hy + 5, 1, 3, '#b9b2a6'); };
    } else if (pose === 'sit_read') {
      // livro aberto nas duas mãos; num quadro ele vira a página
      P(AX - 7, y0 + 1, 2, 4, T.sl); P(AX + 5, y0 + 1, 2, 4, T.slD); P(AX - 6, y0 + 4, 2, 2, T.sk); P(AX + 4, y0 + 4, 2, 2, T.sk);
      P(AX - 4, y0 + 2, 8, 5, BOOK); P(AX - 4, y0 + 2, 8, 1, shade(BOOK, 0.25)); P(AX - 1, y0 + 2, 2, 5, shade(BOOK, -0.3));
      P(AX - 3, y0 + 6, 2, 1, '#e8e1d2'); P(AX + 1, y0 + 6, 2, 1, '#e8e1d2');
      if (f === 1) P(AX - 4, y0 + 1, 4, 1, '#e8e1d2');
    } else { arm(d, AX - 7, y0 + 1 + sw, true); arm(d, AX + 5, y0 + 1 - sw, false); }
  } else if (desk) {
    if (pose === 'sit_type') { P(AX - 7, y0 + 1 + f, 2, 4, T.slD); P(AX - 7, y0 + 1 + f, 1, 4, shade(d.L.sleeve, -0.36)); P(AX + 5, y0 + 2 - f, 2, 4, T.sl); P(AX + 6, y0 + 2 - f, 1, 3, T.slL); }
    else late = () => { P(AX - 7, y0 + 1, 2, 5, T.slD); P(AX + 5, y0 - 4, 2, 6, T.sl); P(AX + 6, y0 - 4, 1, 5, T.slL); P(AX + 3 + f, hy + 3, 2, 2, T.sk); P(AX + 3 + f, hy + 4, 2, 1, T.skD); };
  } else if (pose === 'browse') {
    arm(d, AX - 7, y0 + 1, false); P(AX + 5, y0 - 5 - f, 2, 6, T.sl); P(AX + 6, y0 - 5 - f, 1, 5, T.slL); P(AX + 5, y0 - 7 - f, 2, 2, T.sk);
  } else { arm(d, AX - 7, y0 + 1 + sw, false); arm(d, AX + 5, y0 + 1 - sw, true); }

  if (back) headBack(d); else { faceFront(d, pose === 'stand' && f === 1); hairFront(d); }
  if (d.L.accessory === 'headphones') headphones(d, back);
  if (late) late();
  if (!desk && pose !== 'sit_read') P(AX - 1, y0 + 8, 2, 1, T.paD);
}

function drawChar(g: Ctx, L: Look, dir: 'down' | 'up' | 'right', pose: Pose, f: number): void {
  const walk = pose === 'walk', desk = pose === 'sit_type' || pose === 'sit_scratch', sofa = pose === 'sit_read';
  // na passada o corpo sobe um pixel
  const bob = walk && (f === 1 || f === 3) ? -1 : 0, dy = (desk ? 3 : sofa ? 5 : 0) + bob;
  const d: Frame = { P: (x, y, w, h, c) => R(g, x, y, w, h, c), L, T: tonesOf(L), pose, f, walk, y0: AY - 14 + dy, hy: AY - 24 + dy };
  if (dir === 'right') side(d); else frontOrBack(d, dir);
}

/** Desenha todos os quadros uma vez. Cada quadro tem 24x40, com os pés em (12, 33). */
export function buildCharacter(L: Look): Sprites {
  const S: Sprites = { down: {}, up: {}, right: {}, left: {} };
  for (const dir of ['down', 'up', 'right'] as const) {
    for (const [pose, frames] of Object.entries(POSES[dir]) as Array<[Pose, number]>) {
      S[dir][pose] = Array.from({ length: frames }, (_, f) => {
        const [c, g] = mk(24, 40);
        drawChar(g, L, dir, pose, f);
        outline(c);
        // a sombra no chão vem depois do contorno, para não ganhar borda
        if (pose !== 'sit_read' && pose !== 'sit_type' && pose !== 'sit_scratch') {
          g.globalCompositeOperation = 'destination-over';
          R(g, AX - 4, AY, 8, 1, 'rgba(0,0,0,0.32)'); R(g, AX - 5, AY + 1, 10, 1, 'rgba(0,0,0,0.26)'); R(g, AX - 4, AY + 2, 8, 1, 'rgba(0,0,0,0.14)');
          g.globalCompositeOperation = 'source-over';
        }
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
  if (frame) g.drawImage(frame, 4, 3, 16, 16, 0, 1, 16, 16);
}
