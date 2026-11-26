import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { TaskUsage } from '@shack/shared';
import type { RunIO } from '../core/task-bus.ts';

type AskInput = { questions?: Array<{ question: string; options?: Array<{ label: string }> }> };
type ModelUsage = { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number };

/** AskUserQuestion vira um pedido no app. A primeira pergunta leva a sua resposta; as outras ficam com o bom senso do agente. */
export async function askUser(io: RunIO, input: Record<string, unknown>): Promise<PermissionResult> {
  const questions = (input as AskInput).questions ?? [];
  const first = questions[0];
  if (!first) return { behavior: 'deny', message: 'Pergunta vazia.' };
  const res = await io.ask({
    kind: 'question',
    summary: questions.map((x) => x.question).join(' / '),
    options: first.options?.map((x) => x.label),
    detail: { questions },
  });
  if (res.decision === 'deny' || !res.answer) return { behavior: 'deny', message: 'O dono da casa preferiu não responder. Decida pelo mais razoável e registre nas notas.' };
  const answers = Object.fromEntries(questions.map((x, i) => [x.question, i === 0 ? res.answer! : 'Sem resposta; use o bom senso.']));
  return { behavior: 'allow', updatedInput: { ...input, answers } };
}

/** Tokens de todos os modelos da sessão. A entrada conta também o que veio do cache, que gasta cota. */
export function usageOf(modelUsage: Record<string, ModelUsage> | undefined): TaskUsage {
  return Object.values(modelUsage ?? {}).reduce<TaskUsage>(
    (acc, u) => ({ inputTokens: acc.inputTokens + (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0), outputTokens: acc.outputTokens + (u.outputTokens ?? 0) }),
    { inputTokens: 0, outputTokens: 0 },
  );
}
