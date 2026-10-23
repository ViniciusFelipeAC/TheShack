import type { TaskResult, Verification } from '@shack/shared';

/** Caminho comparável: barras normais, sem "./", relativo ao workspace e sem diferença de maiúsculas (Windows). */
export function normalizePath(root: string, p: string): string {
  const slash = (s: string) => s.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  let out = slash(p).replace(/^\.\//, '');
  const base = slash(root);
  if (out.toLowerCase().startsWith(base.toLowerCase() + '/')) out = out.slice(base.length + 1);
  return out.toLowerCase();
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Confere o relatório do etnaD contra o git de verdade. O relatório é texto do modelo;
 * o diff é o que aconteceu. Quando os dois não batem, a tarefa vira "suspeita".
 */
export function verifyReport(
  root: string,
  result: Pick<TaskResult, 'changes'>,
  real: { files: string[] | null; diffstat: string | null; unverifiedReason?: string | null },
): Verification {
  if (real.files === null) {
    return { status: 'unverified', reason: real.unverifiedReason ?? 'Não havia como conferir as mudanças no git.', diffstat: null, files: [] };
  }
  const files = real.files;
  const changed = files.map((f) => normalizePath(root, f));
  const reported = result.changes.map((c) => c.path).filter((p) => p.trim());
  const base = { diffstat: real.diffstat, files };

  if (reported.length > 0 && files.length === 0) {
    return { ...base, status: 'suspect', reason: `O relatório lista ${plural(reported.length, 'mudança', 'mudanças')}, mas nenhum arquivo mudou no git.` };
  }
  const matches = (p: string) => {
    const r = normalizePath(root, p);
    return changed.some((f) => f === r || f.startsWith(r + '/') || f.endsWith('/' + r) || r.endsWith('/' + f));
  };
  const missing = reported.filter((p) => !matches(p));
  if (missing.length > 0) {
    const shown = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ` e mais ${missing.length - 3}` : '');
    return { ...base, status: 'suspect', reason: `O relatório cita arquivos que não mudaram no git: ${shown}.` };
  }
  if (reported.length === 0 && files.length > 0) {
    return { ...base, status: 'ok', reason: `O relatório não listou as mudanças, mas ${plural(files.length, 'arquivo mudou', 'arquivos mudaram')}. Confira o diff.` };
  }
  if (files.length === 0) return { ...base, status: 'ok', reason: 'Nenhum arquivo mudou, como o relatório diz.' };
  return { ...base, status: 'ok', reason: `Bate com o git: ${plural(files.length, 'arquivo mudou', 'arquivos mudaram')}.` };
}
