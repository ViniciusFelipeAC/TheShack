import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DESIGN_SIZES, type DesignFormat, runnerOf, type Task } from '@shack/shared';
import { captionProblems, checkImages, pngSize } from '../src/agents/design-check.ts';
import { DesignRunner, type DesignRunnerOptions, NO_BROWSER } from '../src/agents/design-runner.ts';
import { checkRoots } from '../src/agents/guard.ts';
import { type RenderEngine, type RenderInput, type RenderRecord, sha256 } from '../src/agents/render.ts';
import { ROOT } from '../src/config.ts';
import type { RunIO } from '../src/core/task-bus.ts';
import { tasksRepo } from '../src/db/repos.ts';
import { z } from 'zod';
import { Account } from '../src/renfield/account.ts';
import { renfieldTools } from '../src/renfield/tools.ts';
import { setup, waitFor } from './helpers.ts';

type S = ReturnType<typeof setup>;
const PLUGIN = join(ROOT, 'plugins', 'shack');
// Um navegador "existente" para o registro: os testes daqui não abrem navegador nenhum.
const ANY_FILE = process.execPath;

const PAINTER = `id: pintor
name: Pintor
role: Imagens de teste
model: sonnet
runner: design
skills: [canvas-design, theme-factory]
workspace: optional
limits: { concurrency: 1, maxTurns: 80 }
`;

function addAgent(s: S, id: string, yaml: string) {
  mkdirSync(join(s.agentsDir, id), { recursive: true });
  writeFileSync(join(s.agentsDir, id, 'agent.yaml'), yaml);
  s.shack.registry.load();
  return s.shack.registry.get(id)!;
}

/** PNG mínimo: assinatura e cabeçalho IHDR. A conferência só lê o cabeçalho. */
function fakePng(width: number, height: number): Buffer {
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), u32(13), Buffer.from('IHDR'), u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0]), u32(0)]);
}

/** Render falso: grava um PNG do tamanho do formato, como a ferramenta de verdade. */
class FakeEngine implements RenderEngine {
  readonly records = new Map<string, RenderRecord>();
  closed = false;
  readonly dir: string;
  constructor(dir: string) { this.dir = dir; }
  async render({ name, format }: RenderInput) {
    const png = fakePng(DESIGN_SIZES[format].width, DESIGN_SIZES[format].height);
    writeFileSync(join(this.dir, 'out', `${name}.png`), png);
    const record = { name, format, ...DESIGN_SIZES[format], bytes: png.length, sha256: sha256(png) };
    this.records.set(name, record);
    return { ...record, preview: png, blocked: [], overflow: null };
  }
  async close() { this.closed = true; }
}

const LOADED = { plugins_applied: true, commands: [{ name: 'shack:canvas-design' }, { name: 'shack:theme-factory' }] };

function fakeQuery(structured: unknown, act?: (opts: Record<string, any>) => Promise<void> | void, init: unknown = LOADED) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const seen: { options: Record<string, any>; prompt: string } = { options: {}, prompt: '' }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const query = ((args: { prompt: AsyncIterable<{ message: { content: string } }>; options: Record<string, unknown> }) => {
    seen.options = args.options;
    const gen = (async function* () {
      for await (const m of args.prompt) { seen.prompt = m.message.content; break; }
      yield { type: 'system', subtype: 'init', session_id: 'sessao-1' };
      await act?.(seen.options);
      yield { type: 'result', subtype: 'success', structured_output: structured, result: 'texto', modelUsage: { opus: { inputTokens: 10, outputTokens: 5 } } };
    })();
    return Object.assign(gen, {
      accountInfo: async () => ({ subscriptionType: 'pro', tokenSource: 'claude.ai' }),
      supportedModels: async () => [{ value: 'sonnet', displayName: 'Sonnet', description: '' }],
      initializationResult: async () => init,
      setModel: async () => {},
      close: () => {},
    });
  }) as unknown as DesignRunnerOptions['query'];
  return { query, seen };
}

function designRunner(s: S, query: DesignRunnerOptions['query']) {
  const engines: FakeEngine[] = [];
  const runner = new DesignRunner({
    account: new Account(s.shack.bus), workspaces: s.shack.workspaces, tasks: tasksRepo(s.shack.db), fallbackModel: 'sonnet',
    designDir: join(s.dir, 'design'), pluginDir: PLUGIN, browserPath: ANY_FILE, query,
    renderer: (init) => { const e = new FakeEngine(init.taskDir); engines.push(e); return e; },
  });
  return { runner, engines };
}

const io = (answers: string[] = []): RunIO & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked, signal: new AbortController().signal, progress: () => {}, update: () => {}, previousHandoff: null,
    ask: async (req) => { asked.push(req.summary); return { decision: 'approve', answer: answers.shift() }; },
  };
};

const task = (s: S, over: Partial<Task> = {}): Task => ({
  id: 'tarefa-1', title: 'Carrossel do projeto', prompt: 'Faça dois posts sobre o projeto.', assignee: 'pintor', origin: { kind: 'user' },
  status: 'running', priority: 'normal', workspaceId: s.ws.id, parentId: null, reviewOf: null, sessionId: null, model: null,
  result: null, error: null, usage: null, handoff: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, ...over,
});

test('manifesto: runner design com skills funciona; skill que falta, skill fora do design e falta de navegador desativam', (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  const ok = addAgent(s, 'pintor', PAINTER);
  assert.equal(ok.error, null);
  assert.equal(runnerOf(ok.manifest!), 'design');
  assert.deepEqual(ok.manifest!.skills, ['canvas-design', 'theme-factory']);
  assert.match(addAgent(s, 'sem-skill', PAINTER.replace(/pintor/, 'sem-skill').replace('theme-factory', 'nao-existe')).error!, /Skill não encontrada.*nao-existe/);
  assert.match(addAgent(s, 'codigo', 'id: codigo\nname: C\nrole: R\nmodel: sonnet\ntools: { builtin: [Read] }\nskills: [canvas-design]\n').error!, /Só o runner design/);
  // O etnaD não muda.
  const etnad = s.shack.registry.get('etnad')!;
  assert.equal(etnad.error, null);
  assert.equal(runnerOf(etnad.manifest!), 'code');
  assert.deepEqual(etnad.manifest!.skills, []);

  const none = setup({ browserPath: null });
  t.after(none.cleanup);
  assert.equal(addAgent(none, 'pintor', PAINTER).error, NO_BROWSER);
});

test('guarda: escreve só em work/; lê a tarefa, o plugin e o projeto, sem escrever nele', () => {
  const dir = join(ROOT, 'data', 'design', 't1');
  const project = join(ROOT, 'apps');
  const r = { cwd: dir, read: [dir, PLUGIN, project], write: [join(dir, 'work')] };
  assert.equal(checkRoots(r, 'Write', { file_path: 'work/post.html' }), null);
  assert.match(checkRoots(r, 'Write', { file_path: 'out/01.png' })!, /Escreva só em/);
  assert.match(checkRoots(r, 'Edit', { file_path: join(project, 'web', 'x.ts') })!, /Escreva só em/);
  assert.equal(checkRoots(r, 'Read', { file_path: join(project, 'server', 'package.json') }), null);
  assert.equal(checkRoots(r, 'Read', { file_path: join(PLUGIN, 'skills', 'theme-factory', 'themes', 'arctic-frost.md') }), null);
  assert.equal(checkRoots(r, 'Glob', { pattern: 'input/*' }), null);
  assert.match(checkRoots(r, 'Read', { file_path: join(ROOT, '.env') })!, /fora das pastas/);
  assert.match(checkRoots(r, 'Glob', { pattern: 'C:/Users/**/*.env' })!, /fora das pastas/);
  assert.match(checkRoots(r, 'Glob', { pattern: '../../**' })!, /fora das pastas/);
  assert.match(checkRoots(r, 'Grep', { pattern: 'x', path: '..' })!, /fora das pastas/);
});

test('conferência: imagem que falta, tamanho errado, carrossel misturado, arquivo trocado e legenda longa', () => {
  const s = setup();
  try {
    const out = join(s.dir, 'out');
    mkdirSync(out);
    const records = new Map<string, RenderRecord>();
    const put = (name: string, format: DesignFormat, size = DESIGN_SIZES[format]) => {
      const png = fakePng(size.width, size.height);
      writeFileSync(join(out, `${name}.png`), png);
      records.set(name, { name, format, ...size, bytes: png.length, sha256: sha256(png) });
    };
    put('01', 'feed');
    put('02', 'feed');
    const ok = checkImages(out, [{ name: '01', alt: 'a' }, { name: '2.png', alt: 'b' }], records, 'Legenda #um');
    assert.equal(ok.verification.status, 'ok', ok.verification.reason);
    assert.deepEqual(ok.images.map((i) => [i.name, i.format, i.width, i.height]), [['01', 'feed', 1080, 1350], ['02', 'feed', 1080, 1350]]);

    assert.match(checkImages(out, [{ name: '01' }, { name: '03' }], records).verification.reason, /03\.png não existe/);
    assert.match(checkImages(out, [], records).verification.reason, /não lista nenhuma imagem/);
    put('03', 'story');
    assert.match(checkImages(out, [{ name: '01' }, { name: '03' }], records).verification.reason, /mistura formatos \(feed e story\)/);
    put('04', 'feed', { width: 1000, height: 1000 });
    assert.match(checkImages(out, [{ name: '04' }], records).verification.reason, /1000×1000, que não é feed/);
    // Mesmo tamanho no cabeçalho, outro conteúdo: o hash não bate com o do render.
    writeFileSync(join(out, '01.png'), fakePng(1080, 1350).subarray(0, 30));
    assert.match(checkImages(out, [{ name: '01' }], records).verification.reason, /mudou depois do render/);
    writeFileSync(join(out, '05.png'), fakePng(1080, 1080));
    assert.match(checkImages(out, [{ name: '05' }], records).verification.reason, /não saiu da ferramenta de render/);
    for (const r of [ok, checkImages(out, [{ name: '03' }], records)]) assert.ok(r.verification.files.every((f) => f.startsWith('out/')));

    assert.deepEqual(captionProblems('curta #a #b'), []);
    assert.match(captionProblems('x'.repeat(2201))[0]!, /2201 caracteres/);
    assert.match(captionProblems(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' '))[0]!, /31 hashtags/);
    assert.equal(pngSize(Buffer.from('não é png')), null);
  } finally { s.cleanup(); }
});

test('DesignRunner: o relatório vira images e output, e só o servidor escreve a conferência', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  const agent = addAgent(s, 'pintor', PAINTER);
  let engine: FakeEngine | null = null;
  const { query, seen } = fakeQuery({
    summary: 'Dois posts sobre o projeto.',
    images: [{ name: '01', alt: 'A capa' }, { name: '2.png', alt: 'O detalhe' }],
    output: '  Legenda pronta. #shack  ',
    direction: { fonts: ['Work Sans'], palette: ['#123456'], layout: 'grade' },
    verification: { status: 'ok', reason: 'eu juro', diffstat: null, files: [] },
  }, async () => {
    await engine!.render({ file: 'work/a.html', name: '01', format: 'feed' });
    await engine!.render({ file: 'work/b.html', name: '02', format: 'feed' });
  });
  const { runner, engines } = designRunner(s, query);
  // Sobra de uma tentativa anterior: some antes de começar.
  const old = join(s.dir, 'design', 'tarefa-1', 'out');
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, '09.png'), fakePng(1080, 1350));
  const run = runner.run(task(s), agent, io());
  engine = await waitFor(() => engines[0], 'o render da tarefa');
  const result = await run;

  assert.deepEqual(result.images!.map((i) => [i.name, i.alt, i.format]), [['01', 'A capa', 'feed'], ['02', 'O detalhe', 'feed']]);
  assert.equal(result.output, 'Legenda pronta. #shack');
  assert.deepEqual(result.direction?.fonts, ['Work Sans']);
  assert.equal(result.verification!.status, 'ok');
  assert.notEqual(result.verification!.reason, 'eu juro');
  assert.equal(existsSync(join(old, '09.png')), false);
  assert.equal(engine!.closed, true);

  // Sem shell, sem nada de fora, com as skills do manifesto e a pasta da tarefa como cwd.
  const o = seen.options;
  assert.equal(o.cwd, join(s.dir, 'design', 'tarefa-1'));
  assert.ok(!o.tools.includes('Bash') && !o.tools.includes('PowerShell'));
  assert.ok(o.tools.includes('Skill'));
  assert.equal(o.strictMcpConfig, true);
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.settings.disableClaudeAiConnectors, true);
  assert.deepEqual(o.skills, ['shack:canvas-design', 'shack:theme-factory']);
  assert.equal(o.plugins[0].path, PLUGIN);
  assert.match(o.systemPrompt, /Escreva só em work\//);
  assert.match(seen.prompt, /Não há anexos/);
  assert.match(seen.prompt, /abra com a ferramenta Skill: shack:canvas-design, shack:theme-factory/);
  assert.match(seen.prompt, /Projeto: projeto/);
});

test('DesignRunner: imagem que não saiu do render deixa a tarefa suspeita', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  const agent = addAgent(s, 'pintor', PAINTER);
  const { query } = fakeQuery({ summary: 'Pronto.', images: [{ name: '01', alt: 'x' }], output: 'Legenda' });
  const result = await designRunner(s, query).runner.run(task(s), agent, io());
  assert.equal(result.verification!.status, 'suspect');
  assert.match(result.verification!.reason, /01\.png não existe/);
  assert.deepEqual(result.images, []);
});

test('DesignRunner: plugin que não carregou falha antes do modelo, e a pergunta vira aprovação', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  const agent = addAgent(s, 'pintor', PAINTER);
  const broken = fakeQuery({}, undefined, { plugins_applied: false, commands: [] });
  const b = designRunner(s, broken.query);
  await assert.rejects(b.runner.run(task(s), agent, io()), /plugin de skills não carregou/);
  assert.equal(broken.seen.prompt, '');
  assert.equal(b.engines[0]!.closed, true);

  let denied: unknown;
  const asking = fakeQuery({ summary: 'x', images: [] }, async (o) => {
    const signal = new AbortController().signal;
    await o.canUseTool('AskUserQuestion', { questions: [{ question: 'Qual formato?', options: [{ label: 'feed' }] }] }, { signal });
    denied = await o.canUseTool('Bash', { command: 'ls' }, { signal });
  });
  const answers = io(['feed']);
  await designRunner(s, asking.query).runner.run(task(s, { id: 'tarefa-2' }), agent, answers);
  assert.deepEqual(answers.asked, ['Qual formato?']);
  assert.equal((denied as { behavior: string }).behavior, 'deny');
});

test('Ajustar e correção partem do trabalho anterior: work/, fotos e imagens conferidas', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  const agent = addAgent(s, 'pintor', PAINTER);
  const repo = tasksRepo(s.shack.db);
  // A tarefa original, concluída, com duas imagens conferidas.
  const first = s.shack.tasks.create({ assignee: 'pintor', title: 'Carrossel', prompt: 'Dois posts.', priority: 'normal' }, { kind: 'user' });
  await waitFor(() => s.shack.tasks.get(first.id).status === 'done', 'a tarefa simulada terminar');
  const from = join(s.dir, 'design', first.id);
  for (const d of ['work', 'input', 'out']) mkdirSync(join(from, d), { recursive: true });
  writeFileSync(join(from, 'work', '01.html'), '<p>um</p>');
  writeFileSync(join(from, 'input', 'foto.jpg'), 'foto');
  const png = fakePng(1080, 1350);
  for (const n of ['01', '02']) writeFileSync(join(from, 'out', `${n}.png`), png);
  const img = (name: string) => ({ name, format: 'feed' as const, width: 1080, height: 1350, bytes: png.length, alt: name });
  repo.update(first.id, { result: { summary: 'x', changes: [], howToTest: '', images: [img('01'), img('02')] } });

  // O ajuste refaz só a 02 e lista as duas: a 01 veio da original e passa na conferência.
  let engine: FakeEngine | null = null;
  const { query, seen } = fakeQuery({ summary: 'Ajustada.', images: [{ name: '01', alt: 'a' }, { name: '02', alt: 'b' }], output: 'Legenda' }, async () => {
    await engine!.render({ file: 'work/02.html', name: '02', format: 'feed' });
  });
  const { runner, engines } = designRunner(s, query);
  const child = task(s, { id: 'ajuste-1', parentId: first.id, prompt: 'Troque o título da segunda.' });
  const run = runner.run(child, agent, io());
  engine = await waitFor(() => engines[0], 'o render do ajuste');
  const result = await run;
  const dir = join(s.dir, 'design', 'ajuste-1');
  assert.equal(readFileSync(join(dir, 'work', '01.html'), 'utf8'), '<p>um</p>');
  assert.ok(existsSync(join(dir, 'input', 'foto.jpg')));
  assert.match(seen.prompt, /Esta tarefa ajusta "Carrossel".*imagens: 01, 02/s);
  assert.match(seen.prompt, /foto\.jpg/);
  assert.equal(result.verification!.status, 'ok', result.verification!.reason);
  assert.deepEqual(result.images!.map((i) => i.name), ['01', '02']);

  // A correção da Mina é filha da conferência, que confere a original: parte da original também.
  const review = s.shack.tasks.create({ assignee: 'mina', title: 'Conferir', prompt: 'Confira.', priority: 'normal', reviewOf: first.id }, { kind: 'user' });
  const fix = fakeQuery({ summary: 'Corrigida.', images: [{ name: '01', alt: 'a' }], output: 'Legenda' });
  const fixed = await designRunner(s, fix.query).runner.run(task(s, { id: 'correcao-1', parentId: review.id }), agent, io());
  assert.match(fix.seen.prompt, /Esta tarefa ajusta "Carrossel"/);
  assert.equal(fixed.verification!.status, 'ok', fixed.verification!.reason);
});

test('Renfield: attach_files leva as fotos da mensagem para a tarefa do Harker', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  addAgent(s, 'pintor', PAINTER);
  const photo = s.shack.attachments.save({ name: 'praia.jpg', mime: 'image/png', bytes: fakePng(10, 10), deviceId: null });
  let recent = [photo];
  const tools = renfieldTools({ tasks: s.shack.tasks, registry: s.shack.registry, mind: s.shack.mind, workspaces: s.shack.workspaces, recentAttachments: () => recent });
  const create = tools.find((x) => x.name === 'tasks_create')!;
  const call = async (args: Record<string, unknown>) => create.run(z.object(create.shape).parse(args), { conversationId: 'main' });

  const made = JSON.parse(await call({ assignee: 'pintor', title: 'Post', prompt: 'Um post com a foto.', attach_files: 'sim' }));
  assert.deepEqual(made.attached, ['praia.jpg']);
  assert.ok(existsSync(join(s.dir, 'design', made.created.id, 'input', 'praia.jpg')));
  // Para o etnaD, anexo não vale; sem anexo recente, nada é criado.
  await assert.rejects(async () => call({ assignee: 'etnad', title: 'X', prompt: 'Y', workspace: 'projeto', attach_files: true }), /não recebe anexos/);
  recent = [];
  assert.match(await call({ assignee: 'pintor', title: 'Post', prompt: 'Outro.', attach_files: true }), /não achei anexos.*Nada foi criado/);
});

test('tarefa com anexos: os arquivos vão para input/; só o runner design recebe', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  addAgent(s, 'pintor', PAINTER);
  const upload = async (name: string) => {
    const res = await s.app.request(`/api/v1/attachments?name=${name}`, { method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'image/png' }, body: new Uint8Array(fakePng(10, 10)) });
    return (await res.json() as { id: string }).id;
  };
  const a = await upload('foto.png');
  const b = await upload('foto.png');

  const created = await s.call('POST', '/tasks', { assignee: 'pintor', title: 'Post', prompt: 'Um post com as fotos.', attachmentIds: [a, b] });
  assert.equal(created.status, 201);
  const input = join(s.dir, 'design', created.body.id, 'input');
  assert.ok(existsSync(join(input, 'foto.png')) && existsSync(join(input, 'foto-2.png')));

  const before = (await s.call('GET', '/tasks')).body.items.length;
  const etnad = await s.call('POST', '/tasks', { assignee: 'etnad', title: 'X', prompt: 'Y', workspaceId: s.ws.id, attachmentIds: [a] });
  assert.equal(etnad.status, 400);
  assert.match(etnad.body.error.message, /não recebe anexos/);
  const missing = await s.call('POST', '/tasks', { assignee: 'pintor', title: 'X', prompt: 'Y', attachmentIds: ['nao-existe'] });
  assert.equal(missing.status, 400);
  assert.equal((await s.call('GET', '/tasks')).body.items.length, before);
});

test('rota das imagens: exige token, o nome precisa estar na lista e não há caminho livre', async (t) => {
  const s = setup({ browserPath: ANY_FILE });
  t.after(s.cleanup);
  addAgent(s, 'pintor', PAINTER);
  const created = await s.call('POST', '/tasks', { assignee: 'pintor', title: 'Post', prompt: 'Um post.' });
  const id = created.body.id as string;
  await waitFor(() => s.shack.tasks.get(id).status === 'done', 'a tarefa simulada terminar');
  const png = fakePng(1080, 1350);
  mkdirSync(join(s.dir, 'design', id, 'out'), { recursive: true });
  writeFileSync(join(s.dir, 'design', id, 'out', '01.png'), png);
  writeFileSync(join(s.dir, 'design', id, 'out', '02.png'), png);
  tasksRepo(s.shack.db).update(id, { result: { summary: 'x', changes: [], howToTest: '', images: [{ name: '01', format: 'feed', width: 1080, height: 1350, bytes: png.length, alt: 'a' }] } });

  const get = (name: string, token: string | null = s.token) => s.app.request(`/api/v1/tasks/${id}/images/${name}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const ok = await get('01');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), png);
  assert.equal((await get('01', null)).status, 401);
  assert.equal((await get('02')).status, 404, 'existe em disco, mas não está na lista');
  assert.equal((await get('..%2F..%2Fshack.db')).status, 400);
  assert.equal((await s.app.request(`/api/v1/tasks/nao-existe/images/01`, { headers: { authorization: `Bearer ${s.token}` } })).status, 404);
  assert.ok(readFileSync(join(s.dir, 'design', id, 'out', '01.png')).equals(png));
});
