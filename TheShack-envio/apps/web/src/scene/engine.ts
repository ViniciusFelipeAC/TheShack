/* Motor da cena: personagens andando, câmera, luz do dia e da noite, neblina e entrada por toque.
   O React só informa o estado real dos agentes; aqui ele vira gente andando pela casa.
   As partes ficam em arquivos vizinhos: walker.ts (agentes), animated.ts (telas, fogo, TV), light.ts, sky.ts, input.ts e wolf.ts. */
import { drawFire, drawScreens, drawTv, drawTvSpill, forestView, type Live, tvLight, windowsOut } from './animated.ts';
import {
  buildExterior, buildForestFloor, buildFrame, buildFurniture, buildInterior, exteriorLights, exteriorPanes,
  type ForestView, forestViews, type Furniture, interiorLights, type Light,
} from './art.ts';
import { attachInput } from './input.ts';
import { BASE_W, planHouse, type Pt, type Rect, ROOM_H, T } from './layout.ts';
import { applyLight } from './light.ts';
import { houseOrder, type SceneAgentInput, sceneStateOf, stationKindOf } from './model.ts';
import { clamp, glyph, mk, R } from './pixel.ts';
import { buildFog, drawFog, FOG_ALPHA, sky, spHour, tf, type Weather } from './sky.ts';
import { activityOf, REST_KINDS, Walker, type World } from './walker.ts';
import { Wolf, WOLF_AREA, WOLF_Y } from './wolf.ts';

export type { Weather } from './sky.ts';
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

const DOOR_SPAWN: Pt = { x: 152, y: 187 };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number };

/* ---------- a cena ---------- */

export function createScene(canvas: HTMLCanvasElement, stage: HTMLElement, events: SceneEvents): SceneHandle {
  const ctx = canvas.getContext('2d')!;
  const RM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const [lightC] = mk(1, 1);
  const FOG = buildFog();
  const ground = ctx.createPattern(buildForestFloor(), 'repeat') ?? '#191812';
  const world: World = { layout: planHouse([]), resting: false };
  const walkers = new Map<string, Walker>();
  const wolf = new Wolf();
  const smoke: Particle[] = [], flue: Particle[] = [];
  let drops: Pt[] = [];

  let dpr = 1, cw = 1, ch = 1, zoom = 3, zMin = 1, zMax = 8, zDef = 3, userZoom = false, camX = 160, camY = 104, offX = 0, offY = 0;
  let map: MapName = 'in', follow = false, focusId: string | null = null, t = 0, flueT = 0, H = spHour();
  let fade: { a: number; phase: 'out' | 'in'; to: MapName } | null = null;
  let weather: Weather = 'fog', layoutSig = '', populated = false, lastActivity = '', insetTop = 0, insetBottom = 0;
  /** O tempo da cena para a arte animada; o laço atualiza `t` a cada quadro. */
  const live: Live = { ctx, t: 0, still: RM };

  type Statics = {
    inside: HTMLCanvasElement; frame: HTMLCanvasElement; furniture: Furniture[]; outside: HTMLCanvasElement; wolfFront: HTMLCanvasElement | null;
    views: ForestView[]; panes: Rect[]; doorPane: Rect; outLights: Light[];
  };
  let statics: Statics;

  function buildStatics(): void {
    const L = world.layout;
    const { panes, door } = exteriorPanes(L);
    const out = buildExterior(L, { rect: WOLF_AREA, y: WOLF_Y });
    statics = {
      inside: buildInterior(L), frame: buildFrame(L), outside: out.img, wolfFront: out.front,
      furniture: buildFurniture(L, {
        screens: (s) => drawScreens(live, s, s.agentId ? walkers.get(s.agentId) : undefined),
        fire: () => drawFire(live),
        tv: () => drawTv(live),
      }),
      views: forestViews(L), panes, doorPane: door, outLights: exteriorLights(L),
    };
    const W = L.outW * T + 32;
    drops = Array.from({ length: Math.round((150 * W) / 480) }, () => ({ x: Math.random() * W, y: Math.random() * 340 }));
  }
  buildStatics();

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
    R(ctx, v.x, v.y, v.w, v.h, 'rgba(8,12,14,0.22)');
    drawFog(ctx, FOG, v, FOG_ALPHA[weather].around, t, RM);
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
    forestView(live, statics.views, S, weather);
    ctx.drawImage(statics.frame, 0, 0);
    if (S.dark < 0.9) {
      ctx.fillStyle = `rgba(200,215,220,${(0.07 * (1 - S.dark)).toFixed(3)})`;
      for (const { rect } of statics.views) for (let r = 0; r < 40; r += 2) ctx.fillRect(rect.x + Math.round(r * 0.4), 48 + r, rect.w, 2);
    }
    drawTvSpill(live);
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
    windowsOut(live, h, statics.panes, statics.doorPane, L.stations, walkers);
    // o lobo passa atrás dos pinheiros: o recorte do que fica na frente dele vem por cima
    wolf.draw(ctx, t, L.outW * T);
    if (wolf.visible() && statics.wolfFront) ctx.drawImage(statics.wolfFront, WOLF_AREA.x, WOLF_AREA.y);
    drawParticles(flue, tf(h).dark > 0.5 ? '90,96,102' : '190,198,200');
    drawFog(ctx, FOG, { x: 0, y: 0, w: L.outW * T, h: L.outH * T }, FOG_ALPHA[weather].out, t, RM);
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
    L.push(tvLight(t, RM));
    return L;
  }

  function lighting(h: number): void {
    const { dark, dusk } = tf(h), out = map === 'out';
    applyLight(ctx, lightC, { cw, ch, zoom, offX, offY }, out ? statics.outLights : lightsIn(), out, dark, dusk);
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
    } else wolf.eyes(ctx, tf(H).dark);
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

  function hitAgent(w: Pt): Walker | null {
    if (map !== 'in') return null;
    let best: Walker | null = null;
    for (const a of walkers.values()) if (w.x >= a.x - 7 && w.x <= a.x + 7 && w.y >= a.y - 27 && w.y <= a.y + 3 && (!best || a.y > best.y)) best = a;
    return best;
  }
  const inRect = (w: Pt, r: Rect) => w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
  const hitDoor = (w: Pt) => inRect(w, map === 'in' ? world.layout.doorIn : world.layout.doorOut);
  const hitWolf = (w: Pt) => map === 'out' && wolf.hit(w);

  const detachInput = attachInput(canvas, {
    at(clientX, clientY) {
      const r = canvas.getBoundingClientRect(), sx = (clientX - r.left) * dpr, sy = (clientY - r.top) * dpr;
      return { x: (sx - offX) / zoom, y: (sy - offY) / zoom, sx, sy };
    },
    cam: () => ({ x: camX, y: camY, zoom, dpr }),
    pan(x, y) { camX = x; camY = y; clampCam(); offsets(); },
    zoomTo,
    grabbed() { follow = false; },
    hot: (w) => Boolean(hitAgent(w)) || hitWolf(w) || hitDoor(w),
    tap(w) {
      const a = hitAgent(w);
      if (a) events.onSelect(a.id);
      else if (hitWolf(w)) wolf.poke();
      else if (hitDoor(w)) switchMap(map === 'in' ? 'out' : 'in');
    },
  });

  /* ---------- laço principal ---------- */

  let last = performance.now(), raf = 0, uiT = 0, hT = 0;
  function update(dt: number): void {
    for (const a of walkers.values()) a.update(dt);
    wolf.update(dt, map === 'out', tf(H).dark);
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
      for (const a of walkers.values()) act[a.id] = activityOf(a, world, weather);
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
    live.t = t;
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
      detachInput();
    },
  };
}
