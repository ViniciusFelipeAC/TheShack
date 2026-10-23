import { randomUUID } from 'node:crypto';
import type { EventType, ShackEvent } from '@shack/shared';
import { afterCommit, type Db, now } from '../db/database.ts';
import type { EventsRepo } from '../db/repos.ts';

export type Listener = (event: ShackEvent) => void;
export type EventRefs = { agentId?: string | null; taskId?: string | null };

/**
 * Stream de eventos: grava cada evento no banco (com `seq` crescente, para replay)
 * e avisa os ouvintes em memória depois do commit.
 */
export class EventBus {
  #db: Db;
  #repo: EventsRepo;
  #listeners = new Set<Listener>();

  constructor(db: Db, repo: EventsRepo) {
    this.#db = db;
    this.#repo = repo;
  }

  publish(type: EventType, data: unknown, refs: EventRefs = {}): ShackEvent {
    const base = { id: randomUUID(), ts: now(), type, agentId: refs.agentId ?? null, taskId: refs.taskId ?? null, data: data ?? null };
    const event: ShackEvent = { seq: this.#repo.insert(base), ...base };
    afterCommit(this.#db, () => {
      for (const listener of this.#listeners) {
        try { listener(event); } catch (err) { console.error('[eventos] um ouvinte falhou:', err); }
      }
    });
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  list(filter: Parameters<EventsRepo['list']>[0]): ShackEvent[] {
    return this.#repo.list(filter);
  }

  lastSeq(): number {
    return this.#repo.lastSeq();
  }

  prune(retentionDays: number): number {
    return this.#repo.pruneBefore(new Date(Date.now() - retentionDays * 86_400_000).toISOString());
  }
}
