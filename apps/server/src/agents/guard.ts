import { isAbsolute, relative, resolve } from 'node:path';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

/** Verdadeiro se `target` está dentro de `root` (ou é a própria `root`). */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const FILE_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const WRITE_COMMAND = /\b(rm|rmdir|del|erase|rd|mv|move|cp|copy|xcopy|robocopy|mkdir|md|touch|remove-item|move-item|copy-item|new-item|set-content|add-content|out-file|rename-item)\b|>{1,2}/i;
// A letra antes do ":" não pode vir colada a outra, senão o "p:/" de "http://" vira um disco.
const WINDOWS_PATH = /(?<![A-Za-z])[A-Za-z]:[\\/][^\s"'`;|&<>]*/g;
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
    const outside = commandPaths(args.command).find((p) => !isInside(root, p));
    if (outside) return `Bloqueado: o comando mexe em "${outside}", fora do workspace. Trabalhe só dentro de ${root}.`;
  }
  return null;
}

/*
 * Modo livre do shell: o etnaD roda o que quiser dentro do workspace, e só o arriscado pede aprovação.
 * São regras por texto, então erram para os dois lados. O que escreve fora do workspace já é bloqueado
 * pelo hook acima; esta lista cobre o que o hook não vê. Na dúvida, a regra pede.
 */
const RISKY: Array<[RegExp, string]> = [
  [/\bgit\b[^;|&\n]*?\s(commit|push|pull|checkout|switch|restore|reset|rebase|merge|cherry-pick|revert|clean|stash|tag|remote|config|worktree|branch\s+-[dDmMcCf])\b/i, 'mexe no git, que o sistema controla'],
  [/\.claude\b|\.credentials|\.ssh\b|\.aws\b|\.gnupg|\.git-credentials|\.npmrc|\.pypirc|\.netrc|credential|ANTHROPIC_|CLAUDE_CODE_|cmdkey/i, 'pode tocar em credenciais'],
  [/\b(stop-process|spps|taskkill|kill|pkill|killall)\b/i, 'encerra processos e pode derrubar o seu servidor'],
  [/\b(sudo|runas)\b|-verb\s+runas/i, 'pede privilégio de administrador'],
  [/\b(shutdown|restart-computer|stop-computer|setx|set-executionpolicy|set-itemproperty|new-itemproperty|remove-itemproperty|bcdedit|diskpart|format-volume|schtasks|register-scheduledtask|new-service)\b|\breg(\.exe)?\s+(add|delete|import)\b|\bsc(\.exe)?\s+(create|delete|config|stop)\b|\bnet\s+(user|localgroup|stop)\b/i, 'muda configurações do sistema'],
  [/\b(winget|choco|scoop|msiexec|pipx)\b|\b(npm|pnpm|yarn|bun)\b[^;|&\n]*\s(-g|--global)\b|\byarn\s+global\b|\bpip3?\b[^;|&\n]*\s--user\b|\buv\s+tool\s+install\b/i, 'instala programas fora do projeto'],
];
/** Rede direta. Pacotes (npm, pip, uv) passam; acessar o seu próprio servidor local também. */
const NETWORK = /\b(curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm|start-bitstransfer|scp|sftp|ftp)\b/i;
const LOCALHOST = /\b(localhost|127\.0\.0\.1)\b/i;
/** Apagar "." ou "*" na raiz leva o workspace inteiro; apagar "dist" ou "node_modules" passa. */
const DELETE = /\b(rm|remove-item|ri|del|erase|rd|rmdir)\b/i;
const MASS_DELETE = /\b(rm|remove-item|ri|del|erase|rd|rmdir)\b[^;|&\n]*\s["']?(\.|\*|\.[\\/]\*?|[\\/]\*?)["']?(?=\s|$|[;|&])/i;
const HOME_REF = /(^|[\s"'=(])~(?=[\\/\s]|$)|\$HOME\b|\$env:(USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH)\b|%(USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH)%/i;
const PARENT_DIR = /(^|[\s"'=\\/])\.\.(?=[\\/\s"';]|$)/;
/** Ler programas instalados (node.exe, msedge.exe) é comum e não expõe nada seu. */
const SYSTEM_DIR = /^[A-Za-z]:[\\/](program|windows)(?=$|[\\/\s])/i;

function commandPaths(command: string): string[] {
  const paths = [...command.matchAll(WINDOWS_PATH)].map((m) => m[0]);
  for (const m of command.matchAll(GITBASH_PATH)) paths.push(`${m[1]![1]}:${m[1]!.slice(2)}`);
  return paths;
}

/**
 * No modo livre, o motivo para um comando de shell pedir aprovação, ou nulo se ele pode rodar sozinho.
 * Roda depois do hook: o que escreve fora do workspace nem chega aqui.
 */
export function shellRisk(root: string, command: string): string | null {
  for (const [pattern, reason] of RISKY) if (pattern.test(command)) return reason;
  if (NETWORK.test(command) && !LOCALHOST.test(command)) return 'acessa a rede fora da sua máquina';
  // "cd <raiz>; rm -rf dist" é normal; só pede se o próprio trecho do apagar mira a raiz.
  const wipesRoot = command.split(/[;&|\n]+/).some((part) => DELETE.test(part)
    && commandPaths(part).some((p) => relative(resolve(root), resolve(p)) === ''));
  if (wipesRoot || MASS_DELETE.test(command)) return 'apaga o workspace em massa';
  if (HOME_REF.test(command) || (WRITE_COMMAND.test(command) && PARENT_DIR.test(command))) return 'mexe fora do workspace';
  if (commandPaths(command).some((p) => !isInside(root, p) && !SYSTEM_DIR.test(p))) return 'mexe fora do workspace';
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
