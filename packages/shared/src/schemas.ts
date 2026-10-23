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

export const AgentManifest = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use letras minúsculas, números e hífen'),
  name: z.string().min(1),
  role: z.string().min(1),
  model: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  persona: z.string().default('persona.md'),
  chat: z.boolean().default(false),
  tools: z.object({ builtin: listDefault(z.string()), shack: listDefault(z.string()) }).default({ builtin: [], shack: [] }),
  workspace: z.enum(['required', 'optional', 'none']).default('none'),
  permissions: z.object({ autoApprove: listDefault(z.string()), deny: listDefault(z.string()) }).default({ autoApprove: [], deny: [] }),
  confirm: listDefault(z.string()),
  limits: z.object({
    concurrency: z.number().int().min(1).max(8).default(1),
    maxTurns: z.number().int().min(1).default(200),
  }).default({ concurrency: 1, maxTurns: 200 }),
  appearance: z.record(z.string(), z.unknown()).default({}),
});
export type AgentManifest = z.infer<typeof AgentManifest>;

export const AgentStatus = z.enum(['idle', 'working', 'waiting_input', 'error', 'disabled']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentInfo = z.object({
  id,
  name: z.string(),
  role: z.string(),
  models: z.array(z.string()),
  effort: z.string(),
  chat: z.boolean(),
  status: AgentStatus,
  activity: z.string().nullable(),
  currentTaskId: z.string().nullable(),
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
});
export type Verification = z.infer<typeof Verification>;

export const TaskResult = z.object({
  summary: z.string(),
  changes: z.array(z.object({ path: z.string(), what: z.string() })).default([]),
  howToTest: z.string().default(''),
  notes: z.string().optional(),
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
  'mode.changed',
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
