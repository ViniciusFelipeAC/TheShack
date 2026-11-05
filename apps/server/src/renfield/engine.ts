import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  type CanUseTool, createSdkMcpServer, type Query, query, type SDKMessage, type SDKUserMessage, tool,
} from '@anthropic-ai/claude-agent-sdk';
import type { AgentManifest } from '@shack/shared';
import { Inbox } from '../agents/inbox.ts';
import type { Approvals } from '../core/approvals.ts';
import { errorMessage, HttpError } from '../errors.ts';
import type { Account } from './account.ts';
import { type AttachmentData, attachmentBlocks } from './attachments.ts';
import type { RenfieldTool, ToolContext } from './tools.ts';

export type TurnInput = {
  conversationId: string;
  text: string;
  /** Fotos, PDFs e textos anexados a esta mensagem. */
  attachments: AttachmentData[];
  context: string;
  systemPrompt: string;
  manifest: AgentManifest;
  onDelta(text: string): void;
  onActivity(text: string): void;
};

/** Quem gera as respostas do Renfield. O servidor usa o Agent SDK; os testes usam um motor falso. */
export interface ChatEngine {
  turn(input: TurnInput): Promise<{ text: string }>;
  reset(conversationId?: string): void;
}

const MCP_SERVER = 'shack';
const toolId = (name: string) => `mcp__${MCP_SERVER}__${name}`;
const ACTIVITY: Record<string, string> = {
  agents_status: 'Verificando a casa', tasks_list: 'Consultando as tarefas', tasks_get: 'Consultando uma tarefa',
  tasks_create: 'Delegando uma tarefa', tasks_cancel: 'Cancelando uma tarefa', tasks_answer: 'Respondendo a uma tarefa',
  memory_add: 'Anotando', memory_update: 'Corrigindo uma anotação', memory_search: 'Procurando nas anotações', rules_add: 'Aprendendo uma regra',
  calendar_list: 'Consultando a agenda', calendar_create: 'Marcando na agenda', lists_all: 'Olhando as listas', lists_add: 'Anotando na lista',
  lists_check: 'Riscando da lista',
};
// O resto, pelo grupo: o quadro e o chat mostram o que ele está mexendo, em vez de só "Trabalhando".
const ACTIVITY_GROUP: Record<string, string> = {
  calendar: 'Mexendo na agenda', lists: 'Arrumando as listas', reminders: 'Cuidando dos lembretes', timers: 'Cuidando dos timers',
  notes: 'Mexendo nas notas', notify: 'Mandando um aviso', memory: 'Revendo as anotações', rules: 'Revendo as regras', tasks: 'Cuidando das tarefas',
};
export const activityOf = (tool: string): string => ACTIVITY[tool] ?? ACTIVITY_GROUP[tool.split('_')[0]!] ?? 'Trabalhando';

/** Falha de uma ferramenta, dita de um jeito que o modelo não confunda com "não há nada". */
export function toolFailure(t: Pick<RenfieldTool, 'reads'>, err: unknown): string {
  return t.reads
    ? `Indisponível: a consulta falhou (${errorMessage(err)}). Não há dados desta chamada. Diga ao dono da casa que a informação está indisponível; não responda como se a lista estivesse vazia.`
    : `Erro: ${errorMessage(err)} Nada foi feito.`;
}

/** Servidor MCP in-process com as ferramentas do Renfield. Os argumentos chegam já ajustados pelos schemas tolerantes. */
export function buildToolServer(tools: RenfieldTool[], ctx: ToolContext) {
  return createSdkMcpServer({
    name: MCP_SERVER,
    version: '1.0.0',
    tools: tools.map((t) => tool(t.name, t.description, t.shape, async (args) => {
      try { return { content: [{ type: 'text' as const, text: await t.run(args as Record<string, unknown>, ctx) }] }; } catch (err) {
        return { content: [{ type: 'text' as const, text: toolFailure(t, err) }], isError: true };
      }
    })),
  });
}

type Pending = { resolve(v: { text: string }): void; reject(e: unknown): void; parts: string[]; input: TurnInput };

/** Uma sessão viva do Claude Code por conversa. O processo continua aberto entre mensagens. */
class LiveSession {
  readonly stamp: string;
  readonly q: Query;
  dead = false;
  sessionId: string | null = null;
  #inbox = new Inbox<SDKUserMessage>();
  #pending: Pending | null = null;
  #stderr: string[] = [];
  #onSession: (id: string) => void;
  #account: Account;

  constructor(o: { stamp: string; options: Parameters<typeof query>[0]['options']; account: Account; onSession(id: string): void }) {
    this.stamp = o.stamp;
    this.#account = o.account;
    this.#onSession = o.onSession;
    this.q = query({ prompt: this.#inbox, options: { ...o.options, stderr: (d) => { this.#stderr.push(d); if (this.#stderr.length > 20) this.#stderr.shift(); } } });
    void this.#read();
  }

  async #read(): Promise<void> {
    try {
      for await (const m of this.q) this.#on(m);
      this.#fail(new Error('A sessão do Renfield terminou.'));
    } catch (err) {
      this.#fail(err);
    } finally {
      this.dead = true;
    }
  }

  #fail(err: unknown): void {
    this.dead = true;
    const detail = this.#stderr.join('').trim().split('\n').slice(-3).join(' ');
    const p = this.#pending;
    this.#pending = null;
    p?.reject(new Error(detail ? `${errorMessage(err)} (${detail})` : errorMessage(err)));
  }

  #on(m: SDKMessage): void {
    const p = this.#pending;
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init' && m.session_id && m.session_id !== this.sessionId) { this.sessionId = m.session_id; this.#onSession(m.session_id); }
        return;
      case 'rate_limit_event':
        this.#account.onRateLimit(m.rate_limit_info);
        return;
      case 'stream_event': {
        if (!p || m.parent_tool_use_id !== null) return;
        const e = m.event;
        if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') p.input.onDelta(e.delta.text);
        if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') {
          const name = e.content_block.name.replace(`mcp__${MCP_SERVER}__`, '');
          p.input.onActivity(activityOf(name));
        }
        return;
      }
      case 'assistant': {
        if (!p || m.parent_tool_use_id !== null) return;
        const text = m.message.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
        if (text) p.parts.push(text);
        return;
      }
      case 'result':
        if (!p) return;
        this.#pending = null;
        if (m.subtype === 'success') p.resolve({ text: p.parts.join('\n\n') || m.result });
        else p.reject(new Error(m.errors?.join('; ') || `A resposta terminou com "${m.subtype}".`));
        return;
      default:
        return;
    }
  }

  turn(input: TurnInput): Promise<{ text: string }> {
    if (this.dead) return Promise.reject(new Error('Sessão encerrada.'));
    return new Promise((resolve, reject) => {
      this.#pending = { resolve, reject, parts: [], input };
      this.#inbox.push({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: input.context }, ...attachmentBlocks(input.attachments), { type: 'text', text: input.text }] },
        parent_tool_use_id: null,
      } as SDKUserMessage);
    });
  }

  close(): void {
    this.dead = true;
    this.#inbox.end();
    try { this.q.close(); } catch { /* já fechada */ }
  }
}

export type SdkEngineOptions = {
  agentId: string;
  tools: RenfieldTool[];
  account: Account;
  approvals: Approvals;
  fallbackModel: string;
  workDir: string;
  sessionStore: { get(conversationId: string): string | null; set(conversationId: string, sessionId: string | null): void };
};

/** Motor real: Claude Code via Agent SDK, só com as ferramentas do Shack e só com a sua assinatura. */
export class SdkEngine implements ChatEngine {
  #o: SdkEngineOptions;
  #sessions = new Map<string, LiveSession>();

  constructor(o: SdkEngineOptions) {
    this.#o = o;
    mkdirSync(o.workDir, { recursive: true });
  }

  async turn(input: TurnInput): Promise<{ text: string }> {
    const stamp = createHash('sha256').update(input.systemPrompt).update(JSON.stringify([input.manifest.model, input.manifest.effort, input.manifest.tools])).digest('hex');
    let s = this.#sessions.get(input.conversationId);
    if (s && (s.dead || s.stamp !== stamp)) { s.close(); s = undefined; }
    if (!s) s = await this.#open(input, stamp, true);
    try {
      return await s.turn(input);
    } catch (err) {
      // Sessão salva que não existe mais (por exemplo, apagada): começa uma nova e tenta uma vez.
      if (s.dead && this.#o.sessionStore.get(input.conversationId) && !s.sessionId) {
        this.#o.sessionStore.set(input.conversationId, null);
        s = await this.#open(input, stamp, false);
        return s.turn(input);
      }
      throw err;
    }
  }

  reset(conversationId?: string): void {
    for (const [id, s] of this.#sessions) if (!conversationId || id === conversationId) { s.close(); this.#sessions.delete(id); }
  }

  async #open(input: TurnInput, stamp: string, allowResume: boolean): Promise<LiveSession> {
    const { manifest, conversationId } = input;
    const ctx: ToolContext = { conversationId };
    const enabled = this.#o.tools.filter((t) => manifest.tools.shack.includes(t.group));
    const confirm = new Set(manifest.confirm);
    const server = buildToolServer(enabled, ctx);

    const canUseTool: CanUseTool = async (name, toolInput) => {
      const short = name.replace(`mcp__${MCP_SERVER}__`, '');
      if (!confirm.has(short)) return { behavior: 'deny', message: 'Ferramenta não permitida.' };
      const { answer } = this.#o.approvals.request({
        agentId: this.#o.agentId, kind: 'destructive',
        summary: `O Renfield quer usar "${short}". Confirma?`, detail: { tool: short, input: toolInput },
      });
      const res = await answer;
      return res.decision === 'approve' ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: 'O dono da casa não confirmou.' };
    };

    const preferences = [manifest.model].flat();
    const resume = allowResume ? this.#o.sessionStore.get(conversationId) ?? undefined : undefined;
    const session = new LiveSession({
      stamp,
      account: this.#o.account,
      onSession: (id) => this.#o.sessionStore.set(conversationId, id),
      options: {
        model: preferences[0],
        effort: manifest.effort,
        systemPrompt: input.systemPrompt,
        tools: [],
        mcpServers: { [MCP_SERVER]: server },
        allowedTools: enabled.filter((t) => !confirm.has(t.name)).map((t) => toolId(t.name)),
        canUseTool,
        permissionMode: 'default',
        settingSources: [],
        env: this.#o.account.cleanEnv(),
        cwd: this.#o.workDir,
        includePartialMessages: true,
        maxTurns: manifest.limits.maxTurns,
        resume,
      },
    });

    try {
      await this.#o.account.inspect(session.q);
      this.#o.account.assertSubscription();
      const model = this.#o.account.pickModel(this.#o.agentId, preferences, this.#o.fallbackModel);
      if (model !== preferences[0]) await session.q.setModel(model);
    } catch (err) {
      session.close();
      if (err instanceof HttpError) throw err;
      throw new Error(`Não consegui iniciar o Claude Code: ${errorMessage(err)}`);
    }
    this.#sessions.set(conversationId, session);
    return session;
  }
}
