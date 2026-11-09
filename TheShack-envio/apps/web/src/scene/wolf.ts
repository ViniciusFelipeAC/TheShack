/* Easter egg: um lobo ruivo enorme que às vezes sai da mata, senta e fica olhando a casa.
   É uma homenagem ao Jacob, de Crepúsculo. À noite os olhos brilham e ele uiva; tocar nele também faz ele uivar e fugir. */
import type { Pt, Rect } from './layout.ts';
import { circle, type Ctx, ellipse, mk, outline, R } from './pixel.ts';

/** Linha do chão por onde ele anda, lá fora, e o ponto onde senta. Fica à esquerda, que não muda quando a casa cresce. */
export const WOLF_Y = 262;
const SPOT = 72, START = -20;
/** Pedaço da vista de fora que precisa ficar na frente dele: pinheiros, samambaias e a cerca. */
export const WOLF_AREA: Rect = { x: 0, y: WOLF_Y - 30, w: 120, h: 34 };

const FW = 36, FH = 28, GX = 18, GY = 26;
const FUR = '#8a4526', FUR_L = '#b5683b', FUR_D = '#5a2b15', CREAM = '#c58c5e', NOSE = '#140b08', EYE = '#e8b44a';

type Shape = ['e', number, number, number, number] | ['r', number, number, number, number] | ['c', number, number, number];
/** Pata: quadril e o deslocamento do pé para a frente e para cima. */
type Leg = { hx: number; hy: number; ox: number; lift: number; far: boolean };
type WolfPose = 'stand' | 'trot' | 'sit' | 'howl';

const BODY: Shape[] = [['e', 16, 14, 8, 4], ['e', 22, 14, 4, 5], ['e', 9, 13, 4, 4], ['e', 21, 11, 4, 5], ['e', 26, 9, 3, 3], ['r', 28, 9, 4, 3]];
const SIT: Shape[] = [['e', 12, 20, 5, 5], ['e', 16, 15, 4, 6], ['e', 19, 13, 3, 5], ['e', 19, 9, 4, 4], ['e', 23, 7, 3, 3], ['r', 25, 7, 4, 3]];
const HOWL: Shape[] = [['e', 12, 20, 5, 5], ['e', 16, 15, 4, 6], ['e', 19, 13, 3, 5], ['e', 19, 8, 4, 4], ['e', 22, 5, 3, 3], ['r', 23, 2, 3, 2], ['r', 24, 0, 3, 2]];

function fill(g: Ctx, shapes: Shape[], col: string): void {
  for (const s of shapes) {
    if (s[0] === 'e') ellipse(g, s[1], s[2], s[3], s[4], col);
    else if (s[0] === 'r') R(g, s[1], s[2], s[3], s[4], col);
    else circle(g, s[1], s[2], s[3], col);
  }
}

function leg(g: Ctx, l: Leg): void {
  const col = l.far ? FUR_D : FUR, fx = l.hx + l.ox, fy = GY - 1 - l.lift;
  const n = fy - l.hy;
  for (let i = 0; i <= n; i++) R(g, Math.round(l.hx + (l.ox * i) / n), l.hy + i, 2, 1, col);
  R(g, fx, fy, 3, 2, l.far ? FUR_D : '#6b331b');
}

/** Luz de cima: em cada coluna, o pelo de cima clareia e o de baixo escurece. */
function shadeFur(c: HTMLCanvasElement): void {
  const g = c.getContext('2d')!, img = g.getImageData(0, 0, FW, FH), d = img.data;
  const isFur = (i: number) => d[i + 3] === 255 && d[i] === 0x8a && d[i + 1] === 0x45;
  const set = (i: number, hex: string) => { d[i] = parseInt(hex.slice(1, 3), 16); d[i + 1] = parseInt(hex.slice(3, 5), 16); d[i + 2] = parseInt(hex.slice(5, 7), 16); };
  for (let x = 0; x < FW; x++) {
    let run: number[] = [];
    for (let y = 0; y <= FH; y++) {
      const i = (y * FW + x) * 4;
      if (y < FH && isFur(i)) { run.push(i); continue; }
      if (run.length >= 3) { set(run[0], FUR_L); set(run[run.length - 1], FUR_D); if (run.length >= 7) set(run[run.length - 2], FUR_D); }
      run = [];
    }
  }
  g.putImageData(img, 0, 0);
}

function frame(pose: WolfPose, f: number): HTMLCanvasElement {
  const [c, g] = mk(FW, FH);
  const sit = pose === 'sit' || pose === 'howl';
  const legs: Leg[] = [];
  if (sit) {
    legs.push({ hx: 21, hy: 16, ox: 0, lift: 0, far: true }, { hx: 19, hy: 16, ox: 0, lift: 0, far: false });
  } else {
    // trote em quatro quadros: as patas cruzadas andam juntas
    const T = [[-2, 0, 2, 1, 2, 0, -2, 1], [0, 1, 0, 0, 0, 1, 0, 0], [2, 1, -2, 0, -2, 1, 2, 0], [0, 0, 0, 1, 0, 0, 0, 1]][f];
    const m = pose === 'trot' ? T : [0, 0, 0, 0, 0, 0, 0, 0];
    legs.push(
      { hx: 11, hy: 15, ox: m[2], lift: m[3], far: true }, { hx: 23, hy: 16, ox: m[6], lift: m[7], far: true },
      { hx: 8, hy: 15, ox: m[0], lift: m[1], far: false }, { hx: 20, hy: 16, ox: m[4], lift: m[5], far: false },
    );
  }
  for (const l of legs.filter((x) => x.far)) leg(g, l);
  // rabo felpudo: pendurado em pé, enrolado no chão quando senta, e abanando de vez em quando
  const wag = f % 2 ? 1 : 0;
  const tail: Shape[] = sit ? [['c', 7, 24, 2], ['c', 4, 24 - wag, 2], ['c', 2, 22 - wag, 1]] : [['c', 5, 13, 2], ['c', 3, 15 + wag, 2], ['c', 2, 17 + wag, 2], ['c', 2 - wag, 19 + wag, 1]];
  fill(g, tail, FUR);
  fill(g, sit ? (pose === 'howl' ? HOWL : SIT) : BODY, FUR);
  // pelo desgrenhado no lombo e na juba, que é o que faz ele parecer enorme
  for (const [x, y] of sit ? [[14, 9], [16, 5], [15, 7]] : [[10, 9], [13, 9], [16, 9], [18, 6], [17, 7], [20, 5]]) R(g, x, y, 1, 1, FUR);
  if (sit) R(g, 13, 24, 5, 2, FUR);
  shadeFur(c);
  for (const l of legs.filter((x) => !x.far)) leg(g, l);
  const P = (x: number, y: number, w: number, h: number, col: string) => R(g, x, y, w, h, col);
  // pelagem: mechas escuras no lombo e o peito mais claro
  if (!sit) { P(13, 10, 2, 1, FUR_D); P(17, 10, 1, 1, FUR_D); P(10, 10, 1, 1, FUR_D); P(23, 14, 2, 3, CREAM); P(24, 17, 1, 1, CREAM); }
  else { P(19, 12, 2, 4, CREAM); P(18, 16, 1, 2, CREAM); P(15, 12, 1, 2, FUR_D); }
  P(2, sit ? 23 - wag : 19 + wag, 1, 1, '#3e1d0e');
  if (pose === 'howl') {
    // focinho para o céu, orelhas deitadas
    P(19, 2, 2, 2, FUR); P(18, 3, 2, 1, FUR_D); P(26, 0, 1, 1, NOSE); P(25, 2, 1, 2, CREAM); P(22, 4, 1, 1, NOSE);
  } else {
    const hx = sit ? 23 : 26, hy = sit ? 7 : 9, sx = sit ? 25 : 28;
    // orelhas: a de trás mais escura; num quadro a da frente gira
    P(hx - 3, hy - 3, 1, 1, FUR_D); P(hx - 3, hy - 2, 2, 1, FUR_D);
    if (f === 1 && pose !== 'trot') P(hx - 1, hy - 3, 3, 1, FUR);
    else { P(hx - 1, hy - 4, 2, 1, FUR); P(hx - 1, hy - 3, 3, 1, FUR); P(hx, hy - 3, 1, 1, '#3e1d0e'); }
    P(sx, hy + 1, 4, 1, CREAM); P(sx + 1, hy + 2, 2, 1, CREAM); P(sx + 3, hy, 1, 1, NOSE);
    P(sx + 1, hy + 2, 2, 1, '#3e1d0e');
    if (pose === 'sit' && f === 1) P(hx, hy - 1, 2, 1, FUR_D);
    else { P(hx, hy - 1, 1, 1, EYE); P(hx - 1, hy - 2, 2, 1, FUR_D); }
  }
  outline(c);
  return c;
}

function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = mk(FW, FH);
  g.translate(FW, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

type State = 'away' | 'in' | 'sit' | 'howl' | 'out';

export class Wolf {
  x = START;
  dir: 1 | -1 = 1;
  state: State = 'away';
  timer = 6 + Math.random() * 10;
  run = false;
  #sprites: Record<WolfPose, HTMLCanvasElement[][]>;
  #walk = 0;
  #blink = 0;
  #wasOut = false;

  constructor() {
    const build = (pose: WolfPose, n: number) => {
      const right = Array.from({ length: n }, (_, f) => frame(pose, f));
      return [right, right.map(mirror)];
    };
    this.#sprites = { stand: build('stand', 2), trot: build('trot', 4), sit: build('sit', 2), howl: build('howl', 1) };
  }

  visible(): boolean { return this.state !== 'away'; }

  /** Ao sair da casa, ele não demora muito a aparecer: é para ser visto, só não o tempo todo. */
  update(dt: number, outside: boolean, dark: number): void {
    if (outside && !this.#wasOut && this.state === 'away') this.timer = Math.min(this.timer, 3 + Math.random() * 5);
    this.#wasOut = outside;
    this.timer -= dt;
    this.#blink -= dt;
    if (this.state === 'away') {
      if (this.timer <= 0) Object.assign(this, { state: 'in', dir: 1, x: START, run: false });
    } else if (this.state === 'in' || this.state === 'out') {
      const v = (this.run ? 70 : 26) * dt;
      this.#walk += v;
      this.x += v * this.dir;
      if (this.state === 'in' && this.x >= SPOT) Object.assign(this, { x: SPOT, state: 'sit', timer: 16 + Math.random() * 14 });
      if (this.state === 'out' && this.x <= START) Object.assign(this, { state: 'away', timer: 30 + Math.random() * 50 });
    } else if (this.state === 'sit') {
      if (this.#blink <= -3.4) this.#blink = 0.18;
      if (this.timer <= 0) Object.assign(this, { state: 'out', dir: -1 });
      else if (dark > 0.6 && Math.random() < dt / 14) Object.assign(this, { state: 'howl', timer: 2.4 });
    } else if (this.timer <= 0) {
      Object.assign(this, this.run ? { state: 'out', dir: -1 } : { state: 'sit', timer: 6 + Math.random() * 8 });
    }
  }

  /** Tocar nele: um uivo curto e ele volta correndo para a mata. */
  poke(): void {
    if (this.state !== 'sit' && this.state !== 'in') return;
    Object.assign(this, { state: 'howl', timer: 1.4, run: true, dir: 1 });
  }

  #box(): Rect { return { x: Math.round(this.x) - GX, y: WOLF_Y - GY, w: FW, h: FH }; }

  hit(w: Pt): boolean {
    if (!this.visible()) return false;
    const b = this.#box();
    return w.x >= b.x + 2 && w.x <= b.x + FW - 2 && w.y >= b.y + 2 && w.y <= b.y + FH;
  }

  /** Desenha só dentro do mapa: a cerca da borda esconde a chegada. */
  draw(ctx: Ctx, t: number, mapW: number): void {
    if (!this.visible()) return;
    const b = this.#box(), side = this.dir === 1 ? 0 : 1, S = this.#sprites;
    let img = S.stand[side][0];
    if (this.state === 'in' || this.state === 'out') img = S.trot[side][Math.floor(this.#walk / 3) % 4];
    else if (this.state === 'howl') img = S.howl[side][0];
    else if (this.state === 'sit') img = S.sit[side][this.#blink > 0 ? 1 : 0];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, mapW, 9999);
    ctx.clip();
    ellipse(ctx, Math.round(this.x) + (this.state === 'sit' || this.state === 'howl' ? -2 : 0), WOLF_Y, 11, 2, 'rgba(0,0,0,0.3)');
    ctx.drawImage(img, b.x, b.y);
    ctx.restore();
    if (this.state === 'howl') this.#waves(ctx, t, b);
  }

  /** Arcos do uivo saindo do focinho. */
  #waves(ctx: Ctx, t: number, b: Rect): void {
    const k = Math.floor(t * 4) % 3, mx = this.dir === 1 ? b.x + 27 : b.x + FW - 28, s = this.dir;
    for (let i = 0; i <= k; i++) {
      const x = mx + s * (3 + i * 3), y = b.y - 2 - i * 3;
      R(ctx, x, y, 1, 1, 'rgba(240,236,226,0.8)'); R(ctx, x + s, y + 1, 1, 2, 'rgba(240,236,226,0.8)'); R(ctx, x - s, y - 1, 1, 1, 'rgba(240,236,226,0.8)');
    }
  }

  /** Por cima da escuridão: os olhos acesos à noite. */
  eyes(ctx: Ctx, dark: number): void {
    if (!this.visible() || dark < 0.5 || this.state === 'howl' || this.#blink > 0) return;
    const b = this.#box(), sit = this.state === 'sit', ex = sit ? 23 : 26, ey = sit ? 6 : 8;
    const x = this.dir === 1 ? b.x + ex : b.x + FW - 1 - ex;
    ctx.fillStyle = `rgba(255,200,90,${(0.25 * dark).toFixed(3)})`;
    ctx.fillRect(x - 1, b.y + ey - 1, 3, 3);
    R(ctx, x, b.y + ey, 1, 1, '#ffd56a');
  }
}
