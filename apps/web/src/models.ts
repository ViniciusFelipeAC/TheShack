import type { AccountStatus, AgentInfo, Effort } from '@shack/shared';

/** Uma opção do seletor: o nome e a legenda embaixo, como no seletor de modelos do VS Code. */
export type Choice = { value: string; label: string; hint: string };

/**
 * As legendas que o Claude Code manda para cada modelo (as mesmas do VS Code), em português.
 * Frase nova que não estiver aqui aparece como veio, em inglês, até ganhar tradução.
 */
const MODEL_HINTS: Record<string, string> = {
  'best for everyday, complex tasks': 'O melhor para o dia a dia e para tarefas complexas',
  'for complex work and everyday tasks': 'Para trabalho complexo e tarefas do dia a dia',
  'most efficient for simpler tasks': 'O mais eficiente para tarefas simples',
  'efficient for routine tasks': 'Eficiente para tarefas de rotina',
  'fastest for quick answers': 'O mais veloz, para respostas rápidas',
  'for your toughest challenges': 'Para os seus desafios mais difíceis',
  'most capable for your hardest and longest-running tasks': 'O mais capaz, para as tarefas mais difíceis e demoradas',
};
// Antes da primeira conversa desde que o servidor ligou, o app ainda não tem a lista do plano.
const FALLBACK: Record<string, string> = {
  opus: 'For complex work and everyday tasks', sonnet: 'Most efficient for simpler tasks', haiku: 'Fastest for quick answers',
};

/**
 * Traduz a legenda trecho a trecho: "Opus 5.5 · Best for…" mantém o nome e traduz a frase.
 * O preço por token ("$4/$20 per Mtok", que vem quando não há login de assinatura) sai:
 * a Shack só usa a assinatura e nunca paga por token, então o número só confundiria.
 */
export function modelHint(description: string): string {
  return description.split(' · ').map((p) => p.trim())
    .filter((p) => p && !/per mtok/i.test(p))
    .map((p) => MODEL_HINTS[p.toLowerCase()] ?? p)
    .join(' · ');
}

export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export const EFFORT_TEXT: Record<Effort, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' };
export const EFFORT_HINT: Record<Effort, string> = {
  low: 'Responde mais rápido e pensa pouco',
  medium: 'Equilíbrio entre rapidez e cuidado',
  high: 'Pensa mais nas partes difíceis',
  xhigh: 'Pensa bastante antes de agir; mais lento',
  max: 'O máximo de raciocínio; o mais lento e o que mais gasta cota',
};

/**
 * Opções de modelo e de esforço para um agente, como no /model e no /effort do Claude Code.
 * O valor "" é o do agent.yaml. A escolha atual sempre aparece, mesmo fora da lista.
 */
export function modelChoices(agent: Pick<AgentInfo, 'models' | 'effort' | 'settings'>, account: Pick<AccountStatus, 'availableModels'> | null) {
  const plan = (account?.availableModels ?? []).filter((m) => m.value !== 'default');
  const outside = plan.length ? 'Não está na lista do seu plano' : '';
  const describe = (value: string): Choice => {
    const m = plan.find((x) => x.value === value);
    if (m) {
      // Sem login de assinatura, o nome vem curto ("Opus") e a versão abre a legenda ("Opus 5.5 · …"): a versão sobe para o nome.
      const parts = modelHint(m.description).split(' · ');
      const named = parts.length > 1 && parts[0]!.toLowerCase().startsWith(m.displayName.toLowerCase());
      return { value, label: named ? parts[0]! : m.displayName, hint: (named ? parts.slice(1) : parts).join(' · ') };
    }
    return { value, label: value, hint: plan.length ? outside : modelHint(FALLBACK[value] ?? '') };
  };
  const models = plan.length ? plan.map((m) => describe(m.value)) : Object.keys(FALLBACK).map(describe);
  for (const v of [...agent.models, agent.settings.model]) if (v && !models.some((m) => m.value === v)) models.push(describe(v));
  const fromFile = describe(agent.models[0] ?? '');

  const chosen = agent.settings.model ?? agent.models[0] ?? '';
  const known = plan.find((m) => m.value === chosen)?.efforts ?? null;
  const efforts: Choice[] = (known ?? EFFORTS).map((e) => ({ value: e, label: EFFORT_TEXT[e], hint: EFFORT_HINT[e] }));
  const current = agent.settings.effort;
  if (current && !efforts.some((e) => e.value === current)) efforts.push({ value: current, label: EFFORT_TEXT[current], hint: 'Este modelo não aceita este nível' });
  const fileEffort = agent.effort as Effort;

  return {
    models: [{ value: '', label: `Do agente (${fromFile.label || 'padrão'})`, hint: ['Vem do agent.yaml', fromFile.hint].filter(Boolean).join(' · ') }, ...models],
    efforts: [{ value: '', label: `Do agente (${EFFORT_TEXT[fileEffort] ?? agent.effort})`, hint: 'Vem do agent.yaml' }, ...efforts],
    /** O modelo escolhido não tem níveis de esforço (por exemplo, alguns Haiku). */
    noEffort: known !== null && known.length === 0,
    planKnown: plan.length > 0,
  };
}
