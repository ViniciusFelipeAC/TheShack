import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { z } from 'zod';
import { dayIn, isDay, streaks } from '../src/assistant/habits.ts';
import { assistantTools } from '../src/renfield/assistant-tools.ts';
import { activityOf } from '../src/renfield/engine.ts';
import { day } from '../src/renfield/lenient.ts';
import { setup } from './helpers.ts';

type S = ReturnType<typeof setup>;
const ctx = { conversationId: 'main' };
// Os argumentos passam pelos schemas tolerantes, como no motor de verdade.
const call = async (s: S, name: string, args: Record<string, unknown>) => {
  const t = assistantTools({ ...s.shack, timezone: 'America/Sao_Paulo' }).find((x) => x.name === name)!;
  return t.run(z.object(t.shape).parse(args), ctx);
};
const run = async (s: S, name: string, args: Record<string, unknown>) => JSON.parse(await call(s, name, args));
// O motor transforma o erro em "Erro: ... Nada foi feito."; aqui basta a mensagem.
const failure = async (s: S, name: string, args: Record<string, unknown>) => {
  try { await call(s, name, args); } catch (e) { return (e as Error).message; }
  throw new Error(`${name} devia ter falhado`);
};

test('hábitos: o dia é o da casa, não o de UTC', () => {
  // 23h de 25/11 em São Paulo já é 26/11 em UTC.
  assert.equal(dayIn('America/Sao_Paulo', new Date('2026-11-26T02:00:00Z')), '2026-11-25');
  assert.equal(dayIn('America/Sao_Paulo', new Date('2026-11-26T03:00:00Z')), '2026-11-26');
  assert.ok(isDay('2028-02-29'));
  assert.equal(isDay('2026-02-30'), false, 'data que não existe');
  assert.equal(isDay('2026-11-5'), false);
});

test('hábitos: sequência atual e recorde, e hoje sem marca não quebra a sequência', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-22', '2026-11-23', '2026-11-24'];
  assert.deepEqual(streaks(days, '2026-11-24'), { streak: 3, best: 4 });
  assert.deepEqual(streaks(days, '2026-11-25'), { streak: 3, best: 4 }, 'o dia de hoje ainda não acabou');
  assert.deepEqual(streaks(days, '2026-11-26'), { streak: 0, best: 4 }, 'ontem sem marca quebra');
  assert.deepEqual(streaks([...days, '2026-11-25'], '2026-11-25'), { streak: 4, best: 4 });
  // Virada de mês e de ano contam como dias seguidos.
  assert.deepEqual(streaks(['2025-12-31', '2026-01-01'], '2026-01-01'), { streak: 2, best: 2 });
  assert.deepEqual(streaks([], '2026-11-25'), { streak: 0, best: 0 });
});

test('hábitos: criar quantos quiser, marcar e desmarcar dias pela API', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-11-25T15:00:00Z'); // meio-dia em São Paulo
  assert.deepEqual((await s.call('GET', '/habits')).body, [], 'começa sem nenhum');

  const ler = await s.call('POST', '/habits', { name: 'Ler 20 páginas' });
  assert.equal(ler.status, 201);
  assert.equal(ler.body.color, 'moss', 'o primeiro pega o primeiro tom');
  const gym = (await s.call('POST', '/habits', { name: 'Academia' })).body;
  assert.equal(gym.color, 'amber', 'o próximo pega o tom seguinte');
  const agua = (await s.call('POST', '/habits', { name: 'Beber água', color: 'sky' })).body;
  assert.equal(agua.color, 'sky');
  assert.equal((await s.call('POST', '/habits', { name: 'academia' })).status, 409, 'nome repetido, sem diferenciar maiúsculas');
  assert.equal((await s.call('POST', '/habits', { name: 'BEBER ÁGUA' })).status, 409, 'nem com acento');
  assert.equal((await s.call('POST', '/habits', { name: 'x', color: 'neon' })).status, 400);

  for (const d of ['2026-11-23', '2026-11-24', '2026-11-25']) await s.call('PUT', `/habits/${gym.id}/days/${d}`);
  let h = (await s.call('PUT', `/habits/${gym.id}/days/2026-11-25`)).body; // marcar de novo não duplica
  assert.deepEqual(h.days, ['2026-11-23', '2026-11-24', '2026-11-25']);
  assert.deepEqual([h.streak, h.best, h.total], [3, 3, 3]);

  h = (await s.call('DELETE', `/habits/${gym.id}/days/2026-11-24`)).body;
  assert.deepEqual(h.days, ['2026-11-23', '2026-11-25']);
  assert.deepEqual([h.streak, h.best], [1, 1]);

  assert.equal((await s.call('PUT', `/habits/${gym.id}/days/2026-11-26`)).status, 400, 'amanhã ainda não chegou');
  assert.equal((await s.call('PUT', `/habits/${gym.id}/days/2026-02-30`)).status, 400);
  assert.equal((await s.call('PUT', `/habits/${gym.id}/days/ontem`)).status, 400, 'a API só aceita AAAA-MM-DD');
  assert.equal((await s.call('PUT', '/habits/nao-existe/days/2026-11-25')).status, 404);

  const all = (await s.call('GET', '/habits')).body as Array<{ name: string; days: string[] }>;
  assert.deepEqual(all.map((x) => x.name), ['Ler 20 páginas', 'Academia', 'Beber água'], 'na ordem em que foram criados');

  // A janela padrão é o último ano; `from` pede mais (ou menos).
  await s.call('PUT', `/habits/${ler.body.id}/days/2024-01-10`);
  assert.deepEqual((await s.call('GET', '/habits')).body[0].days, []);
  assert.equal((await s.call('GET', '/habits')).body[0].total, 1, 'o total conta tudo');
  assert.deepEqual((await s.call('GET', '/habits?from=2024-01-01')).body[0].days, ['2024-01-10']);
  assert.equal((await s.call('GET', '/habits?from=ontem')).status, 400);

  const renamed = await s.call('PATCH', `/habits/${gym.id}`, { name: 'Musculação', color: 'rose' });
  assert.deepEqual([renamed.body.name, renamed.body.color, renamed.body.days.length], ['Musculação', 'rose', 2], 'o histórico fica');
  assert.equal((await s.call('PATCH', `/habits/${gym.id}`, { name: 'beber água' })).status, 409);

  assert.equal((await s.call('DELETE', `/habits/${gym.id}`)).status, 200);
  assert.equal(s.shack.db.prepare('SELECT COUNT(*) AS n FROM habit_days WHERE habit_id = ?').get(gym.id)!.n, 0, 'os dias saem junto');
  assert.equal((await s.call('GET', '/habits')).body.length, 2);

  const changed = (await s.call('GET', '/events?type=data.changed')).body.items.map((e: { data: { entity: string } }) => e.data.entity);
  assert.ok(changed.includes('habits'), 'as telas ficam sabendo');
});

test('hábitos: o Renfield marca pelo nome, entende "ontem" e não cria hábito sozinho', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.setNow('2026-11-26T02:30:00Z'); // 23h30 de 25/11 em São Paulo

  const empty = await call(s, 'habits_list', {});
  assert.match(empty, /Consulta feita com sucesso: nenhum hábito criado/);

  const missing = await failure(s, 'habits_check', { habit: 'academia' });
  assert.match(missing, /Não existe hábito "academia"/);
  assert.match(missing, /Pergunte ao dono da casa antes de criar/);
  assert.equal(s.shack.habits.all().length, 0, 'não criou nada');

  await run(s, 'habits_create', { name: 'Ir à academia' });
  const today = await run(s, 'habits_check', { habit: 'academia' }); // parte do nome basta
  assert.equal(today.checked, '2026-11-25', 'hoje no fuso da casa');
  assert.equal(today.habit.doneToday, true);
  await run(s, 'habits_check', { habit: 'IR À ACADEMIA', day: 'Ontem' });
  await run(s, 'habits_check', { habit: 'academia', day: '20/11/2026' });
  const list = await run(s, 'habits_list', {});
  assert.equal(list.today, '2026-11-25');
  assert.deepEqual(list.items[0].doneLast7Days, ['2026-11-20', '2026-11-24', '2026-11-25']);
  assert.equal(list.items[0].streak, 2);

  const undone = await run(s, 'habits_check', { habit: 'academia', day: 'ontem', done: 'não' });
  assert.equal(undone.unchecked, '2026-11-24');
  assert.equal(undone.habit.streak, 1);

  const future = await failure(s, 'habits_check', { habit: 'academia', day: '2026-11-27' });
  assert.match(future, /ainda não chegou/);

  const renamed = await run(s, 'habits_rename', { habit: 'academia', name: 'Treino' });
  assert.equal(renamed.renamed.name, 'Treino');
  assert.deepEqual(await run(s, 'habits_delete', { habit: 'treino' }), { deleted: 'Treino' });
});

test('hábitos: datas tolerantes, confirmação para apagar e o que a cena mostra', () => {
  assert.equal(day().parse('25/11/2026'), '2026-11-25');
  assert.equal(day().parse('5/1/2026'), '2026-01-05');
  assert.equal(day().parse('2026-11-25T10:00'), '2026-11-25');
  assert.equal(day().parse(' Ontem '), 'ontem');

  const manifest = parse(readFileSync(join(import.meta.dirname, '../../../agents/renfield/agent.yaml'), 'utf8'));
  assert.ok(manifest.tools.shack.includes('habits'), 'o Renfield tem as ferramentas de hábitos');
  assert.ok(manifest.confirm.includes('habits_delete'), 'apagar um hábito pede confirmação');

  assert.equal(activityOf('habits_check'), 'Marcando o hábito');
  assert.equal(activityOf('habits_create'), 'Cuidando dos hábitos');
});
