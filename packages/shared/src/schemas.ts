import { z } from 'zod';

const id = z.string().min(1);
const isoDate = z.string();

/* ---------- erros e paginação ---------- */
export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiError>;

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/* ---------- dispositivos e autenticação ---------- */
export const DeviceKind = z.enum(['web', 'mobile', 'cli']);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const Device = z.object({
  id,
  name: z.string(),
  kind: DeviceKind,
  createdAt: isoDate,
  lastSeenAt: isoDate.nullable(),
  revokedAt: isoDate.nullable(),
});
export type Device = z.infer<typeof Device>;

export const PairingCode = z.object({ code: z.string(), expiresAt: isoDate });
export type PairingCode = z.infer<typeof PairingCode>;

export const PairInput = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().min(1).max(60),
  kind: DeviceKind.default('mobile'),
});
export type PairInput = z.infer<typeof PairInput>;

export const PairResult = z.object({ token: z.string(), device: Device });
export type PairResult = z.infer<typeof PairResult>;

/* ---------- agentes ---------- */
const listDefault = <T extends z.ZodType>(item: T) => z.array(item).default([]);

/** Níveis de esforço do Claude Code, do mais rápido ao que pensa mais. */
export const Effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type Effort = z.infer<typeof Effort>;

/**
 * Quem executa as tarefas do agente. code: Claude Code com git (o etnaD). text: só leitura e texto (a Mina).
 * design: HTML e CSS virando PNG pela ferramenta de render (o Harker). none: só conversa.
 */
export const RunnerKind = z.enum(['code', 'text', 'design', 'none']);
export type RunnerKind = z.infer<typeof RunnerKind>;

/** Artigo do nome nos textos: "o etnaD", "a Mina". */
export const Article = z.enum(['o', 'a']);
export type Article = z.infer<typeof Article>;
const ARTICLE_FORMS = {
  o: { o: 'o', ao: 'ao', do: 'do', pelo: 'pelo', ele: 'ele' },
  a: { o: 'a', ao: 'à', do: 'da', pelo: 'pela', ele: 'ela' },
} as const;
export type ArticleForm = keyof typeof ARTICLE_FORMS.o;

/** O nome do agente com o artigo e a contração certos: "o etnaD", "à Mina", "da Mina". */
export function named(name: string, article: Article = 'o', form: ArticleForm = 'o', capital = false): string {
  const w: string = ARTICLE_FORMS[article][form];
  return `${capital ? w.charAt(0).toUpperCase() + w.slice(1) : w} ${name}`;
}

/** O pronome que retoma o agente: "ele" ou "ela". */
export const pronoun = (article: Article = 'o'): string => ARTICLE_FORMS[article].ele;

export const AgentManifest = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use letras minúsculas, números e hífen'),
  name: z.string().min(1),
  role: z.string().min(1),
  article: Article.default('o'),
  model: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  effort: Effort.default('medium'),
  persona: z.string().default('persona.md'),
  chat: z.boolean().default(false),
  /** Sem o campo: `code` quando há ferramentas de arquivo, `none` quando não há. */
  runner: RunnerKind.optional(),
  /** Documentos da pasta do agente que entram no prompt a cada tarefa, como "knowledge/*.md". */
  knowledge: listDefault(z.string()),
  /** Skills de plugins/shack/skills, pelo nome da pasta. Só o runner design as carrega. */
  skills: listDefault(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use o nome da pasta da skill')),
  tools: z.object({ builtin: listDefault(z.string()), shack: listDefault(z.string()) }).default({ builtin: [], shack: [] }),
  workspace: z.enum(['required', 'optional', 'none']).default('none'),
  permissions: z.object({
    /** "allowlist": só os comandos de autoApprove rodam sozinhos. "free": tudo dentro do workspace roda, e só o arriscado pede. */
    shell: z.enum(['allowlist', 'free']).default('allowlist'),
    autoApprove: listDefault(z.string()),
    deny: listDefault(z.string()),
  }).default({ shell: 'allowlist', autoApprove: [], deny: [] }),
  confirm: listDefault(z.string()),
  limits: z.object({
    concurrency: z.number().int().min(1).max(8).default(1),
    maxTurns: z.number().int().min(1).default(200),
  }).default({ concurrency: 1, maxTurns: 200 }),
  appearance: z.record(z.string(), z.unknown()).default({}),
});
export type AgentManifest = z.infer<typeof AgentManifest>;

export const runnerOf = (m: Pick<AgentManifest, 'runner' | 'tools'>): RunnerKind => m.runner ?? (m.tools.builtin.length ? 'code' : 'none');

export const AgentStatus = z.enum(['idle', 'working', 'waiting_input', 'error', 'disabled']);
export type AgentStatus = z.infer<typeof AgentStatus>;

/** Modelo e esforço escolhidos no app, por cima do agent.yaml. Nulo = vale o do arquivo. */
export const AgentSettings = z.object({ model: z.string().nullable(), effort: Effort.nullable() });
export type AgentSettings = z.infer<typeof AgentSettings>;

/** Campo ausente fica como está; null volta ao valor do agent.yaml. */
export const AgentSettingsInput = z.object({
  model: z.string().trim().min(1).max(80).regex(/^[\w.:[\]-]+$/, 'use o apelido ou o id do modelo').nullable().optional(),
  effort: Effort.nullable().optional(),
});
export type AgentSettingsInput = z.infer<typeof AgentSettingsInput>;

export const AgentInfo = z.object({
  id,
  name: z.string(),
  role: z.string(),
  article: Article,
  /** Modelos do agent.yaml, em ordem de preferência. */
  models: z.array(z.string()),
  /** Esforço do agent.yaml. */
  effort: z.string(),
  /** A troca feita no app. O que vale é ela; sem troca, o agent.yaml. */
  settings: AgentSettings,
  chat: z.boolean(),
  runner: RunnerKind,
  status: AgentStatus,
  activity: z.string().nullable(),
  currentTaskId: z.string().nullable(),
  /** review: a tarefa atual confere a entrega de outra (a cena marca as linhas de vermelho). */
  currentTaskKind: z.enum(['task', 'review']).nullable(),
  manifestError: z.string().nullable(),
  appearance: z.record(z.string(), z.unknown()),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

export const Persona = z.object({ content: z.string().max(100_000) });
export type Persona = z.infer<typeof Persona>;

/* ---------- workspaces ---------- */
export const Workspace = z.object({
  id,
  name: z.string(),
  path: z.string(),
  /** Regras extras de auto-aprovação, além das do manifesto. Ex.: "Bash(npm run build*)". */
  autoApprove: z.array(z.string()),
  /** Se verdadeiro e o workspace for um repositório git, cada tarefa ganha um branch próprio. */
  gitBranching: z.boolean(),
  isGitRepo: z.boolean(),
  createdAt: isoDate,
});
export type Workspace = z.infer<typeof Workspace>;

export const WorkspaceInput = z.object({
  name: z.string().trim().min(1).max(60),
  path: z.string().trim().min(1).max(500),
  autoApprove: z.array(z.string().min(1).max(200)).max(50).default([]),
  gitBranching: z.boolean().default(true),
});
export type WorkspaceInput = z.infer<typeof WorkspaceInput>;

export const WorkspacePatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  autoApprove: z.array(z.string().min(1).max(200)).max(50).optional(),
  gitBranching: z.boolean().optional(),
});
export type WorkspacePatch = z.infer<typeof WorkspacePatch>;

/* ---------- tarefas ---------- */
export const TaskStatus = z.enum(['queued', 'running', 'waiting_input', 'done', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Priority = z.enum(['low', 'normal', 'high']);
export type Priority = z.infer<typeof Priority>;

export const TaskOrigin = z.object({
  kind: z.enum(['user', 'agent', 'schedule']),
  agentId: z.string().optional(),
  deviceId: z.string().optional(),
  conversationId: z.string().optional(),
});
export type TaskOrigin = z.infer<typeof TaskOrigin>;

/**
 * Conferência feita pelo servidor depois do relatório, comparando com o git de verdade.
 * ok: bate com o diff. suspect: o relatório diz algo que o diff não mostra. unverified: não havia como conferir.
 */
export const Verification = z.object({
  status: z.enum(['ok', 'suspect', 'unverified']),
  reason: z.string(),
  /** Resumo do `git diff --stat`, quando houve branch da tarefa. */
  diffstat: z.string().nullable(),
  files: z.array(z.string()),
  /** Branch e commit da tarefa, para a conferência ler e a correção partir dali. */
  branch: z.string().nullable().optional(),
  commit: z.string().nullable().optional(),
});
export type Verification = z.infer<typeof Verification>;

/** Um requisito do pedido, conferido contra o que foi feito. A prova é arquivo e linha, ou o nome da imagem. */
export const ReviewItem = z.object({
  requirement: z.string(),
  status: z.enum(['met', 'partial', 'missing']),
  evidence: z.string().default(''),
  note: z.string().default(''),
});
export type ReviewItem = z.infer<typeof ReviewItem>;

/** Conferência da Mina: o veredito, cada requisito e os sinais de "cara de IA" de uma entrega visual. */
export const Review = z.object({
  verdict: z.enum(['pass', 'issues']),
  items: z.array(ReviewItem).default([]),
  aiSignals: z.object({
    count: z.number().int().min(0),
    found: z.array(z.object({ signal: z.string(), where: z.string().default('') })).default([]),
  }).nullable().default(null),
});
export type Review = z.infer<typeof Review>;

/** Direção visual de um prompt. O servidor mostra as últimas para a Mina não repetir fonte nem paleta. */
export const VisualDirection = z.object({
  fonts: z.array(z.string()).default([]),
  palette: z.array(z.string()).default([]),
  layout: z.string().default(''),
});
export type VisualDirection = z.infer<typeof VisualDirection>;

/** Formatos de imagem do Instagram. O tamanho é exato: o servidor confere pelo cabeçalho do PNG. */
export const DesignFormat = z.enum(['feed', 'square', 'story']);
export type DesignFormat = z.infer<typeof DesignFormat>;
export const DESIGN_SIZES: Record<DesignFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

/** Uma imagem pronta, na ordem do carrossel. O arquivo sai em GET /tasks/{id}/images/{name}. */
export const DesignImage = z.object({
  name: z.string(),
  format: DesignFormat,
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  /** Texto alternativo, para colar no Instagram. */
  alt: z.string(),
});
export type DesignImage = z.infer<typeof DesignImage>;

export const TaskResult = z.object({
  summary: z.string(),
  changes: z.array(z.object({ path: z.string(), what: z.string() })).default([]),
  howToTest: z.string().default(''),
  notes: z.string().optional(),
  /** Texto pronto para usar: o prompt da Mina, o prompt de correção de uma conferência ou a legenda do Harker. */
  output: z.string().optional(),
  review: Review.optional(),
  direction: VisualDirection.optional(),
  /** As imagens que o servidor conferiu em disco. O que o modelo mandar neste campo é descartado. */
  images: z.array(DesignImage).optional(),
  /** Escrita só pelo servidor. O que o modelo mandar neste campo é descartado. */
  verification: Verification.optional(),
});
export type TaskResult = z.infer<typeof TaskResult>;

export const TaskUsage = z.object({ inputTokens: z.number(), outputTokens: z.number() });
export type TaskUsage = z.infer<typeof TaskUsage>;

export const Task = z.object({
  id,
  title: z.string(),
  prompt: z.string(),
  assignee: z.string(),
  origin: TaskOrigin,
  status: TaskStatus,
  priority: Priority,
  workspaceId: z.string().nullable(),
  parentId: z.string().nullable(),
  /** A tarefa concluída que esta confere. */
  reviewOf: z.string().nullable(),
  sessionId: z.string().nullable(),
  model: z.string().nullable(),
  result: TaskResult.nullable(),
  error: z.string().nullable(),
  usage: TaskUsage.nullable(),
  /** Nota de passagem de uma tarefa que falhou ou foi cancelada: o que fez, o que falhou e o que falta. */
  handoff: z.string().nullable(),
  createdAt: isoDate,
  startedAt: isoDate.nullable(),
  finishedAt: isoDate.nullable(),
});
export type Task = z.infer<typeof Task>;

export const TaskHistoryEntry = z.object({ status: TaskStatus, note: z.string().nullable(), at: isoDate });
export type TaskHistoryEntry = z.infer<typeof TaskHistoryEntry>;

export const TaskDetail = Task.extend({ history: z.array(TaskHistoryEntry) });
export type TaskDetail = z.infer<typeof TaskDetail>;

export const CreateTaskInput = z.object({
  assignee: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(20_000),
  priority: Priority.default('normal'),
  workspaceId: z.string().optional(),
  parentId: z.string().optional(),
  /** Para a Mina: a tarefa concluída que ela deve conferir. */
  reviewOf: z.string().optional(),
  /** Anexos enviados por POST /attachments. Só o runner design recebe; os arquivos vão para a pasta input/ da tarefa. */
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const TaskInput = z.object({ text: z.string().min(1).max(20_000) });
export type TaskInput = z.infer<typeof TaskInput>;

/* ---------- aprovações ---------- */
export const ApprovalKind = z.enum(['tool', 'question', 'destructive']);
export type ApprovalKind = z.infer<typeof ApprovalKind>;
export const ApprovalStatus = z.enum(['pending', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;
export const Decision = z.enum(['approve', 'deny']);
export type Decision = z.infer<typeof Decision>;

export const Approval = z.object({
  id,
  agentId: z.string(),
  taskId: z.string().nullable(),
  kind: ApprovalKind,
  summary: z.string(),
  detail: z.unknown(),
  options: z.array(z.string()).nullable(),
  status: ApprovalStatus,
  answer: z.string().nullable(),
  createdAt: isoDate,
  resolvedAt: isoDate.nullable(),
});
export type Approval = z.infer<typeof Approval>;

export const ResolveApprovalInput = z.object({ decision: Decision, answer: z.string().max(5000).optional() });
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInput>;

/* ---------- eventos ---------- */
export const EventType = z.enum([
  'agent.status', 'agent.updated',
  'task.created', 'task.updated', 'task.progress', 'task.waiting_input', 'task.done', 'task.failed', 'task.cancelled',
  'approval.requested', 'approval.resolved',
  'chat.message', 'reminder.fired', 'timer.finished', 'calendar.changed', 'notification.created', 'system.quota', 'data.changed',
  'mode.changed', 'conversation.changed',
]);
export type EventType = z.infer<typeof EventType>;

export const ShackEvent = z.object({
  seq: z.number().int(),
  id,
  ts: isoDate,
  type: EventType,
  agentId: z.string().nullable(),
  taskId: z.string().nullable(),
  data: z.unknown(),
});
export type ShackEvent = z.infer<typeof ShackEvent>;

export const EventPage = z.object({ items: z.array(ShackEvent), nextSince: z.number().int() });
export type EventPage = z.infer<typeof EventPage>;
