import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Inbox } from '../agents/inbox.ts';
import type { PlanUsageFetcher } from '../renfield/account.ts';

const TIMEOUT_MS = 20_000;

/**
 * O /usage do Claude Code, sem mandar mensagem ao modelo: abre uma sessão, pede o uso do plano e fecha.
 * Quem consulta é o binário oficial, com o login dele; a Shack não toca na credencial.
 * A API do SDK é experimental: se ela mudar ou sumir, a consulta falha e o painel diz "Indisponível".
 */
export function sdkPlanUsage(env: () => Record<string, string | undefined>, cwd: string): PlanUsageFetcher {
  return async () => {
    const inbox = new Inbox<SDKUserMessage>();
    const q = query({
      prompt: inbox,
      // Nada de fora entra: nem as suas configurações, nem MCP, nem os conectores do claude.ai. Sem ferramentas.
      options: { cwd, env: env(), settingSources: [], strictMcpConfig: true, settings: { disableClaudeAiConnectors: true }, tools: [] },
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('o Claude Code demorou a responder')), TIMEOUT_MS); });
      return await Promise.race([q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), timeout]);
    } finally {
      clearTimeout(timer);
      inbox.end();
      try { q.close(); } catch { /* já fechado */ }
    }
  };
}
