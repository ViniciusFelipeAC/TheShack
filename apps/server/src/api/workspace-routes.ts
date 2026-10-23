import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { Workspace, WorkspaceInput, WorkspacePatch } from '@shack/shared';
import type { Shack } from '../shack.ts';
import { type Env, ERRORS, IdParam, J } from './common.ts';

export function registerWorkspaceRoutes(api: OpenAPIHono<Env>, shack: Shack) {
  const { workspaces } = shack;

  api.openapi(createRoute({
    method: 'get', path: '/workspaces', tags: ['Workspaces'], summary: 'Pastas onde o etnaD pode trabalhar',
    responses: { 200: { ...J(z.array(Workspace)), description: 'Workspaces' }, 401: ERRORS[401] },
  }), (c) => c.json(workspaces.list(), 200));

  api.openapi(createRoute({
    method: 'post', path: '/workspaces', tags: ['Workspaces'], summary: 'Cadastra uma pasta de projeto',
    request: { body: J(WorkspaceInput) },
    responses: { 201: { ...J(Workspace), description: 'Workspace' }, 400: ERRORS[400], 401: ERRORS[401], 409: ERRORS[409] },
  }), (c) => c.json(workspaces.create(c.req.valid('json')), 201));

  api.openapi(createRoute({
    method: 'patch', path: '/workspaces/{id}', tags: ['Workspaces'], summary: 'Muda nome, comandos liberados ou o uso de branch por tarefa',
    request: { params: IdParam, body: J(WorkspacePatch) },
    responses: { 200: { ...J(Workspace), description: 'Workspace' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  }), (c) => c.json(workspaces.update(c.req.valid('param').id, c.req.valid('json')), 200));

  api.openapi(createRoute({
    method: 'delete', path: '/workspaces/{id}', tags: ['Workspaces'], summary: 'Remove o cadastro. A pasta em si não é apagada.',
    request: { params: IdParam },
    responses: { 200: { ...J(z.object({ deleted: z.boolean() })), description: 'Removido' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { workspaces.delete(c.req.valid('param').id); return c.json({ deleted: true }, 200); });
}
