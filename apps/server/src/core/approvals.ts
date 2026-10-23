import { randomUUID } from 'node:crypto';
import type { Approval, ApprovalKind, ApprovalStatus, Decision } from '@shack/shared';
import { type Db, now, tx } from '../db/database.ts';
import type { ApprovalsRepo } from '../db/repos.ts';
import { conflict, notFound } from '../errors.ts';
import type { EventBus } from './events.ts';

export type Answer = { decision: Decision; answer?: string };
export type ApprovalRequest = {
  agentId: string;
  taskId?: string | null;
  kind: ApprovalKind;
  summary: string;
  detail?: unknown;
  options?: string[];
};

/** Tudo o que precisa de um "sim" seu passa por aqui. Quem pede recebe uma Promise com a resposta. */
export class Approvals {
  #db: Db;
  #repo: ApprovalsRepo;
  #bus: EventBus;
  #waiters = new Map<string, (answer: Answer) => void>();

  constructor(db: Db, repo: ApprovalsRepo, bus: EventBus) {
    this.#db = db;
    this.#repo = repo;
    this.#bus = bus;
  }

  request(r: ApprovalRequest): { approval: Approval; answer: Promise<Answer> } {
    const approval: Approval = {
      id: randomUUID(), agentId: r.agentId, taskId: r.taskId ?? null, kind: r.kind, summary: r.summary,
      detail: r.detail ?? null, options: r.options ?? null, status: 'pending', answer: null, createdAt: now(), resolvedAt: null,
    };
    const answer = new Promise<Answer>((resolve) => this.#waiters.set(approval.id, resolve));
    tx(this.#db, () => {
      this.#repo.insert(approval);
      this.#bus.publish('approval.requested', approval, { agentId: approval.agentId, taskId: approval.taskId });
    });
    return { approval, answer };
  }

  resolve(id: string, decision: Decision, answer: string | undefined, by: string | null): Approval {
    const current = this.#repo.get(id);
    if (!current) throw notFound('Aprovação');
    if (current.status !== 'pending') throw conflict('Esta aprovação já foi respondida.');
    const status: ApprovalStatus = decision === 'approve' ? 'approved' : 'denied';
    const updated = this.#close(id, status, answer ?? null, by);
    if (!updated) throw conflict('Esta aprovação já foi respondida.');
    this.#wake(id, { decision, answer });
    return updated;
  }

  /** Expira as pendentes de uma tarefa (ou todas). Quem esperava recebe "deny". */
  expire(taskId?: string): number {
    const pending = this.#repo.pending(taskId);
    for (const a of pending) {
      this.#close(a.id, 'expired', null, null);
      this.#wake(a.id, { decision: 'deny' });
    }
    return pending.length;
  }

  get(id: string): Approval {
    const a = this.#repo.get(id);
    if (!a) throw notFound('Aprovação');
    return a;
  }

  list(status?: ApprovalStatus): Approval[] {
    return this.#repo.list(status);
  }

  pending(taskId?: string): Approval[] {
    return this.#repo.pending(taskId);
  }

  #close(id: string, status: ApprovalStatus, answer: string | null, by: string | null): Approval | null {
    return tx(this.#db, () => {
      if (!this.#repo.resolve(id, status, answer, by, now())) return null;
      const a = this.#repo.get(id)!;
      this.#bus.publish('approval.resolved', a, { agentId: a.agentId, taskId: a.taskId });
      return a;
    });
  }

  #wake(id: string, answer: Answer): void {
    const waiter = this.#waiters.get(id);
    if (!waiter) return;
    this.#waiters.delete(id);
    waiter(answer);
  }
}
