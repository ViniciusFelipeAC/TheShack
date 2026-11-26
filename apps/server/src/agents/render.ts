import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { DESIGN_SIZES, type DesignFormat } from '@shack/shared';
import { type Browser, chromium, type Route } from 'playwright-core';
import { errorMessage } from '../errors.ts';
import { designFormat, imageName, text } from '../renfield/lenient.ts';
import { isInside } from './guard.ts';

/** Tetos por tarefa: poupam cota e cortam laços de ajuste. O Instagram aceita mais imagens num carrossel. */
export const RENDER_LIMITS = { images: 10, renders: 40 } as const;

/**
 * Origem falsa. Toda requisição da página passa pelo roteador, que só entrega arquivos da pasta da tarefa
 * e as fontes do plugin. Nada sai da máquina, e um HTML não consegue mandar dados para fora.
 */
const ORIGIN = 'https://render.shack';
const TASK_FOLDERS = ['input', 'work', 'out'];
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export type RenderInput = { file: string; name: string; format: DesignFormat };
/** O que a ferramenta gravou. O servidor confere o hash no fim: a prova de que o PNG saiu do render. */
export type RenderRecord = { name: string; format: DesignFormat; width: number; height: number; bytes: number; sha256: string };
export type RenderOutcome = RenderRecord & {
  /** Prévia em JPEG para o modelo conferir: mesmo tamanho, menos bytes no pedido. */
  preview: Buffer;
  blocked: string[];
  overflow: { width: number; height: number } | null;
};
export type RendererInit = { browserPath: string; taskDir: string; fontsDir: string };
/** O que o runner usa do render. Os testes do runner trocam por um falso. */
export interface RenderEngine {
  readonly records: Map<string, RenderRecord>;
  render(input: RenderInput): Promise<RenderOutcome>;
  close(): Promise<void>;
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Um navegador por tarefa, aberto no primeiro render e fechado no fim, inclusive em caso de falha. */
export class Renderer implements RenderEngine {
  readonly records = new Map<string, RenderRecord>();
  #o: RendererInit;
  #browser: Promise<Browser> | null = null;
  #renders = 0;

  constructor(o: RendererInit) {
    this.#o = o;
  }

  async render(input: RenderInput): Promise<RenderOutcome> {
    if (this.#renders >= RENDER_LIMITS.renders) throw new Error(`Teto de ${RENDER_LIMITS.renders} renders por tarefa atingido. Entregue o que já tem.`);
    if (!this.records.has(input.name) && this.records.size >= RENDER_LIMITS.images) {
      throw new Error(`Teto de ${RENDER_LIMITS.images} imagens por tarefa. Refaça uma das que já existem: ${[...this.records.keys()].join(', ')}.`);
    }
    // Conta a chamada, mesmo a que falha: o teto existe contra laços de ajuste.
    this.#renders++;
    const html = this.#htmlPath(input.file);
    const size = DESIGN_SIZES[input.format];
    const browser = await this.#launch();
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false });
    const blocked: string[] = [];
    try {
      await context.route('**/*', (route) => this.#serve(route, blocked));
      const page = await context.newPage();
      const path = relative(this.#o.taskDir, html).split(sep).map(encodeURIComponent).join('/');
      await page.goto(`${ORIGIN}/${path}`, { waitUntil: 'load', timeout: 20_000 });
      // O evaluate do Playwright roda mesmo com o JavaScript da página desligado.
      await page.evaluate('document.fonts.ready.then(() => true)').catch(() => undefined);
      const scroll = await page.evaluate('[document.documentElement.scrollWidth, document.documentElement.scrollHeight]').catch(() => null) as number[] | null;
      const png = await page.screenshot({ type: 'png', timeout: 20_000 });
      const preview = await page.screenshot({ type: 'jpeg', quality: 85, timeout: 20_000 });
      const out = join(this.#o.taskDir, 'out');
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${input.name}.png`), png);
      const record: RenderRecord = { name: input.name, format: input.format, ...size, bytes: png.length, sha256: sha256(png) };
      this.records.set(input.name, record);
      const over = scroll && (scroll[0]! > size.width || scroll[1]! > size.height) ? { width: scroll[0]!, height: scroll[1]! } : null;
      return { ...record, preview, blocked, overflow: over };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    const pending = this.#browser;
    this.#browser = null;
    const browser = await pending?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  /** Aceita "work/post.html", "post.html" e caminho absoluto, desde que o arquivo fique em work/. */
  #htmlPath(file: string): string {
    const work = join(this.#o.taskDir, 'work');
    const rel = file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const abs = isAbsolute(rel) ? resolve(rel) : resolve(this.#o.taskDir, rel.startsWith('work/') ? rel : join('work', rel));
    if (!isInside(work, abs)) throw new Error(`O HTML precisa ficar em work/, e "${file}" fica fora.`);
    if (!/\.html?$/i.test(abs)) throw new Error(`"${file}" não é um arquivo .html.`);
    if (!existsSync(abs)) throw new Error(`Não achei "${file}" em work/. Escreva o HTML antes de chamar a render.`);
    return abs;
  }

  #launch(): Promise<Browser> {
    this.#browser ??= chromium.launch({
      executablePath: this.#o.browserPath, headless: true, timeout: 30_000,
      // Nenhum nome de domínio resolve: nem um prefetch de DNS sai da máquina.
      args: ['--host-resolver-rules=MAP * ~NOTFOUND'],
    }).catch((err: unknown) => {
      this.#browser = null;
      throw new Error(`Não consegui abrir o navegador (${this.#o.browserPath}): ${errorMessage(err)}`);
    });
    return this.#browser;
  }

  async #serve(route: Route, blocked: string[]): Promise<void> {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      if (blocked.length < 5) blocked.push(url.href.slice(0, 120));
      return route.abort('blockedbyclient');
    }
    let file: string | null = null;
    try {
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith('/fonts/')) {
        const f = resolve(this.#o.fontsDir, path.slice(7));
        if (isInside(this.#o.fontsDir, f)) file = f;
      } else {
        const f = resolve(this.#o.taskDir, path.slice(1));
        if (TASK_FOLDERS.some((d) => isInside(join(this.#o.taskDir, d), f))) file = f;
      }
    } catch { /* endereço malformado */ }
    if (!file || !existsSync(file) || !statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  }
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A ferramenta MCP que o modelo chama. Devolve o resumo e a prévia da imagem, para ele conferir sem outra volta. */
export function renderTool(engine: RenderEngine, progress: (message: string) => void) {
  return tool(
    'render',
    'Transforma um HTML de work/ numa imagem PNG em out/<name>.png, no tamanho exato do formato, e devolve a imagem para você conferir. '
      + 'JavaScript desligado e rede bloqueada: use só arquivos de work/ e input/ e as fontes em /fonts/.',
    {
      file: text(300, 1).describe('O HTML em work/, como "work/01.html".'),
      name: imageName().describe('O nome da imagem, na ordem do carrossel: "01", "02"…'),
      format: designFormat().default('feed').describe('feed (1080×1350, post e carrossel), square (1080×1080) ou story (1080×1920, story e capa de Reels).'),
    },
    async (args) => {
      try {
        progress(`Desenhando ${args.name} (${args.format})`);
        const r = await engine.render(args);
        const lines = [`Salvei out/${r.name}.png: ${r.width}×${r.height} (${r.format}), ${kb(r.bytes)}.`];
        if (r.overflow) lines.push(`Atenção: o conteúdo mede ${r.overflow.width}×${r.overflow.height} e passa da borda. O que passou foi cortado.`);
        if (r.blocked.length) lines.push(`Bloqueei pedidos para fora: ${r.blocked.join(', ')}. Use só arquivos de work/ e input/ e as fontes em /fonts/.`);
        return {
          content: [
            { type: 'text' as const, text: lines.join('\n') },
            { type: 'image' as const, data: r.preview.toString('base64'), mimeType: 'image/jpeg' },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Erro: ${errorMessage(err)} Nenhuma imagem foi salva.` }], isError: true };
      }
    },
  );
}
