import { randomUUID } from 'node:crypto';
import type { Approval, Attachment, ChatMessage, ChatStyle, Conversation, Decision, Task } from '@shack/shared';
import type { Approvals } from '../core/approvals.ts';
import type { EventBus } from '../core/events.ts';
import type { Registry } from '../core/registry.ts';
import type { TaskBus } from '../core/task-bus.ts';
import type { Workspaces } from '../core/workspaces.ts';
import type { ChatRepo } from '../db/renfield-repos.ts';
import { badRequest, errorMessage, HttpError, notFound } from '../errors.ts';
import type { AttachmentData, Attachments } from './attachments.ts';
import type { ChatEngine } from './engine.ts';
import type { Mind } from './mind.ts';
import { buildContext, buildSystemPrompt } from './prompt.ts';

const YES = /^(sim|pode|confirmo|confirmado|autorizo|aprovo|aprovado|ok|okay|claro|manda ver|pode seguir|segue)\b/i;
const NO = /^(n[aã]o|nego|negado|nega|cancela|pare)\b/i;
const OPEN: Task['status'][] = ['queued', 'running', 'waiting_input'];

export type ChatDelta = { conversationId: string; streamId: string; text: string };
export type SendResult = { message: ChatMessage; reply: Promise<ChatMessage> | null };

export type ChatServiceOptions = {
  repo: ChatRepo; bus: EventBus; tasks: TaskBus; registry: Registry; approvals: Approvals; mind: Mind; workspaces: Workspaces;
  engine: ChatEngine; timezone: string; attachments: Attachments;
};

/** Conversa com o Renfield: histórico, fila por conversa, streaming e avisos de tarefas. */
export class ChatService {
  readonly agentId = 'renfield';
  #o: ChatServiceOptions;
  #queues = new Map<string, Promise<unknown>>();
  #deltaListeners = new Set<(d: ChatDelta) => void>();

  constructor(o: ChatServiceOptions) {
    this.#o = o;
    o.bus.subscribe((e) => {
      if (e.type === 'task.done' || e.type === 'task.failed' || e.type === 'task.waiting_input') this.#notice(e.type, e.data as Task);
    });
  }

  onDelta(fn: (d: ChatDelta) => void): () => void {
    this.#deltaListeners.add(fn);
    return () => { this.#deltaListeners.delete(fn); };
  }

  conversations(): Conversation[] { return this.#o.repo.list(); }

  conversation(id: string): Conversation {
    const c = this.#o.repo.get(id);
    if (!c) throw notFound('Conversa');
    return c;
  }

  createConversation(title: string): Conversation { return this.#o.repo.create(this.agentId, title); }

  messages(conversationId: string, limit: number, before?: string): ChatMessage[] {
    this.conversation(conversationId);
    return this.#o.repo.messages(conversationId, limit, before);
  }

  send(conversationId: string, text: string, style: ChatStyle, deviceId: string | null, attachmentIds: string[] = []): SendResult {
    const conv = this.conversation(conversationId);
    text = text.trim();
    const attached = attachmentIds.length ? this.#o.attachments.check(attachmentIds) : [];
    if (!text && !attached.length) throw badRequest('Escreva uma mensagem ou anexe um arquivo.');
    const message = this.#add({ conversationId, role: 'user', kind: 'text', text, style, taskId: null, deviceId }, undefined, attached.map((a) => a.id));

    // Com anexo, "sim" é conversa, não resposta a uma aprovação.
    const pending = attached.length ? null : this.#approvalAnswer(text);
    if (pending) {
      this.#o.approvals.resolve(pending.approval.id, pending.decision, undefined, deviceId);
      // Se a aprovação era do próprio Renfield, a resposta vem da vez dele que estava esperando.
      if (pending.approval.agentId === this.agentId) return { message, reply: null };
      const name = this.#o.registry.get(pending.approval.agentId)?.manifest?.name ?? pending.approval.agentId;
      const text = pending.decision === 'approve' ? `Perfeitamente. Autorizei o pedido do ${name}.` : `Entendido. Neguei o pedido do ${name}.`;
      return { message, reply: Promise.resolve(this.#add({ conversationId, role: 'assistant', kind: 'text', text, style, taskId: null, deviceId: null })) };
    }
    return { message, reply: this.#enqueue(conv.id, () => this.#turn(conv, text, style, message.attachments)) };
  }

  /** "sim" ou "não" respondem a aprovação pendente, quando há exatamente uma. */
  #approvalAnswer(text: string): { approval: Approval; decision: Decision } | null {
    const t = text.trim();
    const decision: Decision | null = YES.test(t) ? 'approve' : NO.test(t) ? 'deny' : null;
    if (!decision) return null;
    // Perguntas pedem uma resposta de verdade, então "sim" e "não" só valem para aprovações.
    const pending = this.#o.approvals.pending().filter((a) => a.kind !== 'question');
    return pending.length === 1 ? { approval: pending[0]!, decision } : null;
  }

  #enqueue<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.#queues.get(conversationId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.#queues.set(conversationId, next.catch(() => undefined));
    return next;
  }

  async #turn(conv: Conversation, text: string, style: ChatStyle, attached: Attachment[] = []): Promise<ChatMessage> {
    const { registry, tasks, mind, approvals, engine, timezone } = this.#o;
    const base = { conversationId: conv.id, role: 'assistant' as const, style, taskId: null, deviceId: null };
    const def = registry.get(this.agentId);
    if (!def?.manifest) return this.#add({ ...base, kind: 'error', text: `O Renfield está desativado: ${def?.error ?? 'a pasta agents/renfield não existe.'}` });

    const streamId = randomUUID();
    tasks.setChatActivity(this.agentId, 'Respondendo você');
    try {
      const agents = registry.list().map((d) => tasks.agentInfo(d));
      const latest = tasks.list({ limit: 50 }).items;
      const cutoff = Date.now() - 2 * 3_600_000;
      const result = await engine.turn({
        conversationId: conv.id,
        text: text || '(Mensagem só com anexos.)',
        attachments: this.#files(attached),
        manifest: def.manifest,
        systemPrompt: buildSystemPrompt({ persona: def.persona, agents, memories: mind.memories(), rules: mind.rules(), modes: mind.modes() }),
        context: buildContext({
          timezone, style, activeMode: mind.activeMode(), agents, approvals: approvals.pending(), workspaces: this.#o.workspaces.list(),
          open: latest.filter((t) => OPEN.includes(t.status)),
          recent: latest.filter((t) => t.finishedAt && Date.parse(t.finishedAt) > cutoff),
        }),
        onDelta: (chunk) => { for (const fn of this.#deltaListeners) fn({ conversationId: conv.id, streamId, text: chunk }); },
        onActivity: (activity) => tasks.setChatActivity(this.agentId, activity),
      });
      return this.#add({ ...base, kind: 'text', text: result.text.trim() || 'Pois não.' }, streamId);
    } catch (err) {
      const text = err instanceof HttpError && err.code === 'subscription_required'
        ? err.message
        : `Lamento, não consegui responder agora. ${errorMessage(err)}`;
      return this.#add({ ...base, kind: 'error', text }, streamId);
    } finally {
      tasks.setChatActivity(this.agentId, null);
    }
  }

  /** Avisos escritos pelo servidor, sem gastar cota: tarefa concluída, com falha ou esperando você. */
  #notice(type: 'task.done' | 'task.failed' | 'task.waiting_input', task: Task): void {
    if (task.assignee === this.agentId) return;
    const name = this.#o.registry.get(task.assignee)?.manifest?.name ?? task.assignee;
    const conversationId = task.origin.conversationId && this.#o.repo.get(task.origin.conversationId) ? task.origin.conversationId : 'main';
    let text: string;
    if (type === 'task.done') {
      const r = task.result;
      const changes = r?.changes.length ? `O que mudou:\n${r.changes.map((c) => `• ${c.path}: ${c.what}`).join('\n')}` : null;
      // A conferência do servidor vem antes do relatório: o relatório é a palavra do agente, o git é o fato.
      const v = r?.verification;
      const head = v?.status === 'suspect'
        ? `Atenção: o ${name} disse que concluiu "${task.title}", mas o resultado é suspeito. ${v.reason}`
        : `O ${name} concluiu "${task.title}".${v?.status === 'unverified' ? ` Não deu para conferir no git: ${v.reason}` : ''}`;
      text = [head, r?.summary, changes, v?.diffstat ? `No git: ${v.diffstat}.` : null, r?.howToTest ? `Como verificar: ${r.howToTest}` : null, r?.notes]
        .filter(Boolean).join('\n');
    } else if (type === 'task.failed') {
      text = [`Lamento: o ${name} não conseguiu concluir "${task.title}". ${task.error ?? ''}`.trim(),
        task.handoff ? 'Ficou uma nota de passagem com o que foi feito e o que falta; ela segue para a próxima tentativa.' : null]
        .filter(Boolean).join('\n');
    } else {
      const pending = this.#o.approvals.pending(task.id)[0];
      const ask = pending?.summary ?? 'há uma pergunta pendente.';
      text = pending?.kind === 'question'
        ? `O ${name} tem uma pergunta sobre "${task.title}": ${ask}${pending.options?.length ? `\nOpções: ${pending.options.join(', ')}.` : ''}\nResponda aqui que eu repasso, ou use o cartão.`
        : `O ${name} precisa de você em "${task.title}": ${ask}\nResponda "sim" ou "não", ou use os botões.`;
    }
    this.#add({ conversationId, role: 'assistant', kind: 'task_notice', text, style: null, taskId: task.id, deviceId: null });
  }

  /** Lê os arquivos dos anexos. Um arquivo que sumiu do disco vira um aviso em vez de derrubar a resposta. */
  #files(attached: Attachment[]): AttachmentData[] {
    return attached.map((a) => {
      try { return this.#o.attachments.read(a.id); } catch {
        return { meta: { ...a, kind: 'text' as const, mime: 'text/plain' }, data: Buffer.from('[O arquivo deste anexo não foi encontrado no servidor.]') };
      }
    });
  }

  #add(m: Omit<ChatMessage, 'id' | 'createdAt' | 'attachments'>, streamId?: string, attachmentIds: string[] = []): ChatMessage {
    const message = this.#o.repo.addMessage(m, attachmentIds);
    this.#o.bus.publish('chat.message', { message, streamId: streamId ?? null }, { agentId: this.agentId });
    return message;
  }
}
