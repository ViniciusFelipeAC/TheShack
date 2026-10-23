import { z } from '@hono/zod-openapi';
import { ApiError, type Device } from '@shack/shared';

export type Env = { Variables: { device: Device } };

export const J = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });

export const ERRORS = {
  400: { ...J(ApiError), description: 'Dados inválidos' },
  401: { ...J(ApiError), description: 'Token ausente, inválido ou revogado' },
  404: { ...J(ApiError), description: 'Não encontrado' },
  409: { ...J(ApiError), description: 'Conflito com o estado atual' },
};

export const IdParam = z.object({ id: z.string() });
