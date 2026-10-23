import type { Task } from '@shack/shared';
import type { z } from 'zod';
import { asExternal, cleanDeep, EXTERNAL_NOTICE } from '../core/external.ts';
import type { TaskBus } from '../core/task-bus.ts';
import type { Registry } from '../core/registry.ts';
import type { Workspaces } from '../core/workspaces.ts';
import type { Account } from './account.ts';
import { bool, id, num, oneOf, priority, text } from './lenient.ts';
import type { Mind } from './mind.ts';

export type ToolContext = { conversationId: string };

/** Ferramenta do Marvin, independente do Agent SDK (o motor converte). */
export type MarvinTool = {
  name: string;
  /** Grupo citado em `tools.shack` no agent.yaml. */
  group: string;
  description: string;
  shape: z.ZodRawShape;
  /** Consulta que só lê. Se falhar, a resposta diz "Indisponível", para não parecer uma lista vazia. */
  reads?: boolean;
  run(args: Record<string, unknown>, ctx: ToolContext): string | Promise<string>;
};

const out = (value: unknown) => JSON.stringify(value);

/** Lista com o total explícito. Vazia, diz que a consulta deu certo e não achou nada, para não ser confundida com falha. */
export function listOut(items: unknown[], empty: string, extra: Record<string, unknown> = {}): string {
  return out(items.length ? { total: items.length, items, ...extra } : { total: 0, items: [], note: `Consulta feita com sucesso: ${empty}.`, ...extra });
}

const TASK_STATUS = oneOf(['queued', 'running', 'waiting_input', 'done', 'failed', 'cancelled'], {
  fila: 'queued', 'na fila': 'queued', rodando: 'running', 'em andamento': 'running', esperando: 'waiting_input',
  concluída: 'done', concluida: 'done', feita: 'done', falhou: 'failed', falha: 'failed', cancelada: 'cancelled', canceled: 'cancelled',
});

export function marvinTools(d: { tasks: TaskBus; registry: Registry; mind: Mind; workspaces: Workspaces; account?: Account }): MarvinTool[] {
  /** Workspace pedido (id ou nome), ou o único cadastrado quando o agente exige um e não foi dito qual. */
  const pickWorkspace = (assignee: string, ref: unknown): string | undefined => {
    if (typeof ref === 'string' && ref.trim()) {
      const w = d.workspaces.find(ref.trim());
      if (!w) throw new Error(`Não existe workspace "${ref}". Use workspaces_list.`);
      return w.id;
    }
    if (d.registry.get(assignee)?.manifest?.workspace !== 'required') return undefined;
    const all = d.workspaces.list();
    if (all.length === 1) return all[0]!.id;
    if (all.length === 0) throw new Error('Nenhum workspace cadastrado. Peça ao dono da casa para cadastrar a pasta do projeto nas configurações.');
    throw new Error(`Há ${all.length} workspaces. Pergunte ao dono da casa em qual deles trabalhar: ${all.map((w) => w.name).join(', ')}.`);
  };

  /** Resumo de uma tarefa. Texto escrito por outro agente vai limpo; a conferência do servidor vai à parte. */
  const brief = (t: Task) => ({
    id: t.id, title: t.title, assignee: t.assignee, status: t.status, error: t.error ? cleanDeep(t.error, 500) : null,
    summary: t.result?.summary ? cleanDeep(t.result.summary, 600) : null,
    verification: t.result?.verification ? { status: t.result.verification.status, reason: t.result.verification.reason } : null,
  });

  /** Uma tarefa nova para o etnaD com a cota perto do fim só sai depois que o dono da casa confirmar. */
  const quotaWarning = (): string | null => {
    const q = d.account?.status.quota;
    if (!q || q.status !== 'allowed_warning') return null;
    const pct = q.percent !== null ? ` (${Math.round(q.percent)}% usado)` : '';
    const at = q.resetsAt ? `, renova em ${q.resetsAt}` : '';
    return `A cota do plano está perto do limite${pct}${at}. Pergunte ao dono da casa se quer mandar a tarefa mesmo assim; se ele confirmar, chame tasks_create de novo com quota_ok=true.`;
  };

  return [
    {
      name: 'agents_status', group: 'agents', reads: true,
      description: 'Lista os agentes da casa com o status atual, a atividade e a tarefa em andamento.',
      shape: {},
      run: () => listOut(d.registry.list().map((a) => {
        const i = d.tasks.agentInfo(a);
        return { id: i.id, name: i.name, role: i.role, status: i.status, activity: i.activity, currentTaskId: i.currentTaskId };
      }), 'nenhum agente cadastrado'),
    },
    {
      name: 'tasks_list', group: 'tasks', reads: true,
      description: 'Lista tarefas recentes, das mais novas para as mais antigas. Filtre por status ou agente.',
      shape: { status: TASK_STATUS.optional(), assignee: id().optional(), limit: num({ min: 1, max: 30, int: true }).optional() },
      run: (a) => {
        const items = d.tasks.list({ status: a.status as never, assignee: a.assignee as string | undefined, limit: (a.limit as number) ?? 10 }).items.map(brief);
        return listOut(items, 'nenhuma tarefa com esse filtro', items.some((t) => t.summary || t.error) ? { notice: EXTERNAL_NOTICE } : {});
      },
    },
    {
      name: 'tasks_get', group: 'tasks', reads: true,
      description: 'Detalhe de uma tarefa: prompt, relatório, conferência do servidor, nota de passagem, erro e histórico de estados.',
      shape: { id: id() },
      run: (a) => {
        const t = d.tasks.get(String(a.id));
        const { verification, ...report } = t.result ?? { verification: undefined };
        return out({
          id: t.id, title: t.title, assignee: t.assignee, status: t.status, prompt: t.prompt, history: t.history,
          verification: verification ?? null,
          report: t.result ? asExternal(`relatório do ${t.assignee}`, report) : null,
          handoff: t.handoff ? asExternal(`nota de passagem do ${t.assignee}`, t.handoff) : null,
          error: t.error ? asExternal(`erro da tarefa`, t.error) : null,
        });
      },
    },
    {
      name: 'workspaces_list', group: 'tasks', reads: true,
      description: 'Lista as pastas de projeto onde o etnaD pode trabalhar.',
      shape: {},
      run: () => listOut(d.workspaces.list().map((w) => ({ id: w.id, name: w.name, path: w.path, git: w.isGitRepo })), 'nenhum workspace cadastrado'),
    },
    {
      name: 'tasks_create', group: 'tasks',
      description: 'Cria uma tarefa para outro agente. Use SOMENTE quando o dono da casa pedir explicitamente para delegar. '
        + 'Para o etnaD, informe o workspace; se houver mais de um e não estiver claro qual, pergunte antes.',
      shape: {
        assignee: id().describe('id do agente, por exemplo "etnad"'),
        title: text(200, 1).describe('título curto em português'),
        prompt: text(20_000, 1).describe('o pedido completo, com todo o contexto que o agente precisa'),
        workspace: text(200).optional().describe('nome ou id do workspace (obrigatório para o etnaD quando há mais de um)'),
        priority: priority().optional(),
        quota_ok: bool().optional().describe('true só depois que o dono da casa confirmar que quer gastar a cota que resta'),
      },
      run: (a, ctx) => {
        const assignee = String(a.assignee).toLowerCase();
        if (assignee === 'marvin') return 'Erro: tarefas são para os outros agentes. Responda você mesmo.';
        const warning = a.quota_ok ? null : quotaWarning();
        if (warning) return out({ created: null, needsConfirmation: warning });
        const t = d.tasks.create(
          {
            assignee, title: String(a.title), prompt: String(a.prompt),
            workspaceId: pickWorkspace(assignee, a.workspace), priority: (a.priority as 'low' | 'normal' | 'high') ?? 'normal',
          },
          { kind: 'agent', agentId: 'marvin', conversationId: ctx.conversationId },
        );
        return out({ created: brief(t) });
      },
    },
    {
      name: 'tasks_cancel', group: 'tasks',
      description: 'Cancela uma tarefa. Ação destrutiva: o dono da casa confirma antes.',
      shape: { id: id() },
      run: (a) => out({ cancelled: brief(d.tasks.cancel(String(a.id), 'Cancelada pelo Marvin, a pedido do dono da casa.')) }),
    },
    {
      name: 'tasks_answer', group: 'tasks',
      description: 'Responde, com o texto do dono da casa, à pergunta de uma tarefa em waiting_input.',
      shape: { id: id(), text: text(20_000, 1) },
      run: (a) => out({ task: brief(d.tasks.input(String(a.id), String(a.text), null)) }),
    },
    {
      name: 'memory_list', group: 'memory', reads: true,
      description: 'Lista tudo o que você sabe sobre o dono da casa, com os ids e a data em que foi anotado.',
      shape: {},
      run: () => listOut(d.mind.memories().map((m) => ({ id: m.id, content: m.content, kind: m.kind, saved: m.createdAt.slice(0, 10) })), 'nenhuma memória guardada'),
    },
    {
      name: 'memory_search', group: 'memory', reads: true,
      description: 'Busca nas memórias por palavras do assunto (por exemplo "dentista", "aniversário Ana"). Use antes de dizer que não sabe algo sobre o dono da casa.',
      shape: { query: text(200, 1), limit: num({ min: 1, max: 30, int: true }).optional() },
      run: (a) => {
        const found = d.mind.search(String(a.query), (a.limit as number) ?? 10);
        return listOut(found.map((m) => ({ id: m.id, content: m.content, kind: m.kind, saved: m.createdAt.slice(0, 10) })),
          `nenhuma memória com essas palavras (há ${d.mind.memories().length} guardadas no total)`);
      },
    },
    {
      name: 'memory_add', group: 'memory',
      description: 'Guarda um fato ou preferência duradouro sobre o dono da casa. Escreva datas como data absoluta (22/10/2026), nunca "amanhã" ou "semana que vem".',
      shape: {
        content: text(2000, 1), kind: oneOf(['fact', 'preference'], { fato: 'fact', preferência: 'preference', preferencia: 'preference' }).optional(),
        from_feedback: bool().optional().describe('true quando vier de uma correção do dono da casa'),
      },
      run: (a) => out({ saved: d.mind.addMemory(String(a.content), (a.kind as 'fact' | 'preference') ?? 'fact', a.from_feedback ? 'feedback' : 'marvin') }),
    },
    {
      name: 'memory_update', group: 'memory',
      description: 'Corrige uma memória existente (por exemplo, quando descobrir que ela está desatualizada).',
      shape: { id: id(), content: text(2000, 1) },
      run: (a) => out({ updated: d.mind.updateMemory(String(a.id), { content: String(a.content) }) }),
    },
    {
      name: 'memory_delete', group: 'memory',
      description: 'Apaga uma memória. Ação destrutiva: o dono da casa confirma antes.',
      shape: { id: id() },
      run: (a) => { d.mind.deleteMemory(String(a.id)); return out({ deleted: a.id }); },
    },
    {
      name: 'rules_list', group: 'rules', reads: true,
      description: 'Lista as regras aprendidas, com os ids.',
      shape: {},
      run: () => listOut(d.mind.rules(), 'nenhuma regra aprendida'),
    },
    {
      name: 'rules_add', group: 'rules',
      description: 'Aprende uma regra de comportamento, com gatilho opcional (por exemplo "modo foco").',
      shape: {
        instruction: text(2000, 1), trigger: text(200).optional(),
        from_feedback: bool().optional().describe('true quando vier de uma correção do dono da casa'),
      },
      run: (a) => out({ saved: d.mind.addRule(String(a.instruction), (a.trigger as string | undefined) || null, a.from_feedback ? 'feedback' : 'marvin') }),
    },
    {
      name: 'rules_update', group: 'rules',
      description: 'Altera, liga ou desliga uma regra aprendida.',
      shape: { id: id(), instruction: text(2000, 1).optional(), trigger: text(200).nullable().optional(), enabled: bool().optional() },
      run: (a) => {
        const patch: Record<string, unknown> = {};
        for (const k of ['instruction', 'trigger', 'enabled'] as const) if (a[k] !== undefined) patch[k] = a[k];
        return out({ updated: d.mind.updateRule(String(a.id), patch) });
      },
    },
    {
      name: 'rules_delete', group: 'rules',
      description: 'Apaga uma regra aprendida.',
      shape: { id: id() },
      run: (a) => { d.mind.deleteRule(String(a.id)); return out({ deleted: a.id }); },
    },
    {
      name: 'mode_set', group: 'rules',
      description: 'Liga um modo (por exemplo "foco") ou desliga o modo ativo com name=null.',
      shape: { name: text(40).nullable() },
      run: (a) => {
        const asked = typeof a.name === 'string' ? a.name : '';
        if (!asked || ['nenhum', 'none', 'null', 'desligar'].includes(asked.toLowerCase())) return out({ active: d.mind.setActiveMode(null) });
        // "Foco" e "foco" são o mesmo modo.
        const mode = d.mind.modes().find((m) => m.name.toLowerCase() === asked.toLowerCase());
        return out({ active: d.mind.setActiveMode(mode?.name ?? asked) });
      },
    },
    {
      name: 'mode_define', group: 'rules',
      description: 'Cria ou altera um modo. min_priority define o mínimo de prioridade dos avisos que ainda chegam.',
      shape: { name: text(40, 1), min_priority: priority(), description: text(300) },
      run: (a) => out({ mode: d.mind.defineMode(String(a.name), a.min_priority as 'low' | 'normal' | 'high', String(a.description)) }),
    },
  ];
}
