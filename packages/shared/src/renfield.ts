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

/* ---------- anexos ---------- */
export const AttachmentKind = z.enum(['image', 'pdf', 'text']);
export type AttachmentKind = z.infer<typeof AttachmentKind>;

export const Attachment = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  kind: AttachmentKind,
  size: z.number().int(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof Attachment>;

/**
 * Limites por arquivo. As fotos são reduzidas no navegador antes de subir (o modelo não aproveita mais que
 * uns 1.600 px e cada pixel a mais gasta cota); o servidor só confere. 5 MB por imagem é o teto do modelo.
 */
export const ATTACHMENT_LIMITS = {
  perMessage: 5,
  imageBytes: 5 * 1024 * 1024,
  pdfBytes: 10 * 1024 * 1024,
  textBytes: 512 * 1024,
} as const;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'ps1', 'bat', 'sql', 'log', 'ini', 'toml', 'srt', 'vtt',
]);
const EXT_IMAGE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/** Que tipo de anexo é, pelo tipo que o navegador informou ou pela extensão. Nulo = o Renfield não lê. */
export function attachmentKind(name: string, mime: string): AttachmentKind | null {
  const type = mime.split(';')[0]!.trim().toLowerCase();
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if ((IMAGE_TYPES as readonly string[]).includes(type) || (!type.startsWith('image/') && EXT_IMAGE[ext])) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('text/') || /^application\/(json|xml|x-yaml|yaml|x-sh|javascript)$/.test(type) || TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

export const ChatMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  kind: MessageKind,
  text: z.string(),
  style: ChatStyle.nullable(),
  taskId: z.string().nullable(),
  deviceId: z.string().nullable(),
  attachments: z.array(Attachment),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const SendMessageInput = z.object({
  text: z.string().trim().max(20_000).default(''),
  style: ChatStyle.default('normal'),
  /** Ids devolvidos por POST /attachments. Cada anexo vai numa mensagem só. */
  attachmentIds: z.array(z.string()).max(ATTACHMENT_LIMITS.perMessage).default([]),
}).refine((m) => m.text.length > 0 || m.attachmentIds.length > 0, { message: 'Escreva uma mensagem ou anexe um arquivo.' });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const SendMessageResult = z.object({
  conversationId: z.string(),
  message: ChatMessage,
  /** Resposta do Renfield. Só vem quando a chamada usa ?wait=true. */
  reply: ChatMessage.nullable(),
});
export type SendMessageResult = z.infer<typeof SendMessageResult>;

/* ---------- memória, regras e modos ---------- */
export const MemoryKind = z.enum(['fact', 'preference']);
export const Source = z.enum(['user', 'renfield', 'feedback']);

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
