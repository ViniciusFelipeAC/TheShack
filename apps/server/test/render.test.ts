import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pngSize } from '../src/agents/design-check.ts';
import { RENDER_LIMITS, Renderer } from '../src/agents/render.ts';
import { ROOT } from '../src/config.ts';
import { designFormat, imageName } from '../src/renfield/lenient.ts';
import { findBrowser } from '../src/system/browser.ts';

const BROWSER = findBrowser();
// Sem navegador na máquina, os testes com o navegador de verdade pulam, com o motivo à vista.
const real = BROWSER ? {} : { skip: 'sem navegador (Edge, Chrome ou Chromium): os testes de render não rodam' };
const FONTS = join(ROOT, 'plugins', 'shack', 'skills', 'canvas-design', 'canvas-fonts');
const PAGE = (body: string, style = '') => `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#123;color:#fde}${style}</style><body>${body}`;

function taskDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shack-render-'));
  for (const d of ['input', 'work', 'out']) mkdirSync(join(dir, d));
  return dir;
}

function renderer(t: { after(fn: () => Promise<void>): void }, browserPath = BROWSER ?? 'nenhum') {
  const dir = taskDir();
  const r = new Renderer({ browserPath, taskDir: dir, fontsDir: FONTS });
  t.after(async () => { await r.close(); rmSync(dir, { recursive: true, force: true }); });
  const page = (name: string, html: string) => writeFileSync(join(dir, 'work', name), html);
  return { r, dir, page };
}

test('render: os três formatos saem no tamanho exato, com a fonte do plugin', real, async (t) => {
  const { r, dir, page } = renderer(t);
  const font = "@font-face{font-family:P;src:url('/fonts/Silkscreen-Regular.ttf')}";
  page('post.html', PAGE('<p>Ação</p>', `${font}body{font:96px P}`));
  for (const [format, width, height] of [['feed', 1080, 1350], ['square', 1080, 1080], ['story', 1080, 1920]] as const) {
    const out = await r.render({ file: 'work/post.html', name: format, format });
    assert.deepEqual(pngSize(readFileSync(join(dir, 'out', `${format}.png`))), { width, height });
    assert.equal(out.overflow, null);
    assert.ok(out.preview.length > 0);
  }
  // A fonte entrou: o mesmo texto sem o @font-face sai diferente.
  page('sem.html', PAGE('<p>Ação</p>', 'body{font:96px P}'));
  await r.render({ file: 'sem.html', name: 'sem', format: 'feed' });
  assert.notEqual(r.records.get('feed')!.sha256, r.records.get('sem')!.sha256);
});

test('render: a rede fica bloqueada e o JavaScript desligado', real, async (t) => {
  let hits = 0;
  const server = createServer((_req, res) => { hits++; res.end('x'); });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise<void>((ok) => server.close(() => ok())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { r, page } = renderer(t);

  page('fora.html', PAGE(`<img src="${base}/a.png"><link rel="stylesheet" href="${base}/b.css"><div style="width:9px;height:9px;background:url(${base}/c.png)"></div>`));
  const out = await r.render({ file: 'fora.html', name: '01', format: 'square' });
  assert.equal(hits, 0, 'nenhuma requisição pode sair do navegador');
  assert.ok(out.blocked.some((u) => u.startsWith(base)));

  page('js.html', PAGE("<script>document.body.style.background='#f00'</script>"));
  page('nojs.html', PAGE(''));
  await r.render({ file: 'js.html', name: 'js', format: 'square' });
  await r.render({ file: 'nojs.html', name: 'nojs', format: 'square' });
  assert.equal(r.records.get('js')!.sha256, r.records.get('nojs')!.sha256, 'o script não pode rodar');
});

test('render: só abre arquivos da tarefa (input/, work/ e out/) e as fontes', real, async (t) => {
  const { r, dir, page } = renderer(t);
  page('vermelho.html', PAGE('', 'body{background:#f00}'));
  await r.render({ file: 'vermelho.html', name: 'vermelho', format: 'square' });
  // A mesma imagem dentro de input/ e na raiz da tarefa, fora das pastas permitidas.
  copyFileSync(join(dir, 'out', 'vermelho.png'), join(dir, 'input', 'ok.png'));
  copyFileSync(join(dir, 'out', 'vermelho.png'), join(dir, 'segredo.png'));
  const box = (url: string) => PAGE(`<div style="width:1080px;height:1080px;background:url(${url})"></div>`);
  page('vazio.html', PAGE(''));
  page('permitido.html', box('/input/ok.png'));
  page('proibido.html', box('/segredo.png'));
  for (const name of ['vazio', 'permitido', 'proibido']) await r.render({ file: `${name}.html`, name, format: 'square' });
  const hash = (n: string) => r.records.get(n)!.sha256;
  assert.notEqual(hash('permitido'), hash('vazio'));
  assert.equal(hash('proibido'), hash('vazio'));

  // O HTML precisa estar em work/.
  writeFileSync(join(dir, 'out', 'fora.html'), PAGE(''));
  await assert.rejects(r.render({ file: join(dir, 'out', 'fora.html'), name: 'x', format: 'feed' }), /precisa ficar em work\//);
  await assert.rejects(r.render({ file: '../out/fora.html', name: 'x', format: 'feed' }), /precisa ficar em work\//);
  await assert.rejects(r.render({ file: 'leia.txt', name: 'x', format: 'feed' }), /não é um arquivo \.html/);
});

test('render: tetos de imagens e de chamadas, sem abrir o navegador', async (t) => {
  const a = renderer(t);
  for (let i = 0; i < RENDER_LIMITS.images; i++) {
    a.r.records.set(`i${i}`, { name: `i${i}`, format: 'feed', width: 1080, height: 1350, bytes: 1, sha256: 'x' });
  }
  await assert.rejects(a.r.render({ file: 'x.html', name: 'nova', format: 'feed' }), /Teto de 10 imagens/);

  // Cada chamada conta, mesmo a que falha.
  const b = renderer(t);
  for (let i = 0; i < RENDER_LIMITS.renders; i++) await assert.rejects(b.r.render({ file: 'falta.html', name: '01', format: 'feed' }), /Não achei/);
  await assert.rejects(b.r.render({ file: 'falta.html', name: '01', format: 'feed' }), /Teto de 40 renders/);
});

test('render: valores próximos viram o formato e o nome certos', () => {
  const format = designFormat();
  assert.equal(format.parse('4:5'), 'feed');
  assert.equal(format.parse(' Retrato '), 'feed');
  assert.equal(format.parse('9:16'), 'story');
  assert.equal(format.parse('Reels'), 'story');
  assert.equal(format.parse('quadrado'), 'square');
  assert.throws(() => format.parse('panorama'));
  const name = imageName();
  assert.equal(name.parse(1), '01');
  assert.equal(name.parse('out/02.png'), '02');
  assert.equal(name.parse('Capa'), 'capa');
  assert.equal(name.parse('../x'), 'x');
  assert.throws(() => name.parse('..'));
  assert.throws(() => name.parse('a b'));
});
