import type { AgentTokens, TaskUsage } from '@shack/shared';
import { dayIn } from '../assistant/habits.ts';

export const WEEK_MS = 7 * 86_400_000;
const ZERO: TaskUsage = { inputTokens: 0, outputTokens: 0 };
const add = (a: TaskUsage, b: TaskUsage): TaskUsage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });
const total = (u: TaskUsage) => u.inputTokens + u.outputTokens;

/**
 * Tokens das tarefas por agente: hoje, no fuso da casa, e no período que `rows` cobre (os últimos 7 dias).
 * A entrada conta o que veio do cache, que também gasta cota. Quem gastou mais na semana vem primeiro.
 */
export function agentTokens(rows: Array<{ assignee: string; usage: TaskUsage; finishedAt: string }>, tz: string, now: Date): AgentTokens[] {
  const today = dayIn(tz, now);
  const by = new Map<string, AgentTokens>();
  for (const r of rows) {
    const a = by.get(r.assignee) ?? { agentId: r.assignee, today: ZERO, week: ZERO, tasks: 0 };
    a.week = add(a.week, r.usage);
    a.tasks++;
    if (dayIn(tz, new Date(r.finishedAt)) === today) a.today = add(a.today, r.usage);
    by.set(r.assignee, a);
  }
  return [...by.values()].sort((a, b) => total(b.week) - total(a.week));
}
