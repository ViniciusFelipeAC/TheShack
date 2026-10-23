import { isAbsolute, relative, resolve } from 'node:path';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

/** Verdadeiro se `target` está dentro de `root` (ou é a própria `root`). */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const FILE_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const WRITE_COMMAND = /\b(rm|rmdir|del|erase|rd|mv|move|cp|copy|xcopy|robocopy|mkdir|md|touch|remove-item|move-item|copy-item|new-item|set-content|add-content|out-file|rename-item)\b|>{1,2}/i;
const WINDOWS_PATH = /[A-Za-z]:[\\/][^\s"'`;|&<>]*/g;
const GITBASH_PATH = /(?:^|[\s"'=])(\/[a-zA-Z]\/[^\s"'`;|&<>]*)/g;

/**
 * Motivo para bloquear a chamada, ou nulo se ela pode seguir.
 * - Ferramentas de arquivo: qualquer caminho fora do workspace é bloqueado.
 * - Shell: comandos que escrevem ou apagam com caminho absoluto fora do workspace são bloqueados.
 *   O resto do shell já passa pela sua aprovação quando não está na lista permitida.
 */
export function checkToolInput(root: string, tool: string, input: unknown): string | null {
  const args = (input ?? {}) as Record<string, unknown>;
  for (const key of FILE_KEYS) {
    const value = args[key];
    if (typeof value !== 'string' || !value) continue;
    if (!isInside(root, resolve(root, value))) return `Bloqueado: "${value}" fica fora do workspace. Trabalhe só dentro de ${root}.`;
  }
  if ((tool === 'Bash' || tool === 'PowerShell') && typeof args.command === 'string' && WRITE_COMMAND.test(args.command)) {
    const paths = [...args.command.matchAll(WINDOWS_PATH)].map((m) => m[0]);
    for (const m of args.command.matchAll(GITBASH_PATH)) paths.push(`${m[1]![1]}:${m[1]!.slice(2)}`);
    const outside = paths.find((p) => !isInside(root, p));
    if (outside) return `Bloqueado: o comando mexe em "${outside}", fora do workspace. Trabalhe só dentro de ${root}.`;
  }
  return null;
}

/** Hook PreToolUse que aplica `checkToolInput` em toda chamada, em qualquer modo de permissão. */
export function workspaceGuard(root: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const reason = checkToolInput(root, input.tool_name, input.tool_input);
    if (!reason) return {};
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
  };
}

/** Frase curta de progresso para cada ferramenta, mostrada na cena e no painel. */
export function describeTool(root: string, name: string, input: unknown): string | null {
  const a = (input ?? {}) as Record<string, unknown>;
  const abs = typeof a.file_path === 'string' ? resolve(root, a.file_path) : null;
  const file = abs ? (isInside(root, abs) ? relative(root, abs) || abs : abs) : null;
  switch (name) {
    case 'Read': return file ? `Lendo ${file}` : 'Lendo arquivos';
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return file ? `Editando ${file}` : 'Editando arquivos';
    case 'Write': return file ? `Escrevendo ${file}` : 'Escrevendo arquivos';
    case 'Glob': case 'Grep': return 'Procurando no código';
    case 'Bash': case 'PowerShell': {
      const cmd = String(a.command ?? '').replace(/\s+/g, ' ').trim();
      return cmd ? `Rodando ${cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd}` : 'Rodando um comando';
    }
    case 'TodoWrite': return 'Planejando os passos';
    case 'WebFetch': case 'WebSearch': return 'Pesquisando';
    case 'AskUserQuestion': return null;
    default: return `Usando ${name}`;
  }
}
