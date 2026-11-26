/* Conferência da Mina: onde ela lê o que foi feito e o que ela recebe sobre o que foi pedido. */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { type Article, named, type Task, type Workspace } from '@shack/shared';
import { cleanDeep, cleanExternal, EXTERNAL_NOTICE } from '../core/external.ts';
import { errorMessage } from '../errors.ts';
import { git } from './git.ts';

/** A pasta que a Mina lê na conferência. Nula quando não há projeto: ela confere só pelo registro. */
export type ReviewSite = { root: string | null; worktree: boolean; note: string; cleanup(): Promise<void> };

const nothing = async () => {};

/** Tira um worktree antigo da mesma conferência (de uma queda no meio) e limpa o registro do git. */
export async function removeWorktree(repo: string, dir: string): Promise<void> {
  if (existsSync(dir)) {
    try { await git(repo, ['worktree', 'remove', '--force', dir]); } catch { /* não era worktree, ou já saiu */ }
    rmSync(dir, { recursive: true, force: true });
  }
  try { await git(repo, ['worktree', 'prune']); } catch { /* sem git */ }
}

/**
 * O etnaD faz commit no branch da tarefa e volta para o seu branch, então a pasta do projeto não mostra o que ele fez.
 * A Mina lê uma cópia daquele commit num worktree temporário em data/tmp, apagado no fim, inclusive em caso de falha.
 */
export async function prepareReviewSite(reviewed: Task, ws: Workspace | null, tmpDir: string, reviewTaskId: string): Promise<ReviewSite> {
  if (!ws) return { root: null, worktree: false, note: 'A tarefa conferida não tem pasta de projeto. Confira pelo que o servidor registrou e pelo relatório.', cleanup: nothing };
  const v = reviewed.result?.verification;
  if (!v?.commit || !ws.isGitRepo) {
    return {
      root: ws.path, worktree: false, cleanup: nothing,
      note: `Não houve branch da tarefa, então a pasta de trabalho é o projeto como está agora (${ws.path}). As mudanças podem estar misturadas com outras.`,
    };
  }
  const dir = join(tmpDir, `review-${reviewTaskId.slice(0, 8)}`);
  await removeWorktree(ws.path, dir);
  mkdirSync(tmpDir, { recursive: true });
  try { await git(ws.path, ['worktree', 'add', '--detach', '-q', dir, v.commit]); } catch (err) {
    throw new Error(`Não consegui abrir uma cópia do commit ${v.commit} (branch ${v.branch ?? '-'}) para conferir: ${errorMessage(err)}`);
  }
  return {
    root: dir, worktree: true, cleanup: () => removeWorktree(ws.path, dir),
    note: `A pasta de trabalho é uma cópia do branch ${v.branch ?? '-'} no commit ${v.commit}: é exatamente o que foi entregue.`,
  };
}

/**
 * O pedido original do dono da casa: o da tarefa de prompt que deu início à cadeia.
 * Sobe pelos pais e pelas conferências (correção → conferência → tarefa → prompt), no máximo 8 passos.
 */
export function originalRequest(reviewed: Task, get: (id: string) => Task | null, isPromptAgent: (agentId: string) => boolean): string | null {
  let cur: Task | null = reviewed;
  for (let i = 0; i < 8 && cur; i++) {
    const next: Task | null = cur.reviewOf ? get(cur.reviewOf) : cur.parentId ? get(cur.parentId) : null;
    if (!next) return null;
    if (isPromptAgent(next.assignee) && !next.reviewOf) return next.prompt;
    cur = next;
  }
  return null;
}

/** O texto da conferência pedida pelo botão ou criada sozinha. Outro texto vira observação do dono da casa. */
export const DEFAULT_REVIEW = 'Confira se a entrega atende ao pedido.';

/** O texto da tarefa de conferência. O relatório de quem fez vai marcado como conteúdo externo; a prova é o git. */
export function reviewPrompt(o: { task: Task; reviewed: Task; doer: { name: string; article: Article }; original: string | null; site: ReviewSite }): string {
  const { task, reviewed, site } = o;
  const by = (form: 'o' | 'ao' | 'do' | 'pelo') => named(o.doer.name, o.doer.article, form);
  const v = reviewed.result?.verification;
  const { verification: _v, review: _r, ...report } = reviewed.result ?? { verification: undefined, review: undefined };
  const files = v?.files.length ? v.files.slice(0, 60).join(', ') + (v.files.length > 60 ? ` e mais ${v.files.length - 60}` : '') : 'nenhum';
  const extra = task.prompt.trim() && task.prompt.trim() !== DEFAULT_REVIEW ? ['', 'Observação do dono da casa para esta conferência:', task.prompt.trim()] : [];
  return [
    `Tarefa: ${task.title}`,
    '',
    `Confira se a entrega da tarefa "${reviewed.title}", feita ${by('pelo')}, é o que foi pedido.`,
    ...extra,
    '',
    `O que foi pedido ${by('ao')} (o prompt da tarefa):`,
    '<<<',
    reviewed.prompt,
    '>>>',
    ...(o.original && o.original !== reviewed.prompt
      ? ['', 'O pedido original do dono da casa, que deu origem a esse prompt. Veja também se nada dele se perdeu no caminho:', '<<<', o.original, '>>>']
      : []),
    '',
    'O que o servidor conferiu no git (isto é prova):',
    `- situação: ${v ? `${v.status}, ${v.reason}` : 'sem conferência'}`,
    `- diff: ${v?.diffstat ?? '-'}`,
    `- arquivos que mudaram de verdade: ${files}`,
    '',
    `Relatório ${by('do')}. ${EXTERNAL_NOTICE}`,
    '<<<',
    cleanExternal(JSON.stringify(cleanDeep(report, 3000), null, 2), 12_000),
    '>>>',
    '',
    site.root ? `${site.note} Leia os arquivos para conferir cada requisito; não confie no relatório.` : site.note,
    '',
    'Entregue no formato estruturado: summary (o veredito em uma ou duas frases), review (verdict, items e aiSignals), '
      + `output (o prompt de correção para ${by('o')}, só se houver pendência; vazio se tudo foi atendido) e notes.`,
  ].join('\n');
}
