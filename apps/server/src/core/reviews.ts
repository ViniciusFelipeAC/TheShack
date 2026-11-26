/* A volta da conferência: a Mina confere sozinha o que nasceu de um prompt dela, e a correção parte do que foi conferido. */
import { runnerOf, type Task } from '@shack/shared';
import type { StartPoint } from '../agents/git.ts';
import { DEFAULT_REVIEW } from '../agents/review.ts';
import type { TasksRepo } from '../db/repos.ts';
import type { Registry } from './registry.ts';
import type { TaskBus } from './task-bus.ts';

/** Agente de texto: escreve prompts e confere entregas (a Mina). */
export function isTextAgent(registry: Registry, id: string): boolean {
  const m = registry.get(id)?.manifest;
  return m ? runnerOf(m) === 'text' : false;
}

/**
 * Quando uma tarefa que nasceu de um prompt da Mina termina bem, a Mina confere sozinha, uma vez.
 * A correção que sair dali pede o seu toque; por isso não há laço sem fim.
 */
export function autoReview(t: Task, d: { tasks: TaskBus; repo: TasksRepo; registry: Registry }): Task | null {
  if (t.status !== 'done' || t.reviewOf || !t.parentId || isTextAgent(d.registry, t.assignee)) return null;
  const parent = d.repo.get(t.parentId);
  if (!parent || !isTextAgent(d.registry, parent.assignee)) return null;
  if (d.repo.reviewsOf(t.id).length) return null;
  try {
    return d.tasks.create(
      { assignee: parent.assignee, title: `Conferir: ${t.title}`.slice(0, 200), prompt: DEFAULT_REVIEW, priority: 'normal', reviewOf: t.id },
      { kind: 'agent', agentId: t.assignee },
    );
  } catch (err) {
    console.error('[conferência] não consegui criar a conferência automática:', err);
    return null;
  }
}

/**
 * Uma correção é filha da conferência, que aponta para a entrega. Ela parte do commit entregue,
 * desde que seja no mesmo projeto. Sem commit (a tarefa não teve branch), parte do estado atual.
 */
export function startPointOf(task: Task, repo: Pick<TasksRepo, 'get'>): StartPoint | null {
  const parent = task.parentId ? repo.get(task.parentId) : null;
  const reviewed = parent?.reviewOf ? repo.get(parent.reviewOf) : null;
  const v = reviewed?.result?.verification;
  if (!reviewed || !v?.commit || reviewed.workspaceId !== task.workspaceId) return null;
  return { ref: v.commit, label: v.branch ?? v.commit };
}
