import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AccountStatus, ActiveModeInput, Attachment, ATTACHMENT_LIMITS, ChatMessage, Conversation, FeedbackInput, Memory, MemoryInput, MemoryPatch,
  Mode, ModeInput, Rule, RuleInput, RulePatch, SendMessageInput, SendMessageResult,
} from '@shack/shared';
import { bodyLimit } from 'hono/body-limit';
import type { Shack } from '../shack.ts';
import { type Env, ERRORS, IdParam, J } from './common.ts';

const Deleted = z.object({ deleted: z.boolean() });
const Binary = z.string().openapi({ type: 'string', format: 'binary' });

export function registerRenfieldRoutes(api: OpenAPIHono<Env>, shack: Shack) {
  const { chat, mind, account, attachments } = shack;

  /* ---------- anexos ---------- */
  // O maior anexo aceito é o PDF; o corte aqui evita ler um corpo gigante para depois recusar.
  api.use('/attachments', bodyLimit({
    maxSize: ATTACHMENT_LIMITS.pdfBytes + 64 * 1024,
    onError: (c) => c.json({ error: { code: 'too_large', message: 'Arquivo grande demais. O limite é 10 MB para PDF, 5 MB para foto e 512 KB para texto.' } }, 413),
  }));

  api.openapi(createRoute({
    method: 'post', path: '/attachments', tags: ['Chat'],
    summary: 'Sobe um anexo para a próxima mensagem. O corpo é o próprio arquivo, o tipo vai no Content-Type e o nome em ?name=.',
    request: {
      query: z.object({ name: z.string().trim().min(1).max(200) }),
      body: { content: { 'application/octet-stream': { schema: Binary } }, description: 'O arquivo. Foto (JPG, PNG, GIF, WebP), PDF ou texto.' },
    },
    responses: {
      201: { ...J(Attachment), description: 'Anexo pronto. Mande o id em attachmentIds; sem uso em 24 horas, ele é apagado.' },
      400: ERRORS[400], 401: ERRORS[401], 413: { ...ERRORS[400], description: 'Arquivo grande demais' },
    },
  }), async (c) => {
    const bytes = Buffer.from(await c.req.arrayBuffer());
    return c.json(attachments.save({ name: c.req.valid('query').name, mime: c.req.header('content-type') ?? '', bytes, deviceId: c.get('device').id }), 201);
  });

  api.openapi(createRoute({
    method: 'get', path: '/attachments/{id}', tags: ['Chat'], summary: 'Baixa um anexo. Texto sai sempre como text/plain.',
    request: { params: IdParam },
    responses: { 200: { content: { 'application/octet-stream': { schema: Binary } }, description: 'O arquivo' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => {
    const { meta, data } = attachments.read(c.req.valid('param').id);
    return c.body(new Uint8Array(data), 200, {
      // Nunca como HTML: um arquivo enviado não pode virar página com acesso à sessão do app.
      'content-type': meta.kind === 'text' ? 'text/plain; charset=utf-8' : meta.mime,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
  });

  /* ---------- conversa ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/conversations', tags: ['Chat'], summary: 'Lista as conversas com o Renfield. A principal tem id "main".',
    responses: { 200: { ...J(z.array(Conversation)), description: 'Conversas' }, 401: ERRORS[401] },
  }), (c) => c.json(chat.conversations(), 200));

  api.openapi(createRoute({
    method: 'post', path: '/conversations', tags: ['Chat'], summary: 'Abre uma conversa nova',
    request: { body: J(z.object({ title: z.string().trim().min(1).max(120).default('Nova conversa') })) },
    responses: { 201: { ...J(Conversation), description: 'Conversa' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => c.json(chat.createConversation(c.req.valid('json').title), 201));

  api.openapi(createRoute({
    method: 'get', path: '/conversations/{id}/messages', tags: ['Chat'], summary: 'Mensagens da conversa, em ordem cronológica',
    request: { params: IdParam, query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), before: z.string().optional() }) },
    responses: { 200: { ...J(z.array(ChatMessage)), description: 'Mensagens' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => {
    const q = c.req.valid('query');
    return c.json(chat.messages(c.req.valid('param').id, q.limit, q.before), 200);
  });

  api.openapi(createRoute({
    method: 'post', path: '/conversations/{id}/messages', tags: ['Chat'],
    summary: 'Manda uma mensagem ao Renfield. A resposta chega pelo WebSocket, ou no corpo com ?wait=true.',
    request: { params: IdParam, query: z.object({ wait: z.enum(['true', 'false']).optional() }), body: J(SendMessageInput) },
    responses: {
      200: { ...J(SendMessageResult), description: 'Mensagem e resposta (com ?wait=true)' },
      202: { ...J(SendMessageResult), description: 'Mensagem recebida; a resposta chega pelo WebSocket' },
      400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404],
    },
  }), async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const r = chat.send(id, body.text, body.style, c.get('device').id, body.attachmentIds);
    if (c.req.valid('query').wait === 'true' && r.reply) return c.json({ conversationId: id, message: r.message, reply: await r.reply }, 200);
    return c.json({ conversationId: id, message: r.message, reply: null }, 202);
  });

  api.openapi(createRoute({
    method: 'post', path: '/feedback', tags: ['Chat'], summary: 'Corrige o Renfield. Ele transforma o feedback em regra ou memória.',
    request: { body: J(FeedbackInput) },
    responses: { 202: { ...J(SendMessageResult), description: 'Feedback entregue ao Renfield' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => {
    const r = chat.send('main', `/feedback ${c.req.valid('json').text}`, 'normal', c.get('device').id);
    return c.json({ conversationId: 'main', message: r.message, reply: null }, 202);
  });

  /* ---------- memórias ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/memories', tags: ['Treino'], summary: 'O que o Renfield sabe sobre você',
    responses: { 200: { ...J(z.array(Memory)), description: 'Memórias' }, 401: ERRORS[401] },
  }), (c) => c.json(mind.memories(), 200));

  api.openapi(createRoute({
    method: 'post', path: '/memories', tags: ['Treino'], summary: 'Ensina um fato ou preferência',
    request: { body: J(MemoryInput) },
    responses: { 201: { ...J(Memory), description: 'Memória' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => { const b = c.req.valid('json'); return c.json(mind.addMemory(b.content, b.kind, 'user'), 201); });

  api.openapi(createRoute({
    method: 'patch', path: '/memories/{id}', tags: ['Treino'], summary: 'Corrige uma memória ou marca como revisada',
    request: { params: IdParam, body: J(MemoryPatch) },
    responses: { 200: { ...J(Memory), description: 'Memória' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(mind.updateMemory(c.req.valid('param').id, c.req.valid('json')), 200));

  api.openapi(createRoute({
    method: 'delete', path: '/memories/{id}', tags: ['Treino'], summary: 'Apaga uma memória',
    request: { params: IdParam },
    responses: { 200: { ...J(Deleted), description: 'Apagada' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { mind.deleteMemory(c.req.valid('param').id); return c.json({ deleted: true }, 200); });

  /* ---------- regras ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/rules', tags: ['Treino'], summary: 'Regras aprendidas',
    responses: { 200: { ...J(z.array(Rule)), description: 'Regras' }, 401: ERRORS[401] },
  }), (c) => c.json(mind.rules(), 200));

  api.openapi(createRoute({
    method: 'post', path: '/rules', tags: ['Treino'], summary: 'Ensina uma regra, com gatilho opcional',
    request: { body: J(RuleInput) },
    responses: { 201: { ...J(Rule), description: 'Regra' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => { const b = c.req.valid('json'); return c.json(mind.addRule(b.instruction, b.trigger ?? null, 'user'), 201); });

  api.openapi(createRoute({
    method: 'patch', path: '/rules/{id}', tags: ['Treino'], summary: 'Altera, liga, desliga ou marca como revisada',
    request: { params: IdParam, body: J(RulePatch) },
    responses: { 200: { ...J(Rule), description: 'Regra' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json(mind.updateRule(c.req.valid('param').id, c.req.valid('json')), 200));

  api.openapi(createRoute({
    method: 'delete', path: '/rules/{id}', tags: ['Treino'], summary: 'Apaga uma regra',
    request: { params: IdParam },
    responses: { 200: { ...J(Deleted), description: 'Apagada' }, 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => { mind.deleteRule(c.req.valid('param').id); return c.json({ deleted: true }, 200); });

  /* ---------- modos ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/modes', tags: ['Treino'], summary: 'Modos disponíveis e qual está ativo',
    responses: { 200: { ...J(z.array(Mode)), description: 'Modos' }, 401: ERRORS[401] },
  }), (c) => c.json(mind.modes(), 200));

  api.openapi(createRoute({
    method: 'post', path: '/modes', tags: ['Treino'], summary: 'Cria ou altera um modo',
    request: { body: J(ModeInput) },
    responses: { 200: { ...J(Mode), description: 'Modo' }, 400: ERRORS[400], 401: ERRORS[401] },
  }), (c) => { const b = c.req.valid('json'); return c.json(mind.defineMode(b.name, b.minPriority, b.description), 200); });

  api.openapi(createRoute({
    method: 'put', path: '/settings/mode', tags: ['Treino'], summary: 'Liga um modo, ou desliga com name=null',
    request: { body: J(ActiveModeInput) },
    responses: { 200: { ...J(z.object({ active: Mode.nullable() })), description: 'Modo ativo' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => c.json({ active: mind.setActiveMode(c.req.valid('json').name) }, 200));

  /* ---------- conta ---------- */
  api.openapi(createRoute({
    method: 'get', path: '/system/account', tags: ['Sistema'],
    summary: 'Assinatura em uso, modelos do seu plano, modelo de cada agente e estado da cota',
    responses: { 200: { ...J(AccountStatus), description: 'Conta' }, 401: ERRORS[401] },
  }), (c) => c.json(account.status, 200));
}
