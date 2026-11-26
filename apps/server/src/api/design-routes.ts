import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { IMAGE_NAME } from '../renfield/lenient.ts';
import { notFound } from '../errors.ts';
import type { Shack } from '../shack.ts';
import { Binary, type Env, ERRORS } from './common.ts';

/** Imagens das tarefas do runner design. Não há caminho livre: o nome precisa estar na lista que o servidor conferiu. */
export function registerDesignRoutes(api: OpenAPIHono<Env>, shack: Shack): void {
  api.openapi(createRoute({
    method: 'get', path: '/tasks/{id}/images/{name}', tags: ['Tarefas'],
    summary: 'Baixa uma imagem de uma tarefa do runner design. O nome precisa estar em result.images.',
    request: { params: z.object({ id: z.string(), name: z.string().regex(IMAGE_NAME) }) },
    responses: { 200: { content: { 'image/png': { schema: Binary } }, description: 'O PNG' }, 400: ERRORS[400], 401: ERRORS[401], 404: ERRORS[404] },
  }), (c) => {
    const { id, name } = c.req.valid('param');
    const task = shack.tasks.get(id);
    if (!task.result?.images?.some((i) => i.name === name)) throw notFound('Imagem');
    let data: Buffer;
    try { data = readFileSync(join(shack.config.designDir, task.id, 'out', `${name}.png`)); } catch { throw notFound('Arquivo da imagem'); }
    return c.body(new Uint8Array(data), 200, {
      'content-type': 'image/png',
      'content-disposition': `inline; filename="${name}.png"`,
      // Repetir a tarefa regrava as imagens com o mesmo nome: o app sempre confere.
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
    });
  });
}
