import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Task, Workspace } from '@shack/shared';
import { finishBranch, git, startBranch } from '../src/agents/git.ts';
import { checkToolInput, describeTool } from '../src/agents/guard.ts';
import { ROOT } from '../src/config.ts';
import { renfieldTools } from '../src/renfield/tools.ts';
import { setup, waitFor } from './helpers.ts';

const hasGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('workspaces: cadastra, valida e remove', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const other = join(s.dir, 'outro');
  mkdirSync(other);
  const created = await s.call('POST', '/workspaces', { name: 'Outro', path: other });
  assert.equal(created.status, 201);
  assert.equal(created.body.isGitRepo, false);
  assert.equal(created.body.gitBranching, true);

  assert.equal((await s.call('POST', '/workspaces', { name: 'Relativo', path: 'projetos/app' })).status, 400);
  assert.equal((await s.call('POST', '/workspaces', { name: 'Fantasma', path: join(s.dir, 'nao-existe') })).status, 400);
  assert.equal((await s.call('POST', '/workspaces', { name: 'outro', path: s.dir })).status, 409);
  const shack = await s.call('POST', '/workspaces', { name: 'A Shack', path: ROOT });
  assert.equal(shack.status, 400);
  assert.match(shack.body.error.message, /própria Shack/);

  const patched = await s.call('PATCH', `/workspaces/${created.body.id}`, { autoApprove: ['Bash(npm run build*)'] });
  assert.deepEqual(patched.body.autoApprove, ['Bash(npm run build*)']);
  await s.call('DELETE', `/workspaces/${created.body.id}`);
  assert.equal((await s.call('GET', '/workspaces')).body.length, 1);
});

test('o etnaD exige um workspace que exista', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const none = await s.call('POST', '/tasks', { assignee: 'etnad', title: 'x', prompt: 'y' });
  assert.equal(none.body.error.code, 'workspace_required');
  const wrong = await s.call('POST', '/tasks', { assignee: 'etnad', workspaceId: 'inventado', title: 'x', prompt: 'y' });
  assert.equal(wrong.body.error.code, 'unknown_workspace');
});

test('no modo real, o Renfield não recebe tarefas: ele conversa', async (t) => {
  const s = setup({ productionRunners: true }); t.after(s.cleanup);
  const r = await s.call('POST', '/tasks', { assignee: 'renfield', title: 'x', prompt: 'y' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'agent_cannot_run');
});

test('o Renfield escolhe o workspace ao delegar', async (t) => {
  const s = setup(); t.after(s.cleanup);
  const tools = renfieldTools({ tasks: s.shack.tasks, registry: s.shack.registry, mind: s.shack.mind, workspaces: s.shack.workspaces });
  const create = tools.find((x) => x.name === 'tasks_create')!;
  const ctx = { conversationId: 'main' };

  const one = JSON.parse(await create.run({ assignee: 'etnad', title: 'Único', prompt: 'p' }, ctx));
  assert.equal(s.shack.tasks.get(one.created.id).workspaceId, s.ws.id, 'usa o único workspace');

  const second = join(s.dir, 'segundo');
  mkdirSync(second);
  s.shack.workspaces.create({ name: 'segundo', path: second, autoApprove: [], gitBranching: false });
  await assert.rejects(async () => create.run({ assignee: 'etnad', title: 'Qual?', prompt: 'p' }, ctx), /Pergunte ao dono da casa em qual deles trabalhar: projeto, segundo/);
  const named = JSON.parse(await create.run({ assignee: 'etnad', title: 'Nomeado', prompt: 'p', workspace: 'Segundo' }, ctx));
  assert.equal(s.shack.workspaces.get(s.shack.tasks.get(named.created.id).workspaceId!)!.name, 'segundo');
});

test('"sim" no chat não responde a uma pergunta aberta', async (t) => {
  const s = setup(); t.after(s.cleanup);
  s.shack.approvals.request({ agentId: 'etnad', kind: 'question', summary: 'Qual banco usar?', options: ['SQLite', 'Postgres'] });
  await s.call('POST', '/conversations/main/messages?wait=true', { text: 'sim' });
  assert.equal(s.engine.turns.length, 1, 'virou uma mensagem normal para o Renfield');
  assert.equal(s.shack.approvals.pending().length, 1, 'a pergunta continua aberta');
});

test('guarda: bloqueia arquivos e comandos fora do workspace', () => {
  const root = 'C:\\proj\\app';
  assert.equal(checkToolInput(root, 'Read', { file_path: 'src\\index.ts' }), null);
  assert.equal(checkToolInput(root, 'Edit', { file_path: 'C:\\proj\\app\\README.md' }), null);
  assert.match(checkToolInput(root, 'Read', { file_path: 'C:\\Users\\voce\\.ssh\\id_rsa' })!, /fora do workspace/);
  assert.match(checkToolInput(root, 'Write', { file_path: '..\\outro\\x.txt' })!, /fora do workspace/);
  assert.match(checkToolInput(root, 'Glob', { path: 'D:\\' })!, /fora do workspace/);
  assert.match(checkToolInput(root, 'Bash', { command: 'rm -rf C:\\Users\\voce\\Documents' })!, /fora do workspace/);
  assert.match(checkToolInput(root, 'Bash', { command: 'cp a.txt /c/Windows/x' })!, /fora do workspace/);
  assert.equal(checkToolInput(root, 'Bash', { command: 'rm -rf C:\\proj\\app\\dist' }), null);
  assert.equal(checkToolInput(root, 'Bash', { command: '"C:\\Program Files\\nodejs\\node.exe" --version' }), null, 'ler fora não é bloqueado; só escrever');
  assert.equal(checkToolInput(root, 'PowerShell', { command: 'Get-ChildItem' }), null);
});

test('progresso: frases curtas por ferramenta', () => {
  const root = 'C:\\proj\\app';
  assert.equal(describeTool(root, 'Read', { file_path: 'C:\\proj\\app\\src\\a.ts' }), 'Lendo src\\a.ts');
  assert.equal(describeTool(root, 'Edit', { file_path: 'b.ts' }), 'Editando b.ts');
  assert.equal(describeTool(root, 'Read', { file_path: 'C:\\Windows\\win.ini' }), 'Lendo C:\\Windows\\win.ini');
  assert.equal(describeTool(root, 'Bash', { command: 'npm   test' }), 'Rodando npm test');
  assert.equal(describeTool(root, 'Grep', {}), 'Procurando no código');
  assert.equal(describeTool(root, 'AskUserQuestion', {}), null);
});

test('git: branch por tarefa, commit no fim e volta para o seu branch', { skip: !hasGit && 'git não está no PATH' }, async (t) => {
  const s = setup(); t.after(s.cleanup);
  const dir = s.ws.path;
  await git(dir, ['init', '-q', '-b', 'main']);
  await git(dir, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(dir, 'README.md'), 'oi\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['-c', 'user.name=Teste', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'inicial']);
  const ws: Workspace = s.shack.workspaces.get(s.ws.id)!;
  assert.equal(ws.isGitRepo, true);
  const task = { id: 'abcdef123456', title: 'Adicionar Testes!' } as Task;

  const session = (await startBranch(ws, task))!;
  assert.equal(session.branch, 'etnad/adicionar-testes-abcdef');
  assert.equal(await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), session.branch);
  writeFileSync(join(dir, 'README.md'), 'oi\nmudado pelo etnaD\n');
  const note = (await finishBranch(ws, session, task, true)).note;
  assert.match(note!, /As mudanças estão no branch etnad\/adicionar-testes-abcdef/);
  assert.equal(await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main');
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'oi\n', 'o seu branch ficou como estava');
  assert.match(await git(dir, ['log', '-1', '--format=%an %s', session.branch!]), /^etnaD Adicionar Testes!/);

  writeFileSync(join(dir, 'solto.txt'), 'não salvo');
  const dirty = (await startBranch(ws, task))!;
  assert.equal(dirty.branch, null);
  assert.match(dirty.note!, /mudanças não salvas/);

  await waitFor(() => true, 'nada');
});
