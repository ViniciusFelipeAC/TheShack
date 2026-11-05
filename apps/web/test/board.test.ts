import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalendarOccurrence, TodoList } from '@shack/shared';
import { checkFile, fitSize, formatSize } from '../src/attach.ts';
import { boardLists, dayKey, eventsByDay, localIso, monthGrid } from '../src/board.ts';

const ev = (id: string, start: Date, end: Date | null, allDay = false): CalendarOccurrence => ({
  id, title: id, start: start.toISOString(), end: end?.toISOString() ?? null, allDay, location: null, notes: null, rrule: null, source: 'local',
  createdAt: '', updatedAt: '', occurrenceStart: start.toISOString(), occurrenceEnd: end?.toISOString() ?? null,
});
const list = (id: string, name: string): TodoList => ({ id, name, items: [], createdAt: '', updatedAt: '' });

test('quadro: o mês começa no domingo e só tem as semanas necessárias', () => {
  const nov = monthGrid(2026, 10); // novembro de 2026 começa num domingo
  assert.equal(nov.length, 5);
  assert.equal(dayKey(nov[0]![0]!), '2026-11-01');
  assert.equal(dayKey(nov[4]![6]!), '2026-12-05');
  const feb = monthGrid(2026, 1); // fevereiro de 2026: começa no domingo e tem 28 dias
  assert.equal(feb.length, 4);
  const aug = monthGrid(2026, 7); // agosto de 2026 começa num sábado: seis semanas
  assert.equal(aug.length, 6);
  assert.equal(dayKey(aug[0]![0]!), '2026-07-26');
  for (const week of aug) assert.equal(week.length, 7);
});

test('quadro: compromisso aparece em cada dia que ocupa, e o dia todo vem primeiro', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);
  const map = eventsByDay([
    ev('dentista', at(5, 15), at(5, 16)),
    ev('viagem', at(6, 20), at(8, 10)),
    ev('feriado', at(5, 0), at(5, 23, 59), true),
    ev('festa', at(7, 22), at(8, 0)), // termina à meia-noite em ponto: não ocupa o dia 8
  ]);
  assert.deepEqual(map.get('2026-11-05')!.map((e) => e.id), ['feriado', 'dentista']);
  assert.deepEqual(map.get('2026-11-06')!.map((e) => e.id), ['viagem']);
  assert.deepEqual(map.get('2026-11-07')!.map((e) => e.id), ['viagem', 'festa']);
  assert.deepEqual(map.get('2026-11-08')!.map((e) => e.id), ['viagem']);
  assert.equal(map.has('2026-11-09'), false);
});

test('quadro: horário local sem fuso, como o servidor espera', () => {
  assert.equal(localIso(new Date(2026, 10, 5, 9, 5)), '2026-11-05T09:05');
});

test('quadro: acha a lista de compras e a de afazeres pelo id ou pelo nome', () => {
  const found = boardLists([list('x', 'Farmácia'), list('mercado', 'Feira'), list('afazeres', 'Coisas')]);
  assert.equal(found.shopping?.id, 'mercado', 'o id vale mesmo com outro nome');
  assert.equal(found.todo?.id, 'afazeres');
  const byName = boardLists([list('a', 'Compras do mês'), list('b', 'To-do')]);
  assert.equal(byName.shopping?.id, 'a');
  assert.equal(byName.todo?.id, 'b');
  assert.deepEqual(boardLists([]), { shopping: null, todo: null });
});

test('anexos: a foto cabe em 1568 px sem distorcer e nunca aumenta', () => {
  assert.deepEqual(fitSize(4032, 3024), { w: 1568, h: 1176 });
  assert.deepEqual(fitSize(3024, 4032), { w: 1176, h: 1568 });
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
});

test('anexos: o aparelho já avisa o que o servidor recusaria', () => {
  assert.equal(checkFile('foto.heic', 'image/heic', 3_000_000), null, 'HEIC passa: o app converte para JPEG');
  assert.equal(checkFile('foto.jpg', 'image/jpeg', 9_000_000), null, 'foto grande passa: o app reduz');
  assert.match(checkFile('planilha.xlsx', 'application/vnd.ms-excel', 10)!, /não lê esse tipo/);
  assert.match(checkFile('livro.pdf', 'application/pdf', 11 * 1024 * 1024)!, /10 MB/);
  assert.match(checkFile('log.txt', 'text/plain', 600 * 1024)!, /512 KB/);
  assert.equal(formatSize(1536), '2 KB');
  assert.equal(formatSize(2.5 * 1024 * 1024), '2,5 MB');
});
