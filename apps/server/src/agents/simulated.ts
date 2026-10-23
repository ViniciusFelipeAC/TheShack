import type { AgentRunner } from '../core/task-bus.ts';

/**
 * Runner da Fase 2: finge trabalhar, sem chamar modelo nenhum.
 * - Se o prompt mencionar "aprovação", pede sua aprovação no meio do caminho.
 * - Se o prompt mencionar "falhar", termina com erro.
 */
export function simulatedRunner(opts: { stepMs?: number } = {}): AgentRunner {
  const stepMs = opts.stepMs ?? 1500;
  return {
    async run(task, _agent, io) {
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
      return {
        summary: `Simulação concluída: ${task.title}`,
        changes: [],
        howToTest: 'Nada a testar. Na Fase 2 os agentes ainda são simulados.',
      };
    },
  };
}
