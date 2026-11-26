import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Task, TaskResult } from '@shack/shared';
import { git, startBranch } from '../src/agents/git.ts';
import { originalRequest, prepareReviewSite } from '../src/agents/review.ts';
import { TextRunner, type TextRunnerOptions } from '../src/agents/text-runner.ts';
import { EXTERNAL_NOTICE } from '../src/core/external.ts';
import { startPointOf } from '../src/core/reviews.ts';
import type { RunIO } from '../src/core/task-bus.ts';
import { tasksRepo } from '../src/db/repos.ts';
import { Account } from '../src/renfield/account.ts';
import { setup, waitFor } from './helpers.ts';

const hasGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
type S = ReturnType<typeof setup>;

const done = (s: S, id: string) => waitFor(() => { const t = s.shack.tasks.get(id); return t.status === 'done' || t.status === 'failed' ? t : null; }, `tarefa ${id} terminar`);
const reviewsOf = (s: S, id: string) => tasksRepo(s.shack.db).reviewsOf(id);

/** Grava uma tarefa já concluída, como se o etnaD tivesse entregado. */
function seedDone(s: S, over: Partial<Task> & { result: TaskResult }): Task {
  const repo = tasksRepo(s.shack.db);
  const t: Task = {
    id: over.id ?? `t-${Math.random().toString(36).slice(2, 10)}`, title: 'Site do café', prompt: 'Faça um site sobre café.', assignee: 'etnad',
    origin: { kind: 'user' }, status: 'queued', priority: 'normal', workspaceId: s.ws.id, parentId: null, reviewOf: null,
    sessionId: null, model: null, error: null, usage: null, handoff: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
    ...over,
  };
  repo.insert({ ...t, status: 'queued' });
  return repo.update(t.id, { status: 'done', result: over.result, finishedAt: new Date().toISOString() });
}

/** Agent SDK falso: guarda as opções e o pedido, roda `act` no meio e devolve a saída estruturada. */
function fakeQuery(structured: unknown, act?: (opts: Record<string, any>) => Promise<void> | void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const seen: { options: Record<string, any>; prompt: string } = { options: {}, prompt: '' }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const query = ((args: { prompt: AsyncIterable<{ message: { content: string } }>; options: Record<string, unknown> }) => {
    seen.options = args.options;
    const gen = (async function* () {
      for await (const m of args.prompt) { seen.prompt = m.message.content; break; }
      yield { type: 'system', subtype: 'init', session_id: 'sessao-1' };
      await act?.(seen.options);
      yield { type: 'result', subtype: 'success', structured_output: structured, result: 'texto', modelUsage: { sonnet: { inputTokens: 10, outputTokens: 5 } } };
    })();
    return Object.assign(gen, {
      accountInfo: async () => ({ subscriptionType: 'pro', tokenSource: 'claude.ai' }),
      supportedModels: async () => [{ value: 'sonnet', displayName: 'Sonnet', description: '' }],
      setModel: async () => {},
      close: () => {},
    });
  }) as unknown as TextRunnerOptions['query'];
  return { query, seen };
}

function textRunner(s: S, query: TextRunnerOptions['query']) {
  return new TextRunner({
    account: new Account(s.shack.bus), workspaces: s.shack.workspaces, tasks: tasksRepo(s.shack.db), fallbackModel: 'sonnet',
    tmpDir: join(s.dir, 'tmp'), workDir: () => join(s.dir, 'work'),
    agentLabel: (id) => (id === 'mina' ? { name: 'Mina', article: 'a' } : { name: 'etnaD', article: 'o' }),
    isPromptAgent: (id) => id === 'mina', query,
  });
}

const io = (answers: string[] = []): RunIO & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked, signal: new AbortController().signal, progress: () => {}, update: () => {}, previousHandoff: null,
    ask: async (req) => { asked.push(req.summary); return { decision: 'approve', answer: answers.shift() }; },
  };
};

async function gitRepo(dir: string): Promise<void> {
  await git(dir, ['init', '-q', '-b', 'main']);
  await git(dir, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(dir, 'README.md'), 'oi\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['-c', 'user.name=Teste', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'inicial']);
}

/** Um branch com a entrega do etnaD, como o servidor deixa: commit no branch e volta para o main. */
async function delivery(dir: string, branch: string, file: string, content: string): Promise<string> {
  await git(dir, ['checkout', '-q', '-b', branch]);
  writeFileSync(join(dir, file), content);
  await git(dir, ['add', '-A']);
  await git(dir, ['-c', 'user.name=etnaD', '-c', 'user.email=e@e', 'commit', '-q', '-m', 'entrega']);
  const commit = await git(dir, ['rev-parse', '--short', 'HEAD']);
  await git(dir, ['checkout', '-q', 'main']);
  return commit;
}

test('a Mina lê a base de conhecimento da pasta dela; caminho fora da pasta e excesso a desativam', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const mina = s.shack.registry.get('mina')!;
  assert.equal(mina.error, null);
  assert.deepEqual(mina.knowledge.map((d) => d.name), ['knowledge/ai-look-signals.md', 'knowledge/receita-prompt-etnad.md']);
  assert.match(mina.knowledge[0]!.content, /Inter/);
  assert.equal(s.shack.registry.get('etnad')!.knowledge.length, 0, 'o etnaD não muda');

  const yaml = join(s.agentsDir, 'mina', 'agent.yaml');
  const original = readFileSync(yaml, 'utf8');
  writeFileSync(yaml, original.replace('knowledge: [knowledge/*.md]', 'knowledge: [../etnad/persona.md]'));
  s.shack.registry.load();
  assert.match(s.shack.registry.get('mina')!.error!, /dentro da pasta do agente/);

  writeFileSync(yaml, original);
  writeFileSync(join(s.agentsDir, 'mina', 'knowledge', 'grande.md'), 'x'.repeat(40_001));
  s.shack.registry.load();
  assert.match(s.shack.registry.get('mina')!.error!, /teto é 40\.000/);
  const info = (await s.call('GET', '/agents/mina')).body;
  assert.equal(info.status, 'disabled');
});

test('conferir: só tarefa concluída, só por um agente de texto', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const missing = await s.call('POST', '/tasks', { assignee: 'mina', title: 'Conferir', prompt: 'p', reviewOf: 'nao-existe' });
  assert.equal(missing.status, 400);
  const running = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Em curso', prompt: 'p' });
  const early = await s.call('POST', '/tasks', { assignee: 'mina', title: 'Conferir', prompt: 'p', reviewOf: running.body.id });
  assert.equal(early.status, 409);
  assert.match(early.body.error.message, /concluída/);
  const finished = seedDone(s, { result: { summary: 'ok', changes: [], howToTest: '' } });
  const wrong = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'x', prompt: 'p', reviewOf: finished.id });
  assert.equal(wrong.body.error.code, 'agent_cannot_review');
  assert.match(wrong.body.error.message, /^O etnaD não confere/);
});

test('o que nasce de um prompt da Mina volta sozinho para ela conferir, uma vez; a correção também volta', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const prompt = (await s.call('POST', '/tasks', { assignee: 'mina', title: 'Prompt: site do café', prompt: 'Um site sobre café.' })).body;
  const p = await done(s, prompt.id);
  assert.match(p.result!.output!, /Prompt simulado/);
  assert.deepEqual(p.result!.direction!.fonts, ['Fraunces', 'Work Sans']);
  assert.equal(reviewsOf(s, prompt.id).length, 0, 'o prompt dela não é conferido');

  const work = (await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Site do café', prompt: p.result!.output!, parentId: prompt.id })).body;
  await done(s, work.id);
  const review = await waitFor(() => reviewsOf(s, work.id)[0], 'conferência automática');
  assert.equal(review.assignee, 'mina');
  assert.equal(review.origin.agentId, 'etnad');
  const r = await done(s, review.id);
  assert.equal(r.result!.review!.verdict, 'issues');
  assert.equal(reviewsOf(s, work.id).length, 1, 'uma conferência só');
  // a cena sabe que a tarefa atual dela era uma conferência
  assert.equal(s.shack.tasks.agentInfo(s.shack.registry.get('mina')!).currentTaskKind, null);

  const fix = (await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Correção', prompt: r.result!.output!, parentId: review.id })).body;
  await done(s, fix.id);
  await waitFor(() => reviewsOf(s, fix.id)[0], 'a correção também é conferida');

  // sem prompt da Mina, ou com falha, não há conferência
  const plain = (await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Avulsa', prompt: 'p' })).body;
  const failed = (await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: s.ws.id, title: 'Quebra', prompt: 'falhar', parentId: prompt.id })).body;
  await done(s, plain.id);
  assert.equal((await done(s, failed.id)).status, 'failed');
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(reviewsOf(s, plain.id).length + reviewsOf(s, failed.id).length, 0);
  const notice = s.shack.chat.messages('current', 50).filter((m) => m.kind === 'task_notice').map((m) => m.text).join('\n');
  assert.match(notice, /A Mina concluiu "Conferir: Site do café"/);
  assert.match(notice, /Conferência: 1 pendência\(s\)/);
});

test('o agent.status diz quando a tarefa atual é uma conferência', async (t) => {
  const s = setup({ stepMs: 80 }); t.after(s.cleanup);
  const finished = seedDone(s, { result: { summary: 'ok', changes: [], howToTest: '' } });
  const review = (await s.call('POST', '/tasks', { assignee: 'mina', title: 'Conferir', prompt: 'Confira.', reviewOf: finished.id })).body;
  const info = await waitFor(() => { const i = s.shack.tasks.agentInfo(s.shack.registry.get('mina')!); return i.currentTaskId === review.id ? i : null; }, 'a Mina conferindo');
  assert.equal(info.currentTaskKind, 'review');
});

test('runner de texto: o prompt sai em output, com a base de conhecimento e as direções recentes no contexto', async (t) => {
  const s = setup(); t.after(s.cleanup);
  seedDone(s, { assignee: 'mina', result: { summary: 'antigo', changes: [], howToTest: '', direction: { fonts: ['Syne'], palette: ['#112233'], layout: '' } } });
  const { query, seen } = fakeQuery(
    { summary: 'Prompt de um site.', output: '  # Prompt\n\nFaça.  ', direction: { fonts: ['Bitter'], palette: ['#0a0a0a'] }, changes: [] },
    async (opts) => {
      const res = await opts.canUseTool('AskUserQuestion', { questions: [{ question: 'Qual o público?', options: [{ label: 'Jovem' }] }] }, {});
      assert.equal(res.behavior, 'allow');
      assert.equal((await opts.canUseTool('Write', { file_path: 'x' }, {})).behavior, 'deny', 'ela não escreve');
    },
  );
  const task = { ...seedDone(s, { assignee: 'mina', title: 'Prompt: café', prompt: 'Um site sobre café.', workspaceId: null, result: { summary: '', changes: [], howToTest: '' } }), status: 'running' as const };
  const runIO = io(['Jovem']);
  const result = await textRunner(s, query).run(task, s.shack.registry.get('mina')!, runIO);
  assert.equal(result.output, '# Prompt\n\nFaça.');
  assert.deepEqual(result.direction?.fonts, ['Bitter']);
  assert.equal(result.verification?.status, 'ok');
  assert.deepEqual(runIO.asked, ['Qual o público?'], 'a pergunta virou aprovação');
  assert.deepEqual(seen.options.tools, ['AskUserQuestion'], 'sem pasta, sem ferramenta de leitura');
  assert.deepEqual(seen.options.settingSources, []);
  assert.match(seen.options.systemPrompt, /## Base de conhecimento[\s\S]*knowledge\/ai-look-signals\.md/);
  assert.match(seen.prompt, /Syne/, 'a direção da última tarefa entra para não repetir');
});

test('runner de texto: mudança no relatório vira suspeita, e item pendente nunca vira "tudo certo"', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const reviewed = seedDone(s, { workspaceId: null, result: { summary: 'Fiz​ tudo.', changes: [], howToTest: '' } });
  const { query, seen } = fakeQuery({
    summary: 'Falta um item.', changes: [{ path: 'a.txt', what: 'mexi' }],
    review: { verdict: 'pass', items: [{ requirement: 'Título concreto', status: 'missing', evidence: 'index.html:3' }] },
    output: 'Troque o título.',
  });
  const task = { ...seedDone(s, { assignee: 'mina', title: 'Conferir', prompt: 'Confira se a entrega atende ao pedido.', reviewOf: reviewed.id, workspaceId: null, result: { summary: '', changes: [], howToTest: '' } }), status: 'running' as const };
  const result = await textRunner(s, query).run(task, s.shack.registry.get('mina')!, io());
  assert.equal(result.review?.verdict, 'issues');
  assert.equal(result.output, 'Troque o título.');
  assert.equal(result.verification?.status, 'suspect');
  assert.ok(seen.prompt.includes(EXTERNAL_NOTICE), 'o relatório do etnaD chega como conteúdo externo');
  assert.ok(seen.prompt.includes('Fiz tudo.') && !seen.prompt.includes('​'), 'sem caracteres invisíveis');
  assert.match(seen.prompt, /feita pelo etnaD/);
});

test('conferência: a Mina lê uma cópia do commit entregue, que some no fim, mesmo com falha', { skip: !hasGit && 'git não está no PATH' }, async (t) => {
  const s = setup(); t.after(s.cleanup);
  const dir = s.ws.path;
  await gitRepo(dir);
  const commit = await delivery(dir, 'etnad/site-cafe-abc123', 'site.html', '<h1>Café</h1>\n');
  const reviewed = seedDone(s, { result: { summary: 'Fiz o site.', changes: [{ path: 'site.html', what: 'novo' }], howToTest: '', verification: { status: 'ok', reason: 'Bate.', diffstat: '1 file', files: ['site.html'], branch: 'etnad/site-cafe-abc123', commit } } });
  const reviewTask = (id: string) => ({ ...seedDone(s, { id, assignee: 'mina', title: 'Conferir', prompt: 'Confira se a entrega atende ao pedido.', reviewOf: reviewed.id, workspaceId: null, result: { summary: '', changes: [], howToTest: '' } }), status: 'running' as const });
  const mina = s.shack.registry.get('mina')!;

  let cwd = '';
  const ok = fakeQuery({ summary: 'Tudo certo.', review: { verdict: 'pass', items: [{ requirement: 'Título', status: 'met', evidence: 'site.html:1' }] }, output: 'nada' }, (o) => {
    cwd = o.cwd;
    assert.equal(readFileSync(join(cwd, 'site.html'), 'utf8'), '<h1>Café</h1>\n', 'a cópia tem o que o etnaD entregou');
    assert.deepEqual(o.tools, ['Read', 'Glob', 'Grep', 'AskUserQuestion']);
  });
  const result = await textRunner(s, ok.query).run(reviewTask('rev-ok-0001'), mina, io());
  assert.equal(result.verification?.status, 'ok');
  assert.equal(result.output, undefined, 'sem pendência, sem prompt de correção');
  assert.ok(cwd.startsWith(join(s.dir, 'tmp')));
  assert.equal(existsSync(cwd), false, 'a cópia sumiu');
  assert.equal(existsSync(join(dir, 'site.html')), false, 'o seu branch ficou como estava');
  assert.match(ok.seen.prompt, /cópia do branch etnad\/site-cafe-abc123/);

  const dirty = fakeQuery({ summary: 'x', review: { verdict: 'pass', items: [] } }, (o) => { writeFileSync(join(o.cwd, 'site.html'), 'mexido'); });
  assert.equal((await textRunner(s, dirty.query).run(reviewTask('rev-dirty-01'), mina, io())).verification?.status, 'suspect');

  const broken = fakeQuery({}, (o) => { cwd = o.cwd; throw new Error('caiu no meio'); });
  await assert.rejects(textRunner(s, broken.query).run(reviewTask('rev-fail-001'), mina, io()), /caiu no meio/);
  assert.equal(existsSync(cwd), false, 'a cópia some também na falha');
  assert.doesNotMatch(await git(dir, ['worktree', 'list']), /review-/);
});

test('correção: parte do commit conferido, e o diff conta só o que ela mudou', { skip: !hasGit && 'git não está no PATH' }, async (t) => {
  const s = setup(); t.after(s.cleanup);
  const dir = s.ws.path;
  await gitRepo(dir);
  const commit = await delivery(dir, 'etnad/site-abc', 'site.html', 'v1\n');
  const reviewed = seedDone(s, { result: { summary: 'ok', changes: [], howToTest: '', verification: { status: 'ok', reason: '', diffstat: null, files: ['site.html'], branch: 'etnad/site-abc', commit } } });
  const review = seedDone(s, { assignee: 'mina', reviewOf: reviewed.id, workspaceId: null, result: { summary: '', changes: [], howToTest: '', output: 'Corrija.' } });
  const fix = seedDone(s, { title: 'Correção', parentId: review.id, result: { summary: '', changes: [], howToTest: '' } });
  const from = startPointOf(fix, tasksRepo(s.shack.db));
  assert.deepEqual(from, { ref: commit, label: 'etnad/site-abc' });
  assert.equal(startPointOf({ ...fix, workspaceId: 'outro' }, tasksRepo(s.shack.db)), null, 'outro projeto não herda o branch');

  const ws = s.shack.workspaces.get(s.ws.id)!;
  const session = (await startBranch(ws, fix, from))!;
  assert.equal(readFileSync(join(dir, 'site.html'), 'utf8'), 'v1\n', 'começa com a entrega conferida');
  assert.equal(session.startLabel, 'etnad/site-abc');
  await git(dir, ['checkout', '-q', 'main']);
  await assert.rejects(startBranch(ws, { ...fix, id: 'zzzzzz999' }, { ref: 'deadbeef', label: 'sumiu' }), /Não achei o commit deadbeef/);
  writeFileSync(join(dir, 'solto.txt'), 'x');
  await assert.rejects(startBranch(ws, { ...fix, id: 'yyyyyy888' }, from), /mudanças não salvas/);
});

test('o pedido original sobe pela cadeia: correção, conferência, tarefa e prompt', (t) => {
  const s = setup(); t.after(s.cleanup);
  const prompt = seedDone(s, { assignee: 'mina', prompt: 'Quero um site de café para a feira.', workspaceId: null, result: { summary: '', changes: [], howToTest: '' } });
  const work = seedDone(s, { prompt: 'PROMPT DA MINA', parentId: prompt.id, result: { summary: '', changes: [], howToTest: '' } });
  const review = seedDone(s, { assignee: 'mina', reviewOf: work.id, workspaceId: null, result: { summary: '', changes: [], howToTest: '' } });
  const fix = seedDone(s, { prompt: 'CORREÇÃO', parentId: review.id, result: { summary: '', changes: [], howToTest: '' } });
  const repo = tasksRepo(s.shack.db);
  const get = (id: string) => repo.get(id);
  assert.equal(originalRequest(work, get, (id) => id === 'mina'), 'Quero um site de café para a feira.');
  assert.equal(originalRequest(fix, get, (id) => id === 'mina'), 'Quero um site de café para a feira.');
  assert.equal(originalRequest(prompt, get, (id) => id === 'mina'), null);
});

test('sem branch da tarefa, a conferência lê o projeto como está', async (t) => {
  const s = setup(); t.after(s.cleanup);
  mkdirSync(join(s.dir, 'tmp'), { recursive: true });
  const reviewed = seedDone(s, { result: { summary: 'ok', changes: [], howToTest: '' } });
  const site = await prepareReviewSite(reviewed, s.shack.workspaces.get(s.ws.id), join(s.dir, 'tmp'), 'rev-1');
  assert.equal(site.root, s.ws.path);
  assert.equal(site.worktree, false);
  assert.match(site.note, /projeto como está agora/);
  const none = await prepareReviewSite({ ...reviewed, workspaceId: null }, null, join(s.dir, 'tmp'), 'rev-2');
  assert.equal(none.root, null);
});
