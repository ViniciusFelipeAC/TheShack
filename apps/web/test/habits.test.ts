import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellLabel, habitStats, habitWeeks, monthLabels, stepDay } from '../src/habits.ts';

test('hábitos: 53 semanas de domingo a sábado, e a última para em hoje', () => {
  const weeks = habitWeeks(new Date(2026, 10, 25, 15)); // quarta, 25/11/2026
  assert.equal(weeks.length, 53);
  assert.equal(weeks[0]![0], '2025-11-23', 'começa num domingo, 52 semanas antes');
  for (const w of weeks.slice(0, -1)) assert.equal(w.length, 7);
  assert.deepEqual(weeks.at(-1), ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'], 'amanhã não tem quadradinho');
  assert.equal(new Set(weeks.flat()).size, weeks.flat().length, 'nenhum dia repetido');
  // Num sábado a última coluna fica cheia.
  assert.equal(habitWeeks(new Date(2026, 10, 28)).at(-1)!.length, 7);
});

test('hábitos: mês em cima da coluna em que começa, sem nomes encavalados', () => {
  const weeks = habitWeeks(new Date(2026, 10, 25));
  const labels = monthLabels(weeks);
  // A primeira coluna é de novembro de 2025 e dezembro começa duas colunas depois: novembro sai.
  assert.deepEqual(labels[0], { col: 2, label: 'dez' });
  assert.equal(labels.at(-1)!.label, 'nov');
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i]!.col - labels[i - 1]!.col >= 4, 'cabe o nome');
  assert.equal(labels.length, 12);
});

test('hábitos: o resumo conta só o que aparece na grade', () => {
  const h = { streak: 3, best: 12, days: ['2025-01-10', '2026-11-23', '2026-11-24', '2026-11-25'] };
  assert.equal(habitStats(h, '2025-11-23'), 'Sequência de 3 dias · recorde de 12 dias · 3 dias no último ano');
  assert.equal(habitStats({ streak: 0, best: 1, days: ['2026-11-01'] }, '2025-11-23'), 'Sem sequência agora · recorde de 1 dia · 1 dia no último ano');
  assert.equal(habitStats({ streak: 0, best: 0, days: [] }, '2025-11-23'), 'Nenhum dia marcado ainda');
  assert.match(cellLabel('2026-11-25', true), /^Quarta-feira, 25 de novembro: feito$/);
});

test('hábitos: as setas andam pela grade sem passar de hoje nem do começo', () => {
  assert.equal(stepDay('2026-11-18', 'ArrowRight', '2025-11-23', '2026-11-25'), '2026-11-25');
  assert.equal(stepDay('2026-11-25', 'ArrowRight', '2025-11-23', '2026-11-25'), '2026-11-25', 'não vai para o futuro');
  assert.equal(stepDay('2026-11-25', 'ArrowUp', '2025-11-23', '2026-11-25'), '2026-11-24');
  assert.equal(stepDay('2025-11-23', 'ArrowLeft', '2025-11-23', '2026-11-25'), '2025-11-23');
  assert.equal(stepDay('2026-03-31', 'ArrowDown', '2025-11-23', '2026-11-25'), '2026-04-01', 'vira o mês');
  assert.equal(stepDay('2026-11-25', 'Enter', '2025-11-23', '2026-11-25'), null);
});
