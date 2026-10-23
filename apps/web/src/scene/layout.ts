/* Planta da casa: grade de tiles, estações, pontos de interesse e portas.
   Não desenha nada, então dá para testar no Node. A arte em art.ts segue estas medidas. */

export const T = 16;
export const ROOM_H = 13;
/** Cômodo principal, com a porta, o café, o sofá e as duas primeiras estações. */
export const BASE_W = 20;
/** Cada ala nova tem duas estações e divide a parede com o cômodo à esquerda. */
export const WING_W = 11;
/** Linhas da passagem entre um cômodo e o próximo. */
export const DOORWAY_ROWS = [5, 6, 7];
/** Largura de cada anexo da casa, visto lá de fora. */
export const ANNEX_PX = 128;
const BASE_OUT_W = 28;
const OUT_H = 20;
const BASE_SEATS = [3, 10];

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Dir = 'down' | 'up' | 'left' | 'right';
export type StationKind = 'single' | 'dual';
export type PoiKind = 'coffee' | 'sofa' | 'shelf' | 'window' | 'fire' | 'plant' | 'armchair';
export type PoiPose = 'mug' | 'sit_read' | 'browse' | 'stand' | 'water';

export type Station = {
  slot: number;
  /** 0 é o cômodo principal; 1 em diante são as alas. */
  room: number;
  agentId: string | null;
  kind: StationKind;
  /** Centro do assento, em pixels do mundo. */
  cx: number;
  seatTile: Pt;
  seatAnchor: Pt;
  standTile: Pt;
  screens: Rect[];
  bezels: Rect[];
  smokeAt: Pt;
  /** Onde a silhueta do agente aparece na janela, vista de fora. */
  outside: Pt;
};

export type Poi = { id: string; kind: PoiKind; room: number; tile: Pt; anchor: Pt; dir: Dir; pose: PoiPose; taken: string | null };

export type HouseLayout = {
  wings: number;
  /** Interior, em tiles. */
  w: number;
  h: number;
  blocked: boolean[][];
  stations: Station[];
  desks: Record<string, Station>;
  pois: Poi[];
  doorIn: Rect;
  doorOut: Rect;
  /** Exterior, em tiles. */
  outW: number;
  outH: number;
};

/** Coluna da parede esquerda da ala k. */
export const wingLeft = (k: number): number => BASE_W - 1 + WING_W * k;
/** Começo do anexo k na vista de fora, em pixels. */
export const annexX = (k: number): number => 332 + ANNEX_PX * k;

function stationAt(slot: number, room: number, seatCol: number, kind: StationKind, agentId: string | null, outside: Pt): Station {
  const cx = seatCol * T + 8;
  const dual = kind === 'dual';
  return {
    slot, room, agentId, kind, cx,
    seatTile: { x: seatCol, y: 4 },
    seatAnchor: { x: cx, y: 66 },
    standTile: { x: seatCol, y: 5 },
    screens: dual
      ? [{ x: cx - 20, y: 28, w: 18, h: 11 }, { x: cx + 3, y: 28, w: 18, h: 11 }]
      : [{ x: cx - 10, y: 28, w: 20, h: 12 }],
    bezels: dual
      ? [{ x: cx - 22, y: 26, w: 22, h: 15 }, { x: cx + 1, y: 26, w: 22, h: 15 }]
      : [{ x: cx - 12, y: 26, w: 24, h: 16 }],
    smokeAt: { x: dual ? cx + 12 : cx, y: 25 },
    outside,
  };
}

/**
 * Monta a casa para a lista de agentes, na ordem em que eles ocupam as mesas.
 * As duas primeiras ficam no cômodo principal; cada par seguinte ganha uma ala nova à direita.
 */
export function planHouse(agents: Array<{ id: string; kind: StationKind }>): HouseLayout {
  const wings = Math.ceil(Math.max(0, agents.length - 2) / 2);
  const w = BASE_W + WING_W * wings, h = ROOM_H;
  const blocked: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) row.push(y <= 2 || x === 0 || x === w - 1 || y === h - 1);
    blocked.push(row);
  }
  const block = (x: number, y: number) => { blocked[y][x] = true; };

  // paredes entre os cômodos, com a passagem no meio
  for (let k = 0; k < wings; k++) {
    for (let y = 0; y < h; y++) if (!DOORWAY_ROWS.includes(y)) block(wingLeft(k), y);
  }

  // cômodo principal: ilha do café, figueira, estante, sofá, lareira e plantas
  for (const x of [5, 6, 7, 8, 16, 17, 18]) block(x, 3);
  for (const x of [13, 14, 15, 16]) { block(x, 8); block(x, 9); }
  block(1, 11);
  block(18, 11);

  // estações: duas no cômodo principal e duas por ala
  const stations: Station[] = [];
  for (let slot = 0; slot < 2 + wings * 2; slot++) {
    const agent = agents[slot] ?? null;
    const kind = agent?.kind ?? 'single';
    if (slot < 2) {
      stations.push(stationAt(slot, 0, BASE_SEATS[slot], kind, agent?.id ?? null, { x: slot === 0 ? 190 : 262, y: 121 }));
    } else {
      const k = Math.floor((slot - 2) / 2), side = (slot - 2) % 2;
      const ax = annexX(k);
      stations.push(stationAt(slot, k + 1, wingLeft(k) + (side === 0 ? 3 : 8), kind, agent?.id ?? null, { x: ax + (side === 0 ? 37 : 79), y: 182 }));
    }
  }
  for (const s of stations) {
    for (let dx = -1; dx <= 1; dx++) block(s.seatTile.x + dx, 3);
    block(s.seatTile.x, 4);
  }

  // alas: poltrona com luminária, planta no canto de baixo e outra no canto de cima
  for (let k = 0; k < wings; k++) {
    const wl = wingLeft(k);
    for (const x of [wl + 1, wl + 2]) { block(x, 8); block(x, 9); }
    block(wl + 10, 11);
    block(wl + 10, 3);
  }

  const pois: Poi[] = [
    { id: 'coffee', kind: 'coffee', room: 0, tile: { x: 6, y: 4 }, anchor: { x: 111, y: 76 }, dir: 'down', pose: 'mug', taken: null },
    { id: 'sofa', kind: 'sofa', room: 0, tile: { x: 14, y: 9 }, anchor: { x: 232, y: 145 }, dir: 'down', pose: 'sit_read', taken: null },
    { id: 'sofa2', kind: 'sofa', room: 0, tile: { x: 13, y: 9 }, anchor: { x: 219, y: 145 }, dir: 'down', pose: 'sit_read', taken: null },
    { id: 'shelf', kind: 'shelf', room: 0, tile: { x: 17, y: 4 }, anchor: { x: 272, y: 76 }, dir: 'up', pose: 'browse', taken: null },
    { id: 'window', kind: 'window', room: 0, tile: { x: 14, y: 3 }, anchor: { x: 224, y: 60 }, dir: 'up', pose: 'stand', taken: null },
    { id: 'fire', kind: 'fire', room: 0, tile: { x: 17, y: 9 }, anchor: { x: 282, y: 154 }, dir: 'left', pose: 'stand', taken: null },
    { id: 'plant', kind: 'plant', room: 0, tile: { x: 2, y: 11 }, anchor: { x: 40, y: 186 }, dir: 'left', pose: 'water', taken: null },
  ];
  for (let k = 0; k < wings; k++) {
    const wl = wingLeft(k);
    pois.push(
      { id: `window-${k + 1}`, kind: 'window', room: k + 1, tile: { x: wl + 5, y: 3 }, anchor: { x: (wl + 5) * T + 16, y: 60 }, dir: 'up', pose: 'stand', taken: null },
      { id: `armchair-${k + 1}`, kind: 'armchair', room: k + 1, tile: { x: wl + 2, y: 9 }, anchor: { x: (wl + 2) * T + 8, y: 145 }, dir: 'down', pose: 'sit_read', taken: null },
      { id: `plant-${k + 1}`, kind: 'plant', room: k + 1, tile: { x: wl + 9, y: 11 }, anchor: { x: (wl + 9) * T + 8, y: 186 }, dir: 'right', pose: 'water', taken: null },
    );
  }

  const desks: Record<string, Station> = {};
  for (const s of stations) if (s.agentId) desks[s.agentId] = s;

  return {
    wings, w, h, blocked, stations, desks, pois,
    doorIn: { x: 142, y: 176, w: 36, h: 32 },
    doorOut: { x: 226, y: 160, w: 30, h: 60 },
    outW: BASE_OUT_W + (ANNEX_PX / T) * wings,
    outH: OUT_H,
  };
}

/** Caminho pela grade (A*, quatro direções). O destino pode ser um tile bloqueado, como uma cadeira. */
export function findPath(blocked: boolean[][], sx: number, sy: number, gx: number, gy: number): Pt[] | null {
  const H = blocked.length, W = blocked[0]?.length ?? 0;
  const key = (x: number, y: number) => y * W + x;
  const open = [{ x: sx, y: sy, g: 0, f: Math.abs(sx - gx) + Math.abs(sy - gy) }];
  const came = new Map<number, number>(), gs = new Map<number, number>([[key(sx, sy), 0]]), closed = new Set<number>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === gx && cur.y === gy) {
      const path: Pt[] = [];
      let k: number | undefined = ck;
      while (k !== undefined) { path.push({ x: k % W, y: Math.floor(k / W) }); k = came.get(k); }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (blocked[ny][nx] && !(nx === gx && ny === gy)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + 1;
      if (ng < (gs.get(nk) ?? Infinity)) {
        gs.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(nx - gx) + Math.abs(ny - gy) });
      }
    }
  }
  return null;
}
