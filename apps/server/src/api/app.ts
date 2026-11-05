import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AgentInfo, Approval, ApprovalStatus, CreateTaskInput, Device, EventPage, EventType, page,
  PairingCode, PairInput, PairResult, Persona, ResolveApprovalInput, ShackEvent, Task, TaskDetail, TaskInput, TaskStatus,
} from '@shack/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { HttpError } from '../errors.ts';
import { remoteInfo } from '../system/remote.ts';
import type { Shack } from '../shack.ts';
import { type Env, ERRORS, IdParam, J } from './common.ts';
import { registerRenfieldRoutes } from './renfield-routes.ts';
import { registerWorkspaceRoutes } from './workspace-routes.ts';
import { registerAssistantRoutes } from './assistant-routes.ts';
import { WsHub, wsHandler } from './ws.ts';

export const API_VERSION = '0.8.0';

const PUBLIC_PATHS = new Set(['/api/v1/health', '/api/v1/auth/pair', '/api/v1/openapi.json', '/api/v1/ws']);

export function createApp(shack: Shack) {
  const { auth, tasks, registry, approvals, bus } = shack;
  const hub = new WsHub();

  const api = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: { code: 'invalid_request', message: 'Dados inválidos.', details: result.error.issues } }, 400);
      }
    },
  });
  api.openAPIRegistry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer' });

  api.use('*', async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) return next();
    const header = c.req.header('authorization') ?? '';
    const device = auth.verify(header.startsWith('Bearer ') ? header.slice(7).trim() : null);
    if (!device) throw new HttpError(401, 'unauthorized', 'Token ausente, inválido ou revogado.');
    c.set('device', device);
    await next();
  });

  /* ---------- sistema e autenticação ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/health', tags: ['Sistema'], summary: 'Diz se o servidor está no ar', security: [],
    responses: { 200: { ...J(z.object({ ok: z.boolean(), version: z.string(), time: z.string() })), description: 'No ar' } },
  }), (c) => c.json({ ok: true, version: API_VERSION, time: new Date().toISOString() }, 200));

  api.openapi(createRoute({
    method: 'get', path: '/system/remote', tags: ['Sistema'], summary: 'Endereço HTTPS da Shack na sua tailnet, para abrir no celular',
    responses: {
      200: {
        ...J(z.object({
          tailscale: z.enum(['missing', 'stopped', 'running']), url: z.string().nullable(), serving: z.boolean().nullable(),
          serveCommand: z.string(), webBuilt: z.boolean(),
        })),
        description: 'Situação do acesso remoto',
      },
      401: ERRORS[401],
    },
  }), async (c) => c.json({ ...(await remoteInfo(shack.config.port)), webBuilt: existsSync(join(shack.config.webDir, 'index.html')) }, 200));

  api.openapi(createRoute({
    method: 'get', path: '/me', tags: ['Dispositivos'], summary: 'Dispositivo dono do token',
    responses: { 200: { ...J(Device), description: 'Dispositivo' }, 401: ERRORS[401] },
  }), (c) => c.json(c.get('device'), 200));

  api.openapi(createRoute({
    method: 'get', path: '/devices', tags: ['Dispositivos'], summary: 'Lista os dispositivos',
    responses: { 200: { ...J(z.array(Device)), description: 'Dispositivos' }, 401: ERRORS[401] },
  }), (c) => c.json(auth.list(), 200));

  api.openapi(createRoute({
    method: 'delete', path: '/devices/{id}', tags: ['Dispositivos'], summary: 'Revoga um dispositivo e derruba as conexões dele',
    request: { params: IdParam },
    responses: { 200: { ...J(Device), description: 'Dispositivo revogado' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => {
    const device = auth.revoke(c.req.valid('param').id);
    hub.closeDevice(device.id);
    shack.push.forgetDevice(device.id);
    return c.json(device, 200);
  });

  api.openapi(createRoute({
    method: 'post', path: '/auth/pairing-codes', tags: ['Dispositivos'], summary: 'Gera um código de 6 dígitos para parear um dispositivo novo',
    responses: { 200: { ...J(PairingCode), description: 'Código, válido por 5 minutos' }, 401: ERRORS[401] },
  }), (c) => c.json(auth.createPairingCode(c.get('device').id), 200));

  api.openapi(createRoute({
    method: 'post', path: '/auth/pair', tags: ['Dispositivos'], summary: 'Troca um código de pareamento por um token', security: [],
    request: { body: J(PairInput) },
    responses: { 200: { ...J(PairResult), description: 'Token do dispositivo novo. Ele aparece uma única vez.' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => {
    const body = c.req.valid('json');
    return c.json(auth.pair(body.code, body.deviceName, body.kind), 200);
  });

  /* ---------- agentes ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/agents', tags: ['Agentes'], summary: 'Lista os agentes com status e tarefa atual',
    responses: { 200: { ...J(z.array(AgentInfo)), description: 'Agentes' }, 401: ERRORS[401] },
  }), (c) => c.json(registry.list().map((d) => tasks.agentInfo(d)), 200));

  api.openapi(createRoute({
    method: 'get', path: '/agents/{id}', tags: ['Agentes'], summary: 'Detalhe de um agente',
    request: { params: IdParam },
    responses: { 200: { ...J(AgentInfo), description: 'Agente' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(tasks.agentInfo(registry.require(c.req.valid('param').id)), 200));

  api.openapi(createRoute({
    method: 'get', path: '/agents/{id}/persona', tags: ['Agentes'], summary: 'Lê o persona.md do agente',
    request: { params: IdParam },
    responses: { 200: { ...J(Persona), description: 'Persona' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json({ content: registry.require(c.req.valid('param').id).persona }, 200));

  api.openapi(createRoute({
    method: 'put', path: '/agents/{id}/persona', tags: ['Agentes'], summary: 'Reescreve o persona.md do agente',
    request: { params: IdParam, body: J(Persona) },
    responses: { 200: { ...J(Persona), description: 'Persona salva' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  }), (c) => c.json({ content: registry.writePersona(c.req.valid('param').id, c.req.valid('json').content).persona }, 200));

  api.openapi(createRoute({
    method: 'post', path: '/agents/{id}/clear-error', tags: ['Agentes'], summary: 'Tira o sinal de erro do agente na cena',
    request: { params: IdParam },
    responses: { 200: { ...J(AgentInfo), description: 'Agente' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(tasks.clearError(c.req.valid('param').id), 200));

  /* ---------- tarefas ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/tasks', tags: ['Tarefas'], summary: 'Lista tarefas, das mais novas para as mais antigas',
    request: {
      query: z.object({
        status: TaskStatus.optional(), assignee: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional(),
      }),
    },
    responses: { 200: { ...J(page(Task)), description: 'Página de tarefas' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(tasks.list(c.req.valid('query')), 200));

  api.openapi(createRoute({
    method: 'post', path: '/tasks', tags: ['Tarefas'], summary: 'Cria uma tarefa para um agente',
    request: { body: J(CreateTaskInput) },
    responses: { 201: { ...J(Task), description: 'Tarefa criada na fila' }, 400: ERRORS[400], 401: ERRORS[401], 409: ERRORS[409] },
  }), (c) => c.json(tasks.create(c.req.valid('json'), { kind: 'user', deviceId: c.get('device').id }), 201));

  api.openapi(createRoute({
    method: 'get', path: '/tasks/{id}', tags: ['Tarefas'], summary: 'Tarefa com o histórico de estados',
    request: { params: IdParam },
    responses: { 200: { ...J(TaskDetail), description: 'Tarefa' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(tasks.get(c.req.valid('param').id), 200));

  api.openapi(createRoute({
    method: 'get', path: '/tasks/{id}/events', tags: ['Tarefas'], summary: 'Eventos de uma tarefa',
    request: { params: IdParam },
    responses: { 200: { ...J(z.array(ShackEvent)), description: 'Eventos' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => {
    const { id } = c.req.valid('param');
    tasks.get(id);
    return c.json(bus.list({ since: 0, limit: 1000, taskId: id }), 200);
  });

  const action = (verb: 'cancel' | 'retry', summary: string) => createRoute({
    method: 'post', path: `/tasks/{id}/${verb}`, tags: ['Tarefas'], summary,
    request: { params: IdParam },
    responses: { 200: { ...J(Task), description: 'Tarefa' }, 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  });
  api.openapi(action('cancel', 'Cancela uma tarefa na fila ou em andamento'), (c) => c.json(tasks.cancel(c.req.valid('param').id), 200));
  api.openapi(action('retry', 'Coloca de novo na fila uma tarefa que falhou ou foi cancelada'), (c) => c.json(tasks.retry(c.req.valid('param').id), 200));

  api.openapi(createRoute({
    method: 'post', path: '/tasks/{id}/input', tags: ['Tarefas'], summary: 'Responde à pergunta de uma tarefa que espera você',
    request: { params: IdParam, body: J(TaskInput) },
    responses: { 200: { ...J(Task), description: 'Tarefa' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  }), (c) => c.json(tasks.input(c.req.valid('param').id, c.req.valid('json').text, c.get('device').id), 200));

  /* ---------- aprovações e eventos ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/approvals', tags: ['Aprovações'], summary: 'Lista aprovações, por padrão as pendentes',
    request: { query: z.object({ status: ApprovalStatus.default('pending') }) },
    responses: { 200: { ...J(z.array(Approval)), description: 'Aprovações' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(approvals.list(c.req.valid('query').status), 200));

  api.openapi(createRoute({
    method: 'post', path: '/approvals/{id}', tags: ['Aprovações'], summary: 'Aprova ou nega um pedido',
    request: { params: IdParam, body: J(ResolveApprovalInput) },
    responses: { 200: { ...J(Approval), description: 'Aprovação respondida' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409] },
  }), (c) => {
    const body = c.req.valid('json');
    return c.json(approvals.resolve(c.req.valid('param').id, body.decision, body.answer, c.get('device').id), 200);
  });

  api.openapi(createRoute({
    method: 'get', path: '/events', tags: ['Eventos'], summary: 'Eventos depois de `since`, para quem estava desconectado',
    request: {
      query: z.object({
        since: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(200),
        type: EventType.optional(), agentId: z.string().optional(),
      }),
    },
    responses: { 200: { ...J(EventPage), description: 'Eventos em ordem' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => {
    const q = c.req.valid('query');
    const items = bus.list(q);
    return c.json({ items, nextSince: items.length ? items[items.length - 1]!.seq : q.since }, 200);
  });

  registerRenfieldRoutes(api, shack);
  registerWorkspaceRoutes(api, shack);
  registerAssistantRoutes(api, shack);

  api.doc('/openapi.json', {
    openapi: '3.0.3',
    servers: [{ url: '/api/v1' }],
    info: { title: 'The Shack API', version: API_VERSION, description: 'API do sistema pessoal de agentes. O protocolo do WebSocket está em docs/API.md.' },
    security: [{ bearer: [] }],
  });

  api.get('/ws', wsHandler(shack, hub));

  const onError = (err: Error, c: Context) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status);
    }
    console.error('[api] erro inesperado:', err);
    return c.json({ error: { code: 'internal', message: 'Erro interno no servidor.' } }, 500);
  };
  api.onError(onError);

  const app = new Hono();
  // Declara UTF-8 explicitamente: clientes como o PowerShell 5.1 leem acentos errado sem isso.
  app.use('*', async (c, next) => {
    await next();
    if (c.res.headers.get('content-type') === 'application/json') c.res.headers.set('content-type', 'application/json; charset=utf-8');
  });
  app.route('/api/v1', api);
  app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404));
  serveWeb(app, shack.config.webDir);
  app.onError(onError);
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404));
  return { app, hub };
}

/**
 * Entrega o app web (o build do Vite) no mesmo endereço da API. É assim que o celular usa a Shack pelo
 * Tailscale: uma origem só, com HTTPS, onde o PWA instala e o push funciona.
 */
function serveWeb(app: Hono, webDir: string): void {
  const index = join(webDir, 'index.html');
  // Confere o build a cada pedido: um `npm run build` novo vale na hora, sem reiniciar o servidor.
  let files: ReturnType<typeof serveStatic> | null = null;
  app.use('/*', async (c, next) => {
    if (!existsSync(index)) return next();
    files ??= serveStatic({ root: webDir });
    // Achando o arquivo, o serveStatic devolve a resposta em vez de gravá-la no contexto.
    const found = await files(c, next);
    if (found instanceof Response) c.res = found;
    if (!c.res.ok) return;
    // Arquivos com hash no nome nunca mudam; o resto (index, service worker, manifesto) é sempre conferido.
    c.res.headers.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (c.req.path.endsWith('.webmanifest')) c.res.headers.set('Content-Type', 'application/manifest+json');
  });
  // Qualquer outra página é do app (rotas do lado do cliente, como /#agenda).
  app.get('*', (c) => {
    if (existsSync(index)) return c.html(readFileSync(index, 'utf8'));
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Shack</title><body style="font:16px system-ui;background:#070a0b;color:#e7ece9;padding:24px;max-width:36rem">
<h1>The Shack</h1><p>O servidor está no ar, mas o app web ainda não foi gerado.</p>
<p>Na pasta do projeto, rode <code>npm run build</code> e recarregue esta página. Para desenvolver, use <code>npm run dev</code> e abra a porta 5173.</p></body>`);
  });
}
