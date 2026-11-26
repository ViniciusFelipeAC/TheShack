import { runnerOf, type TaskResult } from '@shack/shared';
import type { AgentRunner } from '../core/task-bus.ts';

/** O que a Mina simulada entrega: um prompt, ou uma conferência com uma pendência. */
function simulatedText(title: string, review: boolean): TaskResult {
  if (review) {
    return {
      summary: 'Simulação: a entrega atende quase tudo; falta um item.', changes: [], howToTest: '',
      review: {
        verdict: 'issues',
        items: [
          { requirement: 'Critério de aceite simulado', status: 'met', evidence: 'index.html:1', note: '' },
          { requirement: 'Checklist anti-IA simulado', status: 'partial', evidence: 'styles.css:12', note: 'Simulação: um sinal sobrou.' },
        ],
        aiSignals: { count: 2, found: [{ signal: 'Inter em tudo', where: 'styles.css:3' }, { signal: 'Gradiente roxo no hero', where: 'styles.css:12' }] },
      },
      output: `# Correção simulada\n\nAjuste o que ficou parcial em "${title}".`,
    };
  }
  return {
    summary: `Simulação: prompt pronto para "${title}".`, changes: [], howToTest: '',
    output: `# Prompt simulado\n\n## Objetivo\n\n${title}\n\n## Critérios de aceite\n\n- Um item simulado.`,
    direction: { fonts: ['Fraunces', 'Work Sans'], palette: ['#1f3a2e', '#e9e2d0'], layout: 'assimétrico' },
  };
}

/**
 * Runner da Fase 2: finge trabalhar, sem chamar modelo nenhum.
 * - Se o prompt mencionar "aprovação", pede sua aprovação no meio do caminho.
 * - Se o prompt mencionar "falhar", termina com erro.
 * - Agentes de texto (a Mina) entregam um prompt ou uma conferência de mentira.
 */
export function simulatedRunner(opts: { stepMs?: number } = {}): AgentRunner {
  const stepMs = opts.stepMs ?? 1500;
  return {
    async run(task, agent, io) {
      const wait = (ms: number) => new Promise<void>((resolve, reject) => {
        if (io.signal.aborted) return reject(io.signal.reason);
        const onAbort = () => { clearTimeout(timer); reject(io.signal.reason); };
        const timer = setTimeout(() => { io.signal.removeEventListener('abort', onAbort); resolve(); }, ms);
        io.signal.addEventListener('abort', onAbort, { once: true });
      });
      const prompt = task.prompt.toLowerCase();

      io.progress('Lendo o pedido');
      await wait(stepMs);

      if (prompt.includes('aprovação') || prompt.includes('aprovacao')) {
        const res = await io.ask({
          kind: 'tool',
          summary: 'Posso rodar "npm install" no workspace de teste?',
          detail: { command: 'npm install', simulated: true },
        });
        if (io.signal.aborted) throw io.signal.reason;
        if (res.decision === 'deny') {
          return { summary: 'Parei: você negou a aprovação.', changes: [], howToTest: '' };
        }
      }

      io.progress('Trabalhando no pedido');
      await wait(stepMs);
      if (prompt.includes('falhar')) throw new Error('Falha simulada, pedida no prompt.');

      io.progress('Finalizando');
      await wait(stepMs);
      if (agent.manifest && runnerOf(agent.manifest) === 'text') return simulatedText(task.title, Boolean(task.reviewOf));
      return {
        summary: `Simulação concluída: ${task.title}`,
        changes: [],
        howToTest: 'Nada a testar. Na Fase 2 os agentes ainda são simulados.',
      };
    },
  };
}
