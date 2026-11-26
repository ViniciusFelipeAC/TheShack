import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuotaWindow } from '@shack/shared';
import { agoText, orderWindows, resetLabel, tokensText, untilText, windowName } from '../src/usage.ts';

const w = (kind: string): QuotaWindow => ({ kind, status: 'allowed', percent: 1, resetsAt: null, updatedAt: '' });

test('janelas do plano: nomes em português, sessão e semana primeiro', () => {
  assert.equal(windowName('five_hour'), 'Sessão (5 horas)');
  assert.equal(windowName('seven_day'), 'Semana');
  assert.equal(windowName('model:Fable'), 'Semana do Fable');
  assert.deepEqual(orderWindows([w('model:Fable'), w('seven_day'), w('seven_day_opus'), w('five_hour')]).map((x) => x.kind),
    ['five_hour', 'seven_day', 'seven_day_opus', 'model:Fable']);
});

test('quando renova: hoje, amanhã ou o dia da semana, e quanto falta', () => {
  // Datas no fuso da máquina, como o app mostra.
  const now = new Date(2026, 10, 25, 21, 3);
  assert.equal(resetLabel(new Date(2026, 10, 25, 22, 20).toISOString(), now), 'renova hoje às 22:20');
  assert.equal(resetLabel(new Date(2026, 10, 26, 7, 0).toISOString(), now), 'renova amanhã às 07:00');
  assert.match(resetLabel(new Date(2026, 11, 2, 7, 0).toISOString(), now), /^renova .*02\/12.* às 07:00$/);
  assert.equal(untilText(new Date(2026, 10, 25, 21, 28).toISOString(), now), 'em 25 min');
  assert.equal(untilText(new Date(2026, 10, 25, 22, 20).toISOString(), now), 'em 1h17');
  assert.equal(untilText(new Date(2026, 11, 2, 7, 0).toISOString(), now), 'em 6 dias');
  assert.equal(untilText(new Date(2026, 10, 25, 20, 0).toISOString(), now), 'em 0 min');
  assert.equal(agoText(new Date(2026, 10, 25, 21, 3, 30).toISOString(), new Date(2026, 10, 25, 21, 3, 50)), 'agora');
  assert.equal(agoText(new Date(2026, 10, 25, 21, 0).toISOString(), now), 'há 3 min');
});

test('tokens em português', () => {
  assert.equal(tokensText(820), '820');
  assert.equal(tokensText(12_345), '12 mil');
  assert.equal(tokensText(4_600), '4,6 mil');
  assert.equal(tokensText(1_234_567), '1,2 mi');
});
