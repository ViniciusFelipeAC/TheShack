import { z } from 'zod';
import type { ShackEvent } from './schemas.ts';

/** Mensagens que o cliente manda pelo WebSocket. A primeira tem que ser `auth`. */
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1) }),
  z.object({ type: z.literal('subscribe'), since: z.number().int().min(0).optional() }),
  z.object({
    type: z.literal('chat.send'),
    conversationId: z.string().default('main'),
    text: z.string().min(1).max(20_000),
    style: z.enum(['normal', 'short', 'voice']).optional(),
    clientId: z.string(),
  }),
  z.object({
    type: z.literal('approval.respond'),
    approvalId: z.string(),
    decision: z.enum(['approve', 'deny']),
    answer: z.string().max(5000).optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Mensagens que o servidor manda pelo WebSocket. */
export type ServerMessage =
  | { type: 'auth.ok'; deviceId: string }
  | { type: 'event'; event: ShackEvent }
  | { type: 'chat.delta'; conversationId: string; messageId: string; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

/** Código de fechamento quando a autenticação falha ou o dispositivo é revogado. */
export const WS_CLOSE_UNAUTHORIZED = 4001;
