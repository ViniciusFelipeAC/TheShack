/* Motor da cena: personagens andando, câmera, luz do dia e da noite, neblina e entrada por toque.
   O React só informa o estado real dos agentes; aqui ele vira gente andando pela casa. */
import {
  buildExterior, buildForestFloor, buildFrame, buildFurniture, buildInterior, exteriorLights, exteriorPanes,
  type ForestView, forestViews, type Furniture, interiorLights, type Light,
} from './art.ts';
import { buildCharacter, type Pose, type Sprites } from './characters.ts';
import {
  BASE_W, type Dir, findPath, type HouseLayout, planHouse, type Poi, type PoiKind, type Pt, type Rect,
  ROOM_H, type Station, T, wingLeft, WING_W,
} from './layout.ts';
import { houseOrder, idleKinds, lookOf, prefersTea, type SceneAgentInput, type SceneState, sceneStateOf, stationKindOf } from './model.ts';
import { clamp, glyph, mix, mk, R, rgbOf, rng } from './pixel.ts';

export type Weather = 'fog' | 'rain' | 'clear';
export type MapName = 'in' | 'out';
export type SceneEvents = {
  onSelect(id: string): void;
  onMap(map: MapName): void;
  /** O que cada agente faz na cena quando não há uma atividade real para mostrar, como "Tomando um café". */
  onActivity(activity: Record<string, string | null>): void;
};
export type SceneHandle = {
  setAgents(list: SceneAgentInput[]): void;
  setFocus(id: string | null): void;
  setWeather(w: Weather): void;
  /** Cota do plano esgotada: quem está livre vai descansar no sofá. */
  setResting(on: boolean): void;
  /** Espaço tomado pelo HUD em cima e embaixo, em pixels CSS. A casa fica no meio do que sobra. */
  setInsets(top: number, bottom: number): void;
  zoomBy(step: number): void;
  toggleMap(): void;
  destroy(): void;
};

const SPEED = 34;
const DOOR_SPAWN: Pt = { x: 152, y: 187 };
const REST_KINDS: PoiKind[] = ['sofa', 'armchair', 'fire'];
type World = { layout: HouseLayout; resting: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number };

const center = (tile: Pt): Pt => ({ x: tile.x * T + 8, y: tile.y * T + 11 });

/* ---------- personagens ---------- */

class Walker {
  readonly id: string;
  S: Sprites;
  desk: Station;
  prefs: PoiKind[] = [];
  tea = false;
  x = 0;
  y = 0;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  state: SceneState = 'idle';
  talking = false;
  mode: 'seated' | 'wait' | 'poi' | null = null;
  path: Pt[] = [];
  onArrive: (() => void) | null = null;
  dwell = 1;
  poi: Poi | null = null;
  lastPoi: Poi | null = null;
  walkDist = 0;
  phase = Math.random() * 10;
  smokeT = 0;
  #look = '';
  #world: World;

  constructor(world: World, input: SceneAgentInput, desk: Station) {
    this.id = input.id;
    this.#world = world;
    this.desk = desk;
    this.S = this.refresh(input) ?? buildCharacter(lookOf(input.id, input.appearance));
  }

  /** Redesenha os quadros se a aparência no manifesto mudou. */
  refresh(input: SceneAgentInput): Sprites | null {
    const look = JSON.stringify(input.appearance);
    if (look === this.#look) return null;
    this.#look = look;
    this.prefs = idleKinds(input.appearance);
    this.tea = prefersTea(input.appearance);
    this.S = buildCharacter(lookOf(input.id, input.appearance));
    return this.S;
  }

  seated(): boolean { return this.pose === 'sit_type' || this.pose === 'sit_scratch' || this.pose === 'sit_read'; }

  goTo(tile: Pt, anchor: Pt | null, cb?: () => void): void {
    const end = anchor ?? center(tile);
    const p = findPath(this.#world.layout.blocked, Math.floor(this.x / T), Math.floor(this.y / T), tile.x, tile.y);
    this.path = [];
    this.onArrive = null;
    if (!p) { this.x = end.x; this.y = end.y; cb?.(); return; }
    for (let i = 1; i < p.length; i++) this.path.push(center(p[i]));
    if (this.path.length) this.path[this.path.length - 1] = end;
    else if (Math.hypot(end.x - this.x, end.y - this.y) > 0.5) this.path.push(end);
    if (!this.path.length) { cb?.(); return; }
    this.onArrive = cb ?? null;
  }

  releasePoi(): void {
    if (this.poi) { this.poi.taken = null; this.poi = null; }
  }

  goSeat(): void {
    this.goTo(this.desk.seatTile, this.desk.seatAnchor, () => {
      this.dir = 'up';
      this.pose = this.state === 'error' ? 'sit_scratch' : 'sit_type';
      this.mode = 'seated';
    });
  }

  standUp(poi: Poi | null): void {
    const tile = poi && poi.pose === 'sit_read' ? { x: poi.tile.x, y: poi.tile.y + 1 } : this.desk.standTile;
    this.goTo(tile, null, () => { this.pose = 'stand'; this.dir = 'down'; });
  }

  setState(s: SceneState, force = false): void {
    if (this.state === s && !force) return;
    const fromPoi = this.mode === 'poi' ? this.poi : null;
    this.releasePoi();
    this.state = s;
    this.mode = null;
    this.onArrive = null;
    this.path = [];
    if (s === 'working' || s === 'error') this.goSeat();
    else if (s === 'waiting') this.goTo(this.desk.standTile, null, () => { this.dir = 'down'; this.pose = 'stand'; this.mode = 'wait'; });
    else {
      this.dwell = 0.8 + Math.random();
      if (this.seated()) this.standUp(fromPoi);
      else this.pose = 'stand';
    }
  }

  /** Posição inicial ao abrir a página: já sentado se estiver trabalhando, num canto qualquer se estiver livre. */
  place(): void {
    const d = this.desk;
    if (this.state === 'working' || this.state === 'error') {
      Object.assign(this, { x: d.seatAnchor.x, y: d.seatAnchor.y, dir: 'up', mode: 'seated' });
      this.pose = this.state === 'error' ? 'sit_scratch' : 'sit_type';
    } else if (this.state === 'waiting') {
      Object.assign(this, { ...center(d.standTile), dir: 'down', pose: 'stand', mode: 'wait' });
    } else {
      const { blocked } = this.#world.layout;
      const x0 = d.room === 0 ? 1 : wingLeft(d.room - 1) + 1, span = d.room === 0 ? BASE_W - 2 : WING_W - 1;
      let tile = d.standTile;
      for (let i = 0; i < 40; i++) {
        const c = { x: x0 + Math.floor(Math.random() * span), y: 5 + Math.floor(Math.random() * 6) };
        if (!blocked[c.y]?.[c.x]) { tile = c; break; }
      }
      Object.assign(this, { ...center(tile), dir: 'down', pose: 'stand', dwell: 1 + Math.random() * 2 });
    }
  }

  pickPoi(): void {
    const rest = this.#world.resting, last = this.lastPoi;
    let free = this.#world.layout.pois.filter((p) => !p.taken && p.id !== last?.id && !(p.kind === 'sofa' && last?.kind === 'sofa'));
    if (rest) free = free.filter((p) => REST_KINDS.includes(p.kind));
    const liked = free.filter((p) => this.prefs.includes(p.kind));
    const pool = liked.length && Math.random() < 0.7 ? liked : free;
    const p = pool[Math.floor(Math.random() * pool.length)];
    if (!p) { this.dwell = 2; return; }
    p.taken = this.id;
    this.poi = p;
    this.lastPoi = p;
    this.goTo(p.tile, p.anchor, () => {
      this.dir = p.dir;
      this.pose = p.pose;
      this.mode = 'poi';
      this.dwell = rest ? 40 + Math.random() * 40 : 6 + Math.random() * 7;
    });
  }

  update(dt: number): void {
    if (this.path.length) {
      const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy), step = SPEED * dt;
      if (Math.abs(dx) >= Math.abs(dy)) { if (Math.abs(dx) > 0.01) this.dir = dx > 0 ? 'right' : 'left'; } else this.dir = dy > 0 ? 'down' : 'up';
      this.pose = 'walk';
      if (d <= step) {
        this.x = p.x;
        this.y = p.y;
        this.walkDist += d;
        this.path.shift();
        if (!this.path.length) {
          this.pose = 'stand';
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this.walkDist += step;
      }
      return;
    }
    if (this.state !== 'idle' || this.talking) return;
    this.dwell -= dt;
    if (this.dwell > 0) return;
    if (this.mode === 'poi') {
      const p = this.poi;
      this.releasePoi();
      this.mode = null;
      this.dwell = 1 + Math.random() * 2;
      if (p && p.pose === 'sit_read') this.standUp(p);
      else this.pose = 'stand';
    } else this.pickPoi();
  }
}

/* ---------- textos do que cada um está fazendo ---------- */

const POI_TEXT: Record<PoiKind, [string, string]> = {
  coffee: ['pegar um café', 'Tomando um café'],
  sofa: ['ler no sofá', 'Lendo no sofá'],
  armchair: ['ler na poltrona', 'Lendo na poltrona'],
  shelf: ['até a estante', 'Escolhendo um livro'],
  window: ['até a janela', 'Olhando a neblina lá fora'],
  fire: ['até a lareira', 'Esquentando as mãos na lareira'],
  plant: ['regar a planta', 'Regando a planta'],
};
const WINDOW_TEXT: Record<Weather, string> = { fog: 'Olhando a neblina lá fora', rain: 'Olhando a chuva lá fora', clear: 'Olhando a floresta lá fora' };

/* ---------- tempo e céu ---------- */

let spFmt: Intl.DateTimeFormat | null = null;
try { spFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { /* sem fusos no navegador */ }

function spHour(): number {
  if (!spFmt) { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  let h = 0, m = 0;
  for (const p of spFmt.formatToParts(new Date())) { if (p.type === 'hour') h = +p.value; if (p.type === 'minute') m = +p.value; }
  return (h % 24) + m / 60;
}

function tf(h: number): { dark: number; dusk: number } {
  let dark = 0;
  if (h >= 19 || h < 5) dark = 1; else if (h >= 17) dark = (h - 17) / 2; else if (h < 7) dark = 1 - (h - 5) / 2;
  const dusk = clamp(Math.max(1 - Math.abs(h - 18) / 1.3, (1 - Math.abs(h - 6) / 1.1) * 0.7), 0, 1);
  return { dark, dusk };
}

function sky(h: number): { top: string; bot: string; dark: number; dusk: number } {
  const { dark, dusk } = tf(h);
  let top = mix('#97a3a4', '#0a0f12', dark), bot = mix('#bfc8c7', '#121a1f', dark);
  if (dusk > 0) { top = mix(top, '#4a5566', dusk * 0.6); bot = mix(bot, '#7d7480', dusk * 0.5); }
  return { top, bot, dark, dusk };
}

function buildFog(): HTMLCanvasElement {
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

/* ---------- a cena ---------- */

export function createScene(canvas: HTMLCanvasElement, stage: HTMLElement, events: SceneEvents): SceneHandle {
  const ctx = canvas.getContext('2d')!;
  const RM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const [lightC, lctx] = mk(1, 1);
  const FOG = buildFog();
  const ground = ctx.createPattern(buildForestFloor(), 'repeat') ?? '#191812';
  const world: World = { layout: planHouse([]), resting: false };
  const walkers = new Map<string, Walker>();
  const smoke: Particle[] = [], flue: Particle[] = [];
  let drops: Pt[] = [];

  let dpr = 1, cw = 1, ch = 1, zoom = 3, zMin = 1, zMax = 8, zDef = 3, userZoom = false, camX = 160, camY = 104, offX = 0, offY = 0;
  let map: MapName = 'in', follow = false, focusId: string | null = null, t = 0, flueT = 0, H = spHour();
  let fade: { a: number; phase: 'out' | 'in'; to: MapName } | null = null;
  let weather: Weather = 'fog', layoutSig = '', populated = false, lastActivity = '', insetTop = 0, insetBottom = 0;

  type Statics = {
    inside: HTMLCanvasElement; frame: HTMLCanvasElement; furniture: Furniture[]; outside: HTMLCanvasElement;
    views: ForestView[]; panes: Rect[]; doorPane: Rect; outLights: Light[];
  };
  let statics: Statics;

  function buildStatics(): void {
    const L = world.layout;
    const { panes, door } = exteriorPanes(L);
    statics = {
      inside: buildInterior(L), frame: buildFrame(L), outside: buildExterior(L),
      furniture: buildFurniture(L, { screens: drawScreens, fire: drawFire }),
      views: forestViews(L), panes, doorPane: door, outLights: exteriorLights(L),
    };
    const W = L.outW * T + 32;
    drops = Array.from({ length: Math.round((150 * W) / 480) }, () => ({ x: Math.random() * W, y: Math.random() * 340 }));
  }
  buildStatics();

  /* ---------- monitores, lareira, vista pelo vidro ---------- */

  function codeScreen(s: Rect, i: number): void {
    R(ctx, s.x, s.y, s.w, s.h, i ? '#0b100e' : '#0d1316');
    const rows = Math.floor((s.h - 1) / 2), off = Math.floor(t * (i ? 2.5 : 5)) + i * 11, cols = ['#8cc29b', '#e8a75a', '#8fb3d9', '#c9c3b6'];
    for (let r = 0; r < rows; r++) {
      const sd = Math.imul(off - r, 2654435761) >>> 0, y = s.y + s.h - 2 - r * 2;
      if (i) { R(ctx, s.x + 1, y, 1, 1, sd % 7 === 0 ? '#ef8170' : '#8cc29b'); R(ctx, s.x + 3, y, Math.min(4 + ((sd >>> 4) % 9), s.w - 4), 1, '#56625d'); }
      else { const ind = sd % 3, len = 3 + ((sd >>> 3) % 10); R(ctx, s.x + 1 + ind * 2, y, Math.min(len, s.w - 2 - ind * 2), 1, cols[(sd >>> 7) % cols.length]); }
    }
    if (!i && Math.floor(t * 2.5) % 2 === 0) R(ctx, s.x + s.w - 4, s.y + s.h - 2, 2, 1, '#e7ece9');
  }

  function assistantScreen(s: Rect): void {
    R(ctx, s.x, s.y, s.w, s.h, '#1a2321'); R(ctx, s.x, s.y, s.w, 2, '#2c3b36');
    for (let cx = 0; cx < 3; cx++) for (let cy = 0; cy < 3; cy++) R(ctx, s.x + 1 + cx * 2, s.y + 4 + cy * 2, 1, 1, '#4a5754');
    if (Math.floor(t * 1.5) % 2 === 0) R(ctx, s.x + 3, s.y + 6, 1, 1, '#e8a75a');
    const off = Math.floor(t * 0.7);
    for (let k = 0; k < 3; k++) {
      const idx = off + k, side = idx % 2, len = 4 + ((Math.imul(idx, 40503) >>> 0) % 6);
      R(ctx, side ? s.x + s.w - 1 - len : s.x + 8, s.y + 3 + k * 3, len, 2, side ? '#e8a75a' : '#4a5754');
    }
  }

  function drawScreens(st: Station): void {
    const a = st.agentId ? walkers.get(st.agentId) : undefined;
    if (!a) return;
    const busy = a.state === 'working' || a.talking;
    st.screens.forEach((s, i) => {
      if (busy) { if (st.kind === 'dual') codeScreen(s, i); else assistantScreen(s); }
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

  function drawFire(): void {
    const k = Math.floor(t * (RM ? 2 : 10));
    R(ctx, 261, 141, 12, 3, '#4a170a');
    for (let i = 0; i < 12; i++) {
      const s = Math.imul(k + i * 7, 2654435761) >>> 0, h = 3 + (s % 8);
      R(ctx, 261 + i, 144 - h, 1, h, (s >>> 5) % 3 === 0 ? '#f2a64a' : '#c9542a');
      if (h > 6) R(ctx, 261 + i, 144 - h, 1, 2, '#ffd27a');
    }
    R(ctx, 261, 129, 12, 1, 'rgba(255,255,255,0.07)');
  }

  function forestView(S: ReturnType<typeof sky>): void {
    const fogC = mix('#9aa6a6', '#1a2226', S.dark), farC = mix(mix('#4f5d58', '#0a1012', S.dark), fogC, 0.18), nearC = mix('#1a2822', '#050809', S.dark);
    for (const { rect, far, near } of statics.views) {
      const rx = rect.x, rw = rect.w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, 4, rw, 40);
      ctx.clip();
      for (let y = 4; y < 44; y += 4) R(ctx, rx, y, rw, 4, mix(S.top, S.bot, (y - 4) / 40));
      for (const tr of far) for (let r = 0; r < tr.h; r++) { const w = Math.round(r * 0.28) + 1; R(ctx, rx + tr.x - w, 40 - tr.h + r, w * 2, 1, farC); }
      ctx.fillStyle = `rgba(${rgbOf(fogC)},${weather === 'clear' ? 0.1 : 0.25})`;
      ctx.fillRect(rx, 22, rw, 14);
      for (const tr of near) for (let r = 0; r < tr.h; r++) { const w = Math.round(r * 0.32) + 1; R(ctx, rx + tr.x - w, 44 - tr.h + r, w * 2, 1, nearC); }
      R(ctx, rx, 41, rw, 3, mix('#1a201c', '#050707', S.dark));
      if (weather === 'rain' && !RM) {
        for (let i = 0; i < Math.round((28 * rw) / 214); i++) R(ctx, rx + ((i * 37) % rw), Math.floor(4 + ((t * 28 + i * 13) % 38)), 1, 2, 'rgba(200,215,220,0.35)');
      }
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let x = rx + 12; x < rx + rw; x += 36) ctx.fillRect(x, 4, 6, 40);
      ctx.restore();
    }
  }

  /* ---------- exterior: janelas, fumaça, neblina, chuva ---------- */

  function windowsOut(h: number): void {
    const { dark } = tf(h), base = mix('#a8773f', '#f2b25c', dark), hi = mix('#c99558', '#ffd994', dark);
    statics.panes.forEach((p, i) => {
      R(ctx, p.x, p.y, p.w, p.h, base); R(ctx, p.x, p.y, p.w, 2, hi);
      if (i % 5 === 1) R(ctx, p.x + p.w - 5, p.y + p.h - 9, 3, 9, 'rgba(30,20,12,0.5)');
      if (i % 4 === 0) R(ctx, p.x + 6, p.y + 3, 2, 2, '#fff1c8');
      if (dark < 0.5) R(ctx, p.x + 2, p.y + 2, 1, p.h - 4, 'rgba(200,220,225,0.25)');
    });
    const d = statics.doorPane;
    R(ctx, d.x, d.y, d.w, d.h, base); R(ctx, d.x, d.y, d.w, 2, hi); R(ctx, d.x + d.w - 4, d.y + 16, 1, 4, '#d9d2c4');
    for (const st of world.layout.stations) {
      const a = st.agentId ? walkers.get(st.agentId) : undefined;
      if (a && (a.state === 'working' || a.state === 'error')) {
        R(ctx, st.outside.x, st.outside.y, 6, 10, 'rgba(18,12,8,0.75)');
        R(ctx, st.outside.x + 1, st.outside.y - 4, 4, 4, 'rgba(18,12,8,0.75)');
      }
    }
  }

  /** Duas camadas de neblina deslizando em sentidos opostos, cobrindo o retângulo do mundo pedido. */
  function drawFog(area: Rect, alpha: number): void {
    if (alpha <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ([[RM ? 0 : 6, 1], [RM ? 0 : -3.5, 0.7]] as const).forEach(([v, k], li) => {
      ctx.globalAlpha = alpha * k;
      const ox = (((t * v + li * 90) % 320) + 320) % 320, oy = li * 40 - 90;
      const x0 = Math.floor((area.x + ox) / 320) * 320 - ox, y0 = Math.floor((area.y - oy) / 180) * 180 + oy;
      for (let x = x0; x < area.x + area.w; x += 320) for (let y = y0; y < area.y + area.h; y += 180) ctx.drawImage(FOG, x, y, 320, 180);
    });
    ctx.restore();
  }

  /** Pedaço do mundo que a câmera mostra agora. */
  const visible = (): Rect => {
    const x = Math.floor(-offX / zoom) - 1, y = Math.floor(-offY / zoom) - 1;
    return { x, y, w: Math.ceil(cw / zoom) + 2, h: Math.ceil(ch / zoom) + 2 };
  };

  /** Em volta da casa: chão da floresta com neblina, para a câmera nunca mostrar um vazio preto. */
  function drawSurroundings(): void {
    const v = visible(), L = world.layout, W = L.w * T, H = L.h * T;
    if (v.x >= 0 && v.y >= 0 && v.x + v.w <= W && v.y + v.h <= H) return;
    ctx.fillStyle = ground;
    ctx.fillRect(v.x, v.y, v.w, v.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.rect(0, 0, W, H);
    ctx.clip('evenodd');
    R(ctx, v.x, v.y, v.w, v.h, 'rgba(8,12,14,0.35)');
    drawFog(v, weather === 'fog' ? 0.42 : weather === 'rain' ? 0.24 : 0.1);
    ctx.restore();
  }

  function updateParticles(dt: number): void {
    if (!RM) {
      for (const a of walkers.values()) {
        if (a.state === 'error' && a.mode === 'seated') {
          a.smokeT -= dt;
          if (a.smokeT <= 0) {
            a.smokeT = 0.35;
            const s = a.desk.smokeAt;
            smoke.push({ x: s.x + Math.random() * 6 - 3, y: s.y, vx: (Math.random() - 0.5) * 2, vy: -5 - Math.random() * 3, life: 2.2, max: 2.2 });
          }
        }
      }
      if (map === 'out') {
        flueT -= dt;
        if (flueT <= 0) { flueT = 0.5; flue.push({ x: 301 + Math.random() * 3, y: 42, vx: 2 + Math.random() * 2, vy: -6 - Math.random() * 3, life: 3.6, max: 3.6 }); }
        if (weather === 'rain') {
          const W = world.layout.outW * T + 32;
          for (const d of drops) { d.y += 180 * dt; d.x -= 28 * dt; if (d.y > 330) { d.y -= 350; d.x = Math.random() * W; } if (d.x < -10) d.x += W - 10; }
        }
      }
    }
    for (const arr of [smoke, flue]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) arr.splice(i, 1);
      }
    }
  }

  function drawParticles(arr: Particle[], rgb: string): void {
    for (const p of arr) {
      const k = p.life / p.max, s = Math.round(2 + (1 - k) * 3);
      ctx.fillStyle = `rgba(${rgb},${(k * 0.55).toFixed(3)})`;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
  }

  /* ---------- desenho ---------- */

  function drawAgent(a: Walker): void {
    const set = a.S[a.dir], frames = set[a.pose] ?? set.stand ?? a.S.down.stand!;
    let f = 0;
    if (a.pose === 'walk') f = Math.floor(a.walkDist / 4) % 4;
    else if (a.pose === 'sit_type') f = Math.floor(t * 6 + a.phase) % 2;
    else if (a.pose === 'sit_scratch') f = Math.floor(t * 3) % 2;
    else if (a.pose === 'mug') f = (t + a.phase) % 4 > 3 ? 1 : 0;
    else if (a.pose === 'sit_read') f = (t + a.phase) % 5 > 4.6 ? 1 : 0;
    else if (a.pose === 'browse') f = Math.floor(t * 1.5) % 2;
    else if (a.pose === 'water') f = Math.floor(t * 4) % 2;
    else if (a.pose === 'stand') f = (t + a.phase) % 3.6 > 3.45 ? 1 : 0;
    f = Math.min(f, frames.length - 1);
    const x = Math.round(a.x), y = Math.round(a.y);
    if (focusId === a.id && !a.seated()) {
      const c = 'rgba(240,176,94,0.9)';
      R(ctx, x - 4, y - 3, 8, 1, c); R(ctx, x - 6, y - 2, 2, 1, c); R(ctx, x + 4, y - 2, 2, 1, c); R(ctx, x - 7, y - 1, 1, 2, c);
      R(ctx, x + 6, y - 1, 1, 2, c); R(ctx, x - 6, y + 1, 2, 1, c); R(ctx, x + 4, y + 1, 2, 1, c); R(ctx, x - 4, y + 2, 8, 1, c);
    }
    ctx.drawImage(frames[f], x - 12, y - 33);
  }

  function drawInterior(h: number): void {
    drawSurroundings();
    ctx.drawImage(statics.inside, 0, 0);
    const S = sky(h);
    forestView(S);
    ctx.drawImage(statics.frame, 0, 0);
    if (S.dark < 0.9) {
      ctx.fillStyle = `rgba(200,215,220,${(0.05 * (1 - S.dark)).toFixed(3)})`;
      for (const { rect } of statics.views) for (let r = 0; r < 40; r += 2) ctx.fillRect(rect.x + Math.round(r * 0.4), 48 + r, rect.w, 2);
    }
    const list: Array<{ sortY: number; agent?: Walker; item?: Furniture }> = statics.furniture.map((item) => ({ sortY: item.sortY, item }));
    for (const a of walkers.values()) list.push({ sortY: a.y, agent: a });
    list.sort((p, q) => p.sortY - q.sortY);
    for (const o of list) {
      if (o.agent) drawAgent(o.agent);
      else if (o.item) { ctx.drawImage(o.item.img, o.item.x, o.item.y); o.item.extra?.(); }
    }
    drawParticles(smoke, '140,146,150');
  }

  function drawExterior(h: number): void {
    const L = world.layout;
    ctx.drawImage(statics.outside, 0, 0);
    windowsOut(h);
    drawParticles(flue, tf(h).dark > 0.5 ? '90,96,102' : '190,198,200');
    drawFog({ x: 0, y: 0, w: L.outW * T, h: L.outH * T }, weather === 'fog' ? 0.48 : weather === 'rain' ? 0.28 : 0.1);
    if (weather === 'rain') {
      ctx.fillStyle = 'rgba(170,192,200,0.42)';
      for (const d of drops) { ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 4); ctx.fillRect(Math.round(d.x) - 1, Math.round(d.y) + 3, 1, 2); }
    }
  }

  function lightsIn(): Light[] {
    const fl = RM ? 0 : Math.sin(t * 9) * 2 + Math.sin(t * 23) * 1.5;
    const L = interiorLights(world.layout, fl);
    for (const st of world.layout.stations) {
      const a = st.agentId ? walkers.get(st.agentId) : undefined;
      if (!a) continue;
      const busy = a.state === 'working' || a.talking;
      const k = busy ? 1 : a.state === 'idle' ? 0.45 : 0.8, col = a.state === 'error' ? '255,96,86' : a.state === 'waiting' ? '255,200,120' : '150,200,235';
      for (const s of st.screens) L.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, r: 14 + 16 * k, c: col, g: 0.16 * k, cut: 0.8 });
    }
    return L;
  }

  function lighting(h: number): void {
    const { dark, dusk } = tf(h), out = map === 'out';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = out ? 'rgb(172,190,192)' : 'rgb(200,202,208)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    if (dusk > 0) { ctx.fillStyle = `rgba(58,70,110,${(0.15 * dusk).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
    const a = (out ? 0.16 : 0.26) + dark * (out ? 0.56 : 0.4), L = out ? statics.outLights : lightsIn();
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, cw, ch);
    lctx.fillStyle = `rgba(5,9,14,${a.toFixed(3)})`;
    lctx.fillRect(0, 0, cw, ch);
    lctx.globalCompositeOperation = 'destination-out';
    for (const l of L) {
      const sx = offX + l.x * zoom, sy = offY + l.y * zoom, r = l.r * zoom, gr = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(0,0,0,${l.cut ?? 0.92})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr;
      lctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightC, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const gk = 0.35 + 0.65 * dark;
    for (const l of L) {
      const sx = offX + l.x * zoom, sy = offY + l.y * zoom, r = l.r * zoom * 0.8, gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(${l.c},${(l.g * gk).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${l.c},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function bubble(x: number, y: number, kind: '?' | '.' | 'z'): void {
    R(ctx, x + 1, y, 7, 1, '#16181b'); R(ctx, x, y + 1, 9, 6, '#16181b'); R(ctx, x + 1, y + 7, 7, 1, '#16181b'); R(ctx, x + 1, y + 1, 7, 6, '#f1ece2'); R(ctx, x + 3, y + 8, 2, 1, '#16181b');
    if (kind === '?') glyph(ctx, '?', x + 3, y + 1, '#b4542e');
    else if (kind === 'z') glyph(ctx, 'z', x + 3, y + 1, '#4a5754');
    else for (let i = 0; i < 3; i++) { const up = !RM && Math.floor(t * 6) % 3 === i ? 1 : 0; R(ctx, x + 2 + i * 2, y + 4 - up, 1, 1, '#16181b'); }
  }

  function overlays(): void {
    ctx.setTransform(zoom, 0, 0, zoom, offX, offY);
    if (map === 'in') {
      for (const a of walkers.values()) {
        const bob = RM ? 0 : Math.round(Math.sin(t * 4 + a.phase) * 1.2), top = a.seated() ? (a.pose === 'sit_read' ? 33 : 35) : 38;
        const x = Math.round(a.x) - 4, y = Math.round(a.y) - top;
        if (a.state === 'waiting') bubble(x, y + bob, '?');
        else if (a.talking) bubble(x, y, '.');
        else if (world.resting && a.state === 'idle' && a.pose === 'sit_read' && Math.floor(t / 2) % 2 === 0) bubble(x, y, 'z');
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fade) { ctx.fillStyle = `rgba(4,6,7,${fade.a.toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
  }

  /* ---------- câmera ---------- */

  function msize(): { w: number; h: number } {
    const L = world.layout;
    return map === 'in' ? { w: L.w * T, h: L.h * T } : { w: L.outW * T, h: L.outH * T };
  }

  /** O zoom padrão enquadra o cômodo principal; afastando, dá para ver as alas inteiras. */
  function bounds(): void {
    const full = msize(), base = map === 'in' ? { w: BASE_W * T, h: ROOM_H * T } : { w: 448, h: 320 };
    const zf = Math.min(cw / base.w, ch / base.h), zl = Math.max(cw / base.w, ch / base.h);
    const zAll = Math.max(1, Math.floor(Math.min(cw / full.w, ch / full.h)));
    zDef = Math.max(1, Math.floor(Math.min(zl, zf * 1.6)), Math.floor(zf));
    zMin = Math.min(zAll, zDef);
    zMax = zDef + 4;
  }

  function clampCam(): void {
    const { w, h } = msize(), vw = cw / zoom, vh = ch / zoom;
    camX = vw >= w ? w / 2 : clamp(camX, vw / 2, w - vw / 2);
    // se a casa cabe inteira na altura, ela fica no meio do espaço que o HUD deixa livre
    camY = vh >= h ? clamp(h / 2 - ((insetTop - insetBottom) * dpr) / (2 * zoom), h - vh / 2, vh / 2) : clamp(camY, vh / 2, h - vh / 2);
  }

  function offsets(): void {
    offX = Math.round(cw / 2 - camX * zoom);
    offY = Math.round(ch / 2 - camY * zoom);
  }

  function resize(): void {
    const r = stage.getBoundingClientRect();
    // No celular (iPhone tem 3x), 2x já deixa o pixel art nítido e gasta bem menos bateria por quadro.
    dpr = Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 2 : 3);
    cw = Math.max(1, Math.round(r.width * dpr));
    ch = Math.max(1, Math.round(r.height * dpr));
    canvas.width = cw;
    canvas.height = ch;
    lightC.width = cw;
    lightC.height = ch;
    bounds();
    zoom = userZoom ? clamp(zoom, zMin, zMax) : zDef;
    clampCam();
    offsets();
  }

  function zoomTo(nz: number, sx = cw / 2, sy = ch / 2): void {
    nz = clamp(nz, zMin, zMax);
    if (nz === zoom) return;
    const wx = (sx - offX) / zoom, wy = (sy - offY) / zoom;
    zoom = nz;
    userZoom = true;
    camX = wx - (sx - cw / 2) / zoom;
    camY = wy - (sy - ch / 2) / zoom;
    clampCam();
    offsets();
  }

  function applyMap(to: MapName): void {
    map = to;
    userZoom = false;
    bounds();
    zoom = zDef;
    if (to === 'in') { camX = 160; camY = 104; } else { camX = 240; camY = 170; follow = false; }
    clampCam();
    offsets();
  }

  function switchMap(to: MapName): void {
    if (map === to && !fade) return;
    events.onMap(to);
    if (RM) { applyMap(to); return; }
    fade = { a: fade?.a ?? 0, phase: 'out', to };
  }

  /* ---------- entrada: arrastar, pinça, roda e toque ---------- */

  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; cx: number; cy: number } | null = null, pinch: { d: number; z: number } | null = null, moved = false, wheelAcc = 0;

  function worldAt(clientX: number, clientY: number): { x: number; y: number; sx: number; sy: number } {
    const r = canvas.getBoundingClientRect(), sx = (clientX - r.left) * dpr, sy = (clientY - r.top) * dpr;
    return { x: (sx - offX) / zoom, y: (sy - offY) / zoom, sx, sy };
  }
  function hitAgent(w: Pt): Walker | null {
    if (map !== 'in') return null;
    let best: Walker | null = null;
    for (const a of walkers.values()) if (w.x >= a.x - 7 && w.x <= a.x + 7 && w.y >= a.y - 27 && w.y <= a.y + 3 && (!best || a.y > best.y)) best = a;
    return best;
  }
  const inRect = (w: Pt, r: Rect) => w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
  const hitDoor = (w: Pt) => inRect(w, map === 'in' ? world.layout.doorIn : world.layout.doorOut);

  const onDown = (e: PointerEvent) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { drag = { sx: e.clientX, sy: e.clientY, cx: camX, cy: camY }; moved = false; }
    else if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, z: zoom };
      drag = null;
      moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) {
      const w = worldAt(e.clientX, e.clientY);
      canvas.style.cursor = hitAgent(w) || hitDoor(w) ? 'pointer' : 'grab';
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), nz = Math.round((pinch.z * d) / pinch.d);
      if (nz !== zoom) { const m = worldAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); zoomTo(nz, m.sx, m.sy); }
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; follow = false; canvas.style.cursor = 'grabbing'; }
      if (moved) { camX = drag.cx - (dx * dpr) / zoom; camY = drag.cy - (dy * dpr) / zoom; clampCam(); offsets(); }
    }
  };
  const onUp = (e: PointerEvent) => {
    const tap = pointers.size === 1 && drag && !moved;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (tap) {
      const w = worldAt(e.clientX, e.clientY), a = hitAgent(w);
      if (a) events.onSelect(a.id);
      else if (hitDoor(w)) switchMap(map === 'in' ? 'out' : 'in');
    }
    if (pointers.size === 0) { drag = null; canvas.style.cursor = 'grab'; }
    else if (pointers.size === 1) { const p = [...pointers.values()][0]; drag = { sx: p.x, sy: p.y, cx: camX, cy: camY }; moved = true; }
  };
  const onCancel = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = null; drag = null; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 60) return;
    const w = worldAt(e.clientX, e.clientY);
    zoomTo(zoom + (wheelAcc < 0 ? 1 : -1), w.sx, w.sy);
    wheelAcc = 0;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  /* ---------- laço principal ---------- */

  function activityOf(a: Walker): string | null {
    if (a.state === 'working') return a.path.length ? 'Indo para a mesa' : null;
    if (a.state === 'waiting') return a.path.length ? 'Levantando para falar com você' : null;
    if (a.state === 'error' || a.talking) return null;
    if (a.poi) {
      const [going, there] = a.poi.kind === 'coffee' && a.tea ? ['fazer um chá', 'Tomando um chá'] : POI_TEXT[a.poi.kind];
      if (a.path.length) return `Indo ${going}`;
      if (world.resting && a.poi.pose === 'sit_read') return a.poi.kind === 'sofa' ? 'Cochilando no sofá' : 'Cochilando na poltrona';
      return a.poi.kind === 'window' ? WINDOW_TEXT[weather] : there;
    }
    return a.path.length ? 'Andando pela casa' : 'Descansando';
  }

  let last = performance.now(), raf = 0, uiT = 0, hT = 0;
  function update(dt: number): void {
    for (const a of walkers.values()) a.update(dt);
    updateParticles(dt);
    const f = focusId ? walkers.get(focusId) : undefined;
    if (follow && f && map === 'in') {
      const k = RM ? 1 : Math.min(1, dt * 5);
      camX += (f.x - camX) * k;
      camY += (f.y - 16 - camY) * k;
      clampCam();
    }
    if (fade) {
      if (fade.phase === 'out') { fade.a += dt * 4; if (fade.a >= 1) { fade.a = 1; applyMap(fade.to); fade.phase = 'in'; } }
      else { fade.a -= dt * 4; if (fade.a <= 0) fade = null; }
    }
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.35;
      const act: Record<string, string | null> = {};
      for (const a of walkers.values()) act[a.id] = activityOf(a);
      const key = JSON.stringify(act);
      if (key !== lastActivity) { lastActivity = key; events.onActivity(act); }
    }
    hT -= dt;
    if (hT <= 0) { hT = 1; H = spHour(); }
  }

  function render(): void {
    offsets();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = map === 'in' ? '#0b0f10' : '#121a17';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(zoom, 0, 0, zoom, offX, offY);
    if (map === 'in') drawInterior(H); else drawExterior(H);
    lighting(H);
    overlays();
  }

  function loop(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  raf = requestAnimationFrame(loop);

  /* ---------- o que o React controla ---------- */

  function setAgents(list: SceneAgentInput[]): void {
    const ordered = houseOrder(list);
    const sig = ordered.map((a) => `${a.id}:${stationKindOf(a.appearance)}`).join('|');
    if (sig !== layoutSig) {
      layoutSig = sig;
      const prev = world.layout;
      world.layout = planHouse(ordered.map((a) => ({ id: a.id, kind: stationKindOf(a.appearance) })));
      buildStatics();
      const L = world.layout;
      for (const [id, w] of walkers) {
        const desk = L.desks[id];
        if (!desk) continue;
        w.desk = desk;
        const tx = Math.floor(w.x / T), ty = Math.floor(w.y / T);
        if (tx < 1 || tx >= L.w - 1 || ty < 3 || ty >= L.h - 1) { w.x = DOOR_SPAWN.x; w.y = DOOR_SPAWN.y; }
        w.poi = w.poi ? L.pois.find((p) => p.id === w.poi!.id) ?? null : null;
        if (w.poi) w.poi.taken = w.id;
        w.lastPoi = null;
        if (w.path.length || w.state !== 'idle' || L.w !== prev.w) w.setState(w.state, true);
      }
      bounds();
      clampCam();
    }

    const seen = new Set<string>();
    for (const a of ordered) {
      seen.add(a.id);
      const { state, talking } = sceneStateOf(a);
      let w = walkers.get(a.id);
      if (!w) {
        w = new Walker(world, a, world.layout.desks[a.id]);
        walkers.set(a.id, w);
        w.state = state;
        if (populated) { Object.assign(w, { ...DOOR_SPAWN, dir: 'up' }); w.setState(state, true); }
        else w.place();
      } else {
        w.refresh(a);
        w.setState(state);
      }
      w.talking = talking;
    }
    for (const [id, w] of walkers) if (!seen.has(id)) { w.releasePoi(); walkers.delete(id); }
    if (ordered.length) populated = true;
  }

  return {
    setAgents,
    setFocus(id) {
      focusId = id;
      follow = Boolean(id);
      if (id && map !== 'in') switchMap('in');
    },
    setWeather(w) { weather = w; },
    setResting(on) {
      if (world.resting === on) return;
      world.resting = on;
      for (const a of walkers.values()) {
        if (a.state === 'idle' && a.mode === 'poi' && a.poi && REST_KINDS.includes(a.poi.kind) !== on) a.dwell = 0;
        else if (a.state === 'idle' && a.mode !== 'poi' && !a.path.length) a.dwell = Math.min(a.dwell, 0.5);
      }
    },
    setInsets(top, bottom) {
      if (top === insetTop && bottom === insetBottom) return;
      insetTop = top;
      insetBottom = bottom;
      clampCam();
      offsets();
    },
    zoomBy(step) { zoomTo(zoom + step); },
    toggleMap() { switchMap((fade ? fade.to : map) === 'in' ? 'out' : 'in'); },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
