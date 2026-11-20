import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountStatus, Effort } from '@shack/shared';
import { modelChoices, modelHint } from '../src/models.ts';

const ALL: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
// Como o Claude Code descreve os modelos do plano: as mesmas legendas do seletor do VS Code.
const plan: AccountStatus['availableModels'] = [
  { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best for everyday, complex tasks', efforts: ALL },
  { value: 'opus', displayName: 'Opus 5.5', description: 'For complex work and everyday tasks', efforts: ALL },
  { value: 'haiku', displayName: 'Haiku 5.5', description: 'Fastest for quick answers', efforts: [] },
  { value: 'claude-novo-9', displayName: 'Novo 9', description: 'Brand new phrase', efforts: null },
];
const etnad = { models: ['opus', 'sonnet'], effort: 'high', settings: { model: null, effort: null } };

test('legenda: traduz a frase do Claude Code e mantém o que vem antes do ponto', () => {
  assert.equal(modelHint('Fastest for quick answers'), 'O mais veloz, para respostas rápidas');
  assert.equal(modelHint('Opus 5.5 · Best for everyday, complex tasks'), 'Opus 5.5 · O melhor para o dia a dia e para tarefas complexas');
  assert.equal(modelHint('Brand new phrase'), 'Brand new phrase', 'frase desconhecida aparece como veio');
  assert.equal(modelHint(''), '');
  // Sem login de assinatura, o Claude Code põe o preço da API no fim; a Shack nunca paga por token.
  assert.equal(modelHint('Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok'), 'Sonnet 5.5 · Eficiente para tarefas de rotina');
  assert.equal(modelHint('Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok ($0.50/$2.50 for prompts over 100k)'), 'Haiku 5.5 · O mais veloz, para respostas rápidas');
});

test('modelos: "Do agente" primeiro, cada um com nome e legenda, e "default" fora', () => {
  const c = modelChoices(etnad, { availableModels: plan });
  assert.deepEqual(c.models.map((m) => m.value), ['', 'opus', 'haiku', 'claude-novo-9', 'sonnet'], 'o do manifesto entra mesmo fora do plano');
  assert.deepEqual(c.models[0], { value: '', label: 'Do agente (Opus 5.5)', hint: 'Vem do agent.yaml · Para trabalho complexo e tarefas do dia a dia' });
  assert.deepEqual(c.models[2], { value: 'haiku', label: 'Haiku 5.5', hint: 'O mais veloz, para respostas rápidas' });
  assert.equal(c.models.at(-1)!.hint, 'Não está na lista do seu plano');
  assert.equal(c.planKnown, true);
});

test('sem login de assinatura: a versão sai da legenda e vai para o nome', () => {
  const c = modelChoices(etnad, { availableModels: [
    { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok', efforts: ALL },
  ] });
  assert.deepEqual(c.models.find((m) => m.value === 'sonnet'), { value: 'sonnet', label: 'Sonnet 5.5', hint: 'Eficiente para tarefas de rotina' });
});

test('esforço: legenda em cada nível, só os que o modelo aceita', () => {
  const c = modelChoices(etnad, { availableModels: plan });
  assert.deepEqual(c.efforts[0], { value: '', label: 'Do agente (Alto)', hint: 'Vem do agent.yaml' });
  assert.equal(c.efforts.length, 6);
  assert.ok(c.efforts.every((e) => e.hint), 'todo nível tem legenda');
  assert.equal(c.noEffort, false);

  const haiku = modelChoices({ ...etnad, settings: { model: 'haiku', effort: null } }, { availableModels: plan });
  assert.equal(haiku.noEffort, true, 'modelo sem esforço esconde a escolha');
});

test('antes de saber o plano: os apelidos conhecidos, com legenda', () => {
  const c = modelChoices(etnad, null);
  assert.deepEqual(c.models.map((m) => m.value), ['', 'opus', 'sonnet', 'haiku']);
  assert.equal(c.models[0]!.label, 'Do agente (opus)');
  assert.ok(c.models.slice(1).every((m) => m.hint), 'mesmo sem o plano, cada apelido tem legenda');
  assert.equal(c.planKnown, false);
});
