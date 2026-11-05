import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_W, findPath, planHouse, type StationKind, T, WING_W } from '../src/scene/layout.ts';
import { houseOrder, idleKinds, lookOf, sceneStateOf } from '../src/scene/model.ts';

const DOOR = { x: 9, y: 11 };
const agents = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, kind: (i % 2 ? 'dual' : 'single') as StationKind }));
const reachable = (blocked: boolean[][], from: { x: number; y: number }, to: { x: number; y: number }) => findPath(blocked, from.x, from.y, to.x, to.y) !== null;

test('dois agentes cabem no cômodo principal, nas mesas do protótipo', () => {
  const L = planHouse([{ id: 'renfield', kind: 'single' }, { id: 'etnad', kind: 'dual' }]);
  assert.equal(L.wings, 0);
  assert.equal(L.w, BASE_W);
  assert.equal(L.desks.renfield.cx, 56);
  assert.equal(L.desks.etnad.cx, 168);
  assert.equal(L.desks.etnad.screens.length, 2);
  assert.equal(L.desks.renfield.screens.length, 1);
  for (const id of ['renfield', 'etnad']) {
    const d = L.desks[id];
    assert.ok(L.blocked[d.seatTile.y][d.seatTile.x], 'a cadeira bloqueia a passagem');
    assert.ok(reachable(L.blocked, DOOR, d.seatTile), `${id} chega na mesa a partir da porta`);
    for (const p of L.pois) assert.ok(reachable(L.blocked, d.standTile, p.tile), `${id} chega em ${p.id}`);
  }
});

test('cada agente novo ganha uma mesa; a cada dois, a casa ganha uma ala', () => {
  for (const n of [3, 4, 5, 7]) {
    const L = planHouse(agents(n));
    const wings = Math.ceil((n - 2) / 2);
    assert.equal(L.wings, wings);
    assert.equal(L.w, BASE_W + WING_W * wings);
    assert.equal(L.outW, 28 + 8 * wings, 'o exterior ganha um anexo por ala');
    const seats = new Set<string>();
    for (const a of agents(n)) {
      const d = L.desks[a.id];
      assert.ok(d, `${a.id} tem mesa`);
      assert.equal(d.kind, a.kind);
      seats.add(`${d.seatTile.x},${d.seatTile.y}`);
      assert.ok(d.seatTile.x > 0 && d.seatTile.x < L.w - 1);
      assert.ok(reachable(L.blocked, DOOR, d.seatTile), `${a.id} chega na mesa a partir da porta`);
      assert.ok(reachable(L.blocked, d.standTile, DOOR), `${a.id} volta até a porta`);
    }
    assert.equal(seats.size, n, 'ninguém divide mesa');
    for (const p of L.pois) assert.ok(reachable(L.blocked, DOOR, p.tile), `${p.id} é alcançável`);
    // as mesas das alas ficam dentro da ala, e a ala tem saída pela passagem
    for (const s of L.stations.filter((x) => x.room > 0)) {
      const left = BASE_W - 1 + WING_W * (s.room - 1);
      assert.ok(s.seatTile.x > left && s.seatTile.x < left + WING_W, `estação ${s.slot} dentro da ala ${s.room}`);
      assert.ok(s.cx === s.seatTile.x * T + 8);
    }
  }
});

test('com número ímpar de agentes, a ala tem uma mesa vazia e a planta continua válida', () => {
  const L = planHouse(agents(3));
  assert.equal(L.stations.length, 4);
  assert.equal(L.stations.filter((s) => s.agentId === null).length, 1);
});

test('casa vazia ainda tem as duas mesas do cômodo principal', () => {
  const L = planHouse([]);
  assert.equal(L.stations.length, 2);
  assert.deepEqual(L.desks, {});
});

test('o estado real vira comportamento na cena', () => {
  assert.deepEqual(sceneStateOf({ status: 'working', chat: true, currentTaskId: null }), { state: 'idle', talking: true });
  assert.deepEqual(sceneStateOf({ status: 'working', chat: false, currentTaskId: 't1' }), { state: 'working', talking: false });
  assert.deepEqual(sceneStateOf({ status: 'waiting_input', chat: false, currentTaskId: 't1' }), { state: 'waiting', talking: false });
  assert.deepEqual(sceneStateOf({ status: 'error', chat: false, currentTaskId: 't1' }), { state: 'error', talking: false });
  assert.deepEqual(sceneStateOf({ status: 'disabled', chat: false, currentTaskId: null }), { state: 'idle', talking: false });
});

test('agentes de chat ficam com as primeiras mesas, o resto segue a ordem do servidor', () => {
  const order = houseOrder([{ id: 'b', chat: false }, { id: 'm', chat: true }, { id: 'a', chat: false }]).map((a) => a.id);
  assert.deepEqual(order, ['m', 'b', 'a']);
});

test('a aparência vem do manifesto; o que faltar sai do id, sempre igual', () => {
  const renfield = lookOf('renfield', { palette: { skin: '#e3b896', outfit: '#22252d', sleeve: 'branco' }, accessory: 'bowtie', hair: 'neat' });
  assert.equal(renfield.skin, '#e3b896');
  assert.equal(renfield.accessory, 'bowtie');
  assert.equal(renfield.sleeve, '#d9d6cf', 'cor inválida é ignorada');
  assert.deepEqual(lookOf('novo', {}), lookOf('novo', {}));
  assert.notDeepEqual(lookOf('novo', {}), lookOf('outro', {}));
  assert.equal(lookOf('x', { accessory: 'chapéu' }).accessory, 'none');
});

test('preferências de ócio do manifesto viram lugares da casa', () => {
  assert.deepEqual(idleKinds({ idle: ['tea', 'sofa-read', 'fireplace', 'voar'] }), ['coffee', 'sofa', 'fire']);
  assert.deepEqual(idleKinds({}), []);
});
