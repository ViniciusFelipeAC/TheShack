/* Cada agente andando pela casa: caminho por A*, mesa, lugares preferidos e o texto do que está fazendo. */
import { buildCharacter, type Pose, type Sprites } from './characters.ts';
import { BASE_W, type Dir, findPath, type HouseLayout, type Poi, type PoiKind, type Pt, type Station, T, wingLeft, WING_W } from './layout.ts';
import { idleKinds, lookOf, prefersTea, type SceneAgentInput, type SceneState } from './model.ts';
import type { Weather } from './sky.ts';

const SPEED = 34;
export const REST_KINDS: PoiKind[] = ['sofa', 'armchair', 'fire'];
export type World = { layout: HouseLayout; resting: boolean };

const center = (tile: Pt): Pt => ({ x: tile.x * T + 8, y: tile.y * T + 11 });

export class Walker {
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

export function activityOf(a: Walker, world: World, weather: Weather): string | null {
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
