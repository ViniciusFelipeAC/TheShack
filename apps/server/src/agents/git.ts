import { execFile } from 'node:child_process';
import type { Task, Workspace } from '@shack/shared';

/** Roda git na pasta. Falha com a saída de erro do git. */
export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

export type GitSession = {
  /** Branch da tarefa, ou nulo quando o etnaD trabalhou direto no branch atual. */
  branch: string | null;
  /** Para onde voltar no fim: nome do branch ou hash (HEAD destacado). */
  base: string;
  baseLabel: string;
  note: string | null;
};

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tarefa';

/**
 * Antes da tarefa: cria `etnad/<slug>-<id>` a partir do branch atual.
 * Se a pasta tiver mudanças não salvas, não cria branch, para não misturar o seu trabalho com o do etnaD.
 */
export async function startBranch(ws: Workspace, task: Task): Promise<GitSession | null> {
  if (!ws.gitBranching || !ws.isGitRepo) return null;
  let base: string;
  let baseLabel: string;
  try {
    baseLabel = await git(ws.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
    base = baseLabel === 'HEAD' ? await git(ws.path, ['rev-parse', 'HEAD']) : baseLabel;
  } catch {
    return { branch: null, base: '', baseLabel: '', note: 'O repositório ainda não tem commits, então trabalhei sem criar branch.' };
  }
  if (await git(ws.path, ['status', '--porcelain'])) {
    return { branch: null, base, baseLabel, note: 'A pasta tinha mudanças não salvas, então trabalhei direto no branch atual, sem criar branch nem commit.' };
  }
  let branch = `etnad/${slug(task.title)}-${task.id.slice(0, 6)}`;
  const exists = await git(ws.path, ['branch', '--list', branch]);
  if (exists) branch = `${branch}-${Date.now().toString(36)}`;
  await git(ws.path, ['checkout', '-b', branch]);
  return { branch, base, baseLabel, note: null };
}

/** O que o git mostra de verdade no fim da tarefa. `files` nulo quer dizer que não houve como medir. */
export type GitOutcome = {
  note: string | null;
  commit: string | null;
  files: string[] | null;
  diffstat: string | null;
};

/**
 * Depois da tarefa: faz commit do que mudou no branch da tarefa e volta para o branch de antes.
 * Nunca faz push. Devolve uma frase para o relatório e a lista real de arquivos mudados.
 */
export async function finishBranch(ws: Workspace, s: GitSession, task: Task, ok: boolean): Promise<GitOutcome> {
  if (!s.branch) return { note: s.note, commit: null, files: null, diffstat: null };
  const dirty = Boolean(await git(ws.path, ['status', '--porcelain']));
  if (dirty) {
    await git(ws.path, ['add', '-A']);
    const message = `${ok ? '' : '[incompleto] '}${task.title}\n\nFeito pelo etnaD, tarefa ${task.id}.`;
    await git(ws.path, ['-c', 'user.name=etnaD', '-c', 'user.email=etnad@the-shack.local', 'commit', '-q', '-m', message]);
  }
  // Compara com o ponto de partida, e não só com o que estava sem commit: pega também commits feitos durante a tarefa.
  const range = [await git(ws.path, ['rev-parse', s.base]), 'HEAD'];
  const diff = (args: string[]) => git(ws.path, ['-c', 'core.quotepath=false', 'diff', '--relative', '--no-renames', ...args, ...range]);
  const files = (await diff(['--name-only'])).split('\n').map((f) => f.trim()).filter(Boolean);
  const diffstat = files.length ? (await diff(['--shortstat'])).trim() : null;
  const commit = files.length ? await git(ws.path, ['rev-parse', '--short', 'HEAD']) : null;
  await git(ws.path, ['checkout', '-q', s.base]);
  if (!files.length) {
    await git(ws.path, ['branch', '-D', s.branch]);
    return { note: 'Nenhum arquivo mudou, então não criei branch nem commit.', commit: null, files, diffstat: null };
  }
  const note = `As mudanças estão no branch ${s.branch} (commit ${commit}). O seu ${s.baseLabel === 'HEAD' ? 'HEAD' : `branch ${s.baseLabel}`} ficou como estava. Para revisar: git diff ${s.baseLabel === 'HEAD' ? s.base.slice(0, 7) : s.baseLabel}..${s.branch}`;
  return { note, commit, files, diffstat };
}
