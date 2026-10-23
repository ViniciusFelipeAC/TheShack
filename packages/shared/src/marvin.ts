import { z } from 'zod';

/* ---------- conversa ---------- */
export const ChatStyle = z.enum(['normal', 'short', 'voice']);
export type ChatStyle = z.infer<typeof ChatStyle>;

export const Conversation = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof Conversation>;

export const MessageKind = z.enum(['text', 'task_notice', 'error']);
export type MessageKind = z.infer<typeof MessageKind>;

export const ChatMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  kind: MessageKind,
  text: z.string(),
  style: ChatStyle.nullable(),
  taskId: z.string().nullable(),
  deviceId: z.string().nullable(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const SendMessageInput = z.object({
  text: z.string().trim().min(1).max(20_000),
  style: ChatStyle.default('normal'),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const SendMessageResult = z.object({
  conversationId: z.string(),
  message: ChatMessage,
  /** Resposta do Marvin. Só vem quando a chamada usa ?wait=true. */
  reply: ChatMessage.nullable(),
});
export type SendMessageResult = z.infer<typeof SendMessageResult>;

/* ---------- memória, regras e modos ---------- */
export const MemoryKind = z.enum(['fact', 'preference']);
export const Source = z.enum(['user', 'marvin', 'feedback']);

export const Memory = z.object({
  id: z.string(),
  content: z.string(),
  kind: MemoryKind,
  source: Source,
  isNew: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof Memory>;

export const MemoryInput = z.object({ content: z.string().trim().min(1).max(2000), kind: MemoryKind.default('fact') });
export const MemoryPatch = z.object({ content: z.string().trim().min(1).max(2000).optional(), kind: MemoryKind.optional(), isNew: z.boolean().optional() });

export const Rule = z.object({
  id: z.string(),
  trigger: z.string().nullable(),
  instruction: z.string(),
  enabled: z.boolean(),
  source: Source,
  isNew: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Rule = z.infer<typeof Rule>;

export const RuleInput = z.object({ instruction: z.string().trim().min(1).max(2000), trigger: z.string().trim().max(200).optional() });
export const RulePatch = z.object({
  instruction: z.string().trim().min(1).max(2000).optional(),
  trigger: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
  isNew: z.boolean().optional(),
});

export const NotifyPriority = z.enum(['low', 'normal', 'high']);
export const Mode = z.object({
  name: z.string(),
  minPriority: NotifyPriority,
  description: z.string(),
  active: z.boolean(),
});
export type Mode = z.infer<typeof Mode>;

export const ModeInput = z.object({
  name: z.string().trim().min(1).max(40),
  minPriority: NotifyPriority.default('high'),
  description: z.string().trim().max(300).default(''),
});
export const ActiveModeInput = z.object({ name: z.string().nullable() });

export const FeedbackInput = z.object({ text: z.string().trim().min(1).max(2000) });

/* ---------- conta e modelos ---------- */
/** Uma janela de limite do plano, como o SDK informa (5 horas, 7 dias, por modelo). */
export const QuotaWindow = z.object({
  kind: z.string(),
  status: z.enum(['allowed', 'allowed_warning', 'rejected']),
  /** Uso em porcentagem, 0 a 100. Nulo quando o SDK não mandou o número. */
  percent: z.number().nullable(),
  resetsAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type QuotaWindow = z.infer<typeof QuotaWindow>;

export const QuotaStatus = z.object({
  /** O pior estado entre as janelas. */
  status: z.enum(['allowed', 'allowed_warning', 'rejected']),
  /** Janela que mais pesa agora: a bloqueada, a em alerta ou a mais usada. */
  kind: z.string().nullable(),
  resetsAt: z.string().nullable(),
  percent: z.number().nullable(),
  windows: z.array(QuotaWindow),
  /** Verdadeiro se o SDK indicar uso de cobrança extra (overage). A Shack é de custo zero. */
  overage: z.boolean(),
});
export type QuotaStatus = z.infer<typeof QuotaStatus>;

export const AccountStatus = z.object({
  /** Verdadeiro quando a credencial em uso é a da sua assinatura. */
  subscriptionOk: z.boolean().nullable(),
  subscriptionType: z.string().nullable(),
  credentialSource: z.string().nullable(),
  problem: z.string().nullable(),
  availableModels: z.array(z.object({ value: z.string(), displayName: z.string() })),
  agentModels: z.record(z.string(), z.string().nullable()),
  quota: QuotaStatus.nullable(),
  checkedAt: z.string().nullable(),
});
export type AccountStatus = z.infer<typeof AccountStatus>;
