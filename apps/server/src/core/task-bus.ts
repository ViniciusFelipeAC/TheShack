import { randomUUID } from 'node:crypto';
import type {
  AgentInfo, ApprovalKind, CreateTaskInput, Decision, EventType, Task, TaskDetail, TaskOrigin, TaskResult, TaskStatus,
} from '@shack/shared';
import { type Db, now, tx } from '../db/database.ts';
import type { TaskPatch, TasksRepo } from '../db/repos.ts';
import { badRequest, conflict, errorMessage, HttpError, notFound } from '../errors.ts';
import type { Approvals } from './approvals.ts';
import type { EventBus } from './events.ts';
import type { AgentDef, Registry } from './registry.ts';

/** O que um runner recebe para trabalhar numa tarefa. */
export interface RunIO {
  signal: AbortSignal;
  progress(message: string, data?: Record<string, unknown>): void;
  /** Pede algo a você. A tarefa fica em `waiting_input` até a resposta. */
  ask(req: { kind: ApprovalKind; summary: string; detail?: unknown; options?: string[] }): Promise<{ decision: Decision; answer?: string }>;
  /** Registra dados da execução (sessão, modelo, consumo, nota de passagem) sem mudar o estado. */
  update(patch: Pick<TaskPatch, 'sessionId' | 'model' | 'usage' | 'handoff'>): void;
  /** Nota de passagem que vale para esta tarefa: a da tentativa anterior, ou a da última tarefa que terminou mal no mesmo workspace. */
  previousHandoff: { taskId: string; title: string; note: string } | null;
}

/** Executa tarefas de um agente. Fase 2: simulado. Fases 3 e 4: Agent SDK. */
export interface AgentRunner {
  run(task: Task, agent: AgentDef, io: RunIO): Promise<TaskResult>;
}

/** Motivo do aborto quando o servidor desliga: o runner não deve gastar cota escrevendo nota nenhuma. */
export const SHUTDOWN_REASON = 'Servidor desligando.';

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_input', 'done', 'failed', 'cancelled'],
  waiting_input: ['running', 'failed', 'cancelled'],
  done: [],
  failed: ['queued'],
  cancelled: ['queued'],
};

const EVENT_FOR: Record<TaskStatus, EventType> = {
  queued: 'task.updated', running: 'task.updated', waiting_input: 'task.waiting_input',
  done: 'task.done', failed: 'task.failed', cancelled: 'task.cancelled',
};

type Live = {
  agentId: string;
  controller: AbortController;
  lastProgressAt: number;
  pending: { message: string; data?: Record<string, unknown> } | null;
  timer: NodeJS.Timeout | null;
};

export type TaskBusOptions = {
  db: Db;
  repo: TasksRepo;
  bus: EventBus;
  approvals: Approvals;
  registry: Registry;
  /** Nulo quando o agente não executa tarefas (por exemplo, o Renfield, que só conversa). */
  runnerFor: (agent: AgentDef) => AgentRunner | null;
  workspaceExists?: (id: string) => boolean;
  progressThrottleMs?: number;
};

export class TaskBus {
  #db: Db;
  #repo: TasksRepo;
  #bus: EventBus;
  #approvals: Approvals;
  #registry: Registry;
  #runnerFor: (agent: AgentDef) => AgentRunner | null;
  #workspaceExists: (id: string) => boolean;
  #throttleMs: number;
  #live = new Map<string, Live>();
  #activity = new Map<string, string>();
  #published = new Map<string, string>();
  #chatActivity = new Map<string, string>();
  #closed = false;

  constructor(o: TaskBusOptions) {
    this.#db = o.db;
    this.#repo = o.repo;
    this.#bus = o.bus;
    this.#approvals = o.approvals;
    this.#registry = o.registry;
    this.#runnerFor = o.runnerFor;
    this.#workspaceExists = o.workspaceExists ?? (() => true);
    this.#throttleMs = o.progressThrottleMs ?? 500;
  }

  /* ---------- comandos ---------- */

  create(input: CreateTaskInput, origin: TaskOrigin): Task {
    const agent = this.#registry.get(input.assignee);
    if (!agent) throw new HttpError(400, 'unknown_agent', `Não existe agente "${input.assignee}".`);
    if (!agent.manifest) throw new HttpError(409, 'agent_disabled', `O agente "${agent.id}" está desativado: ${agent.error}`);
    if (!this.#runnerFor(agent)) throw new HttpError(409, 'agent_cannot_run', `O ${agent.manifest.name} não executa tarefas. Converse com ele pelo chat.`);
    if (input.parentId && !this.#repo.get(input.parentId)) throw badRequest('A tarefa indicada em parentId não existe.');
    if (input.workspaceId && !this.#workspaceExists(input.workspaceId)) throw new HttpError(400, 'unknown_workspace', 'Esse workspace não existe.');
    if (agent.manifest.workspace === 'required' && !input.workspaceId) {
      throw new HttpError(400, 'workspace_required', `O ${agent.manifest.name} precisa de um workspace. Cadastre uma pasta de projeto e informe workspaceId.`);
    }

    const task: Task = {
      id: randomUUID(), title: input.title, prompt: input.prompt, assignee: agent.id, origin,
      status: 'queued', priority: input.priority, workspaceId: input.workspaceId ?? null, parentId: input.parentId ?? null,
      sessionId: null, model: null, result: null, error: null, usage: null, handoff: null, createdAt: now(), startedAt: null, finishedAt: null,
    };
    tx(this.#db, () => {
      this.#repo.insert(task);
      this.#repo.addHistory(task.id, 'queued', null, task.createdAt);
      this.#bus.publish('task.created', task, { agentId: task.assignee, taskId: task.id });
    });
    setImmediate(() => this.dispatch());
    return task;
  }

  cancel(id: string, note = 'Cancelada por você.'): Task {
    const task = this.#must(id);
    if (!TRANSITIONS[task.status].includes('cancelled')) throw conflict(`Não dá para cancelar uma tarefa com status "${task.status}".`);
    const updated = this.#transition(task, 'cancelled', { finishedAt: now() }, note);
    this.#live.get(id)?.controller.abort(new Error('Tarefa cancelada.'));
    this.#approvals.expire(id);
    setImmediate(() => this.dispatch());
    return updated;
  }

  retry(id: string): Task {
    const task = this.#must(id);
    if (task.status !== 'failed' && task.status !== 'cancelled') throw conflict('Só dá para repetir tarefas que falharam ou foram canceladas.');
    const updated = this.#transition(task, 'queued', { error: null, result: null, startedAt: null, finishedAt: null }, 'Repetida.');
    setImmediate(() => this.dispatch());
    return updated;
  }

  /** Responde à pergunta pendente de uma tarefa em `waiting_input`. */
  input(id: string, text: string, by: string | null): Task {
    const task = this.#must(id);
    if (task.status !== 'waiting_input') throw conflict('Esta tarefa não está esperando resposta.');
    const pending = this.#approvals.pending(id);
    if (!pending.length) throw conflict('Não há pergunta pendente para esta tarefa.');
    this.#approvals.resolve(pending[0]!.id, 'approve', text, by);
    return this.#must(id);
  }

  /** No boot: o que estava rodando quando o servidor caiu vira falha, e aprovações pendentes expiram. */
  recover(): void {
    tx(this.#db, () => {
      for (const t of this.#repo.withStatus(['running', 'waiting_input'])) {
        this.#transition(t, 'failed', { error: 'Interrompida por reinício do servidor.', finishedAt: now() }, 'Interrompida por reinício.');
      }
    });
    this.#approvals.expire();
    this.dispatch();
  }

  /** Começa a próxima tarefa de cada agente que tiver vaga. */
  dispatch(): void {
    if (this.#closed) return;
    for (const agent of this.#registry.list()) {
      if (!agent.manifest) continue;
      // Uma tarefa cancelada ainda ocupa a vaga enquanto o runner fecha o git e escreve a nota de passagem.
      const finishing = [...this.#live.values()].filter((l) => l.agentId === agent.id).length;
      let active = Math.max(this.#repo.active(agent.id).length, finishing);
      while (active < agent.manifest.limits.concurrency) {
        const next = this.#repo.nextQueued(agent.id);
        if (!next) break;
        this.#start(next, agent);
        active++;
      }
    }
  }

  /** Interrompe tudo o que está rodando (usado ao desligar o servidor). */
  shutdown(): void {
    // Depois disso nada mais grava no banco. O que estava rodando fica "running" e vira falha no próximo boot.
    this.#closed = true;
    for (const live of this.#live.values()) { live.controller.abort(new Error(SHUTDOWN_REASON)); if (live.timer) clearTimeout(live.timer); }
  }

  /** Atividade fora de tarefas, como o Renfield respondendo no chat. Nulo encerra. */
  setChatActivity(agentId: string, text: string | null): void {
    if (this.#closed) return;
    if (text) this.#chatActivity.set(agentId, text); else this.#chatActivity.delete(agentId);
    this.#refreshAgent(agentId);
  }

  clearError(agentId: string): AgentInfo {
    const def = this.#registry.require(agentId);
    this.#repo.clearError(agentId, now());
    this.#refreshAgent(agentId);
    return this.agentInfo(def);
  }

  /* ---------- consultas ---------- */

  get(id: string): TaskDetail {
    return { ...this.#must(id), history: this.#repo.history(id) };
  }

  list(filter: Parameters<TasksRepo['list']>[0]) {
    return this.#repo.list(filter);
  }

  agentInfo(def: AgentDef): AgentInfo {
    const m = def.manifest;
    const base = {
      id: def.id, name: m?.name ?? def.id, role: m?.role ?? '', models: m ? [m.model].flat() : [],
      effort: m?.effort ?? 'medium', chat: m?.chat ?? false, manifestError: def.error, appearance: m?.appearance ?? {},
    };
    if (!m) return { ...base, status: 'disabled', activity: def.error, currentTaskId: null };

    const active = this.#repo.active(def.id);
    const waiting = active.find((t) => t.status === 'waiting_input');
    if (waiting) return { ...base, status: 'waiting_input', activity: this.#activity.get(def.id) ?? waiting.title, currentTaskId: waiting.id };
    const running = active.find((t) => t.status === 'running');
    if (running) return { ...base, status: 'working', activity: this.#activity.get(def.id) ?? running.title, currentTaskId: running.id };
    const chat = this.#chatActivity.get(def.id);
    if (chat) return { ...base, status: 'working', activity: chat, currentTaskId: null };

    const last = this.#repo.lastFinished(def.id);
    const cleared = this.#repo.errorClearedAt(def.id);
    const unseen = last && (!cleared || (last.finishedAt ?? '') > cleared);
    if (unseen && last.status === 'failed') return { ...base, status: 'error', activity: last.error, currentTaskId: last.id };
    // Concluída, mas o relatório não bate com o diff: pede o seu olhar como um erro.
    const v = last?.result?.verification;
    if (unseen && last.status === 'done' && v?.status === 'suspect') {
      return { ...base, status: 'error', activity: `Resultado suspeito: ${v.reason}`, currentTaskId: last.id };
    }
    return { ...base, status: 'idle', activity: null, currentTaskId: null };
  }

  /* ---------- execução ---------- */

  #start(task: Task, agent: AgentDef): void {
    const started = this.#transition(task, 'running', { startedAt: now() }, null);
    const live: Live = { agentId: agent.id, controller: new AbortController(), lastProgressAt: 0, pending: null, timer: null };
    this.#live.set(task.id, live);
    const io: RunIO = {
      signal: live.controller.signal,
      progress: (message, data) => this.#progress(task.id, agent.id, live, message, data),
      ask: (req) => this.#ask(task.id, agent.id, req),
      update: (patch) => {
        if (this.#closed) return;
        const u = this.#repo.update(task.id, patch);
        // A nota chega depois do fim (cancelamento ou falha): avisa quem mostra o histórico.
        if (patch.handoff !== undefined) this.#bus.publish('task.updated', u, { agentId: u.assignee, taskId: u.id });
      },
      previousHandoff: task.workspaceId ? this.#repo.previousHandoff(task.workspaceId, task.id) : null,
    };
    Promise.resolve()
      .then(() => {
        const runner = this.#runnerFor(agent);
        if (!runner) throw new Error(`O ${agent.id} não executa tarefas.`);
        return runner.run(started, agent, io);
      })
      .then((result) => this.#finish(task.id, 'done', { result, finishedAt: now() }, null))
      .catch((err: unknown) => this.#finish(task.id, 'failed', { error: errorMessage(err), finishedAt: now() }, errorMessage(err)))
      .finally(() => {
        if (live.timer) clearTimeout(live.timer);
        this.#live.delete(task.id);
        if (this.#closed) return;
        if (![...this.#live.keys()].some((id) => this.#repo.get(id)?.assignee === agent.id)) this.#activity.delete(agent.id);
        this.#refreshAgent(agent.id);
        this.dispatch();
      });
  }

  #finish(id: string, to: TaskStatus, patch: TaskPatch, note: string | null): void {
    if (this.#closed) return;
    const task = this.#repo.get(id);
    // Se a tarefa já foi cancelada (ou mudou de outro jeito), o resultado do runner é descartado.
    if (!task || !TRANSITIONS[task.status].includes(to)) return;
    this.#transition(task, to, patch, note);
  }

  #progress(taskId: string, agentId: string, live: Live, message: string, data?: Record<string, unknown>): void {
    if (live.controller.signal.aborted) return;
    this.#activity.set(agentId, message);
    live.pending = { message, data };
    const emit = () => {
      live.timer = null;
      const p = live.pending;
      live.pending = null;
      if (!p || live.controller.signal.aborted || this.#closed) return;
      live.lastProgressAt = Date.now();
      this.#bus.publish('task.progress', { message: p.message, ...p.data }, { agentId, taskId });
      this.#refreshAgent(agentId);
    };
    const wait = this.#throttleMs - (Date.now() - live.lastProgressAt);
    if (wait <= 0) emit();
    else if (!live.timer) live.timer = setTimeout(emit, wait);
  }

  async #ask(taskId: string, agentId: string, req: Parameters<RunIO['ask']>[0]) {
    const task = this.#must(taskId);
    if (task.status !== 'running') throw new Error('A tarefa não está rodando.');
    this.#activity.set(agentId, req.summary);
    const { answer } = tx(this.#db, () => {
      this.#transition(task, 'waiting_input', {}, req.summary);
      return this.#approvals.request({ agentId, taskId, ...req });
    });
    const result = await answer;
    if (this.#closed) return result;
    this.#activity.set(agentId, result.decision === 'approve' ? 'Continuando' : 'Seguindo sem o que foi negado');
    const current = this.#repo.get(taskId);
    if (current?.status === 'waiting_input') {
      this.#transition(current, 'running', {}, result.decision === 'approve' ? 'Aprovado.' : 'Negado.');
    }
    return result;
  }

  #transition(task: Task, to: TaskStatus, patch: TaskPatch, note: string | null): Task {
    if (!TRANSITIONS[task.status].includes(to)) throw conflict(`Transição inválida: de "${task.status}" para "${to}".`);
    const updated = tx(this.#db, () => {
      const u = this.#repo.update(task.id, { ...patch, status: to });
      this.#repo.addHistory(task.id, to, note, now());
      this.#bus.publish(EVENT_FOR[to], u, { agentId: u.assignee, taskId: u.id });
      return u;
    });
    this.#refreshAgent(task.assignee);
    return updated;
  }

  /** Publica `agent.status` quando o estado visível do agente muda. */
  #refreshAgent(agentId: string): void {
    const def = this.#registry.get(agentId);
    if (!def) return;
    const info = this.agentInfo(def);
    const stamp = `${info.status}|${info.activity}|${info.currentTaskId}`;
    if (this.#published.get(agentId) === stamp) return;
    this.#published.set(agentId, stamp);
    this.#bus.publish('agent.status', { status: info.status, activity: info.activity, currentTaskId: info.currentTaskId }, { agentId });
  }

  #must(id: string): Task {
    const task = this.#repo.get(id);
    if (!task) throw notFound('Tarefa');
    return task;
  }
}
