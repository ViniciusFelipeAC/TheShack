import { join, resolve } from 'node:path';
import { runnerOf, type Task } from '@shack/shared';
import { CodeRunner } from './agents/code-runner.ts';
import { DesignRunner, designProblem } from './agents/design-runner.ts';
import { simulatedRunner } from './agents/simulated.ts';
import { TextRunner } from './agents/text-runner.ts';
import { type CalendarProvider, LocalCalendar } from './assistant/calendar.ts';
import { Habits } from './assistant/habits.ts';
import { Lists, Notes } from './assistant/organizer.ts';
import { Reminders } from './assistant/reminders.ts';
import { Scheduler, Timers } from './assistant/timers.ts';
import { Auth } from './auth/tokens.ts';
import { type Config, ROOT } from './config.ts';
import { AgentSettingsStore } from './core/agent-settings.ts';
import { Approvals } from './core/approvals.ts';
import { EventBus } from './core/events.ts';
import { type AgentDef, Registry } from './core/registry.ts';
import { autoReview, isTextAgent, startPointOf } from './core/reviews.ts';
import { type AgentRunner, TaskBus } from './core/task-bus.ts';
import { Workspaces } from './core/workspaces.ts';
import { type Db, openDb } from './db/database.ts';
import { chatRepo, mindRepo } from './db/renfield-repos.ts';
import { approvalsRepo, devicesRepo, eventsRepo, tasksRepo } from './db/repos.ts';
import { Account, type PlanUsageFetcher } from './renfield/account.ts';
import { sdkPlanUsage } from './system/usage.ts';
import { assistantTools } from './renfield/assistant-tools.ts';
import { Attachments } from './renfield/attachments.ts';
import { ChatService } from './renfield/chat.ts';
import { type ChatEngine, SdkEngine } from './renfield/engine.ts';
import { Mind } from './renfield/mind.ts';
import { renfieldTools } from './renfield/tools.ts';
import { Notifier } from './notifications/notifier.ts';
import { type PushSender, WebPush } from './notifications/push.ts';

export type Shack = {
  config: Config;
  db: Db;
  bus: EventBus;
  registry: Registry;
  agentSettings: AgentSettingsStore;
  approvals: Approvals;
  tasks: TaskBus;
  workspaces: Workspaces;
  auth: Auth;
  mind: Mind;
  account: Account;
  chat: ChatService;
  attachments: Attachments;
  calendar: CalendarProvider;
  reminders: Reminders;
  timers: Timers;
  lists: Lists;
  notes: Notes;
  habits: Habits;
  notifier: Notifier;
  push: WebPush;
  scheduler: Scheduler;
  /** Consulta o uso do plano (o /usage do Claude Code). Os testes trocam por uma resposta pronta. */
  planUsage: PlanUsageFetcher;
  close(): void;
};

export type ShackOptions = {
  runner?: AgentRunner;
  engine?: ChatEngine;
  progressThrottleMs?: number;
  /** Relógio usado pelo agendador (os testes avançam o tempo à mão). */
  clock?: () => Date;
  /** Falso nos testes: o agendador só anda quando o teste chama `scheduler.tick()`. */
  startScheduler?: boolean;
  /** Substitui o envio real de push (testes). */
  pushSender?: PushSender;
  /** Substitui a consulta real ao uso do plano (testes). */
  planUsage?: PlanUsageFetcher;
};

/** Monta o sistema a partir da configuração. Usado pelo servidor, pelos scripts e pelos testes. */
export function createShack(config: Config, opts: ShackOptions = {}): Shack {
  const db = openDb(config.dbPath);
  const bus = new EventBus(db, eventsRepo(db));
  // Um agente do runner design sem navegador, ou com uma skill que não existe, fica desativado com o motivo.
  const registry = new Registry(config.agentsDir, bus, (m) => designProblem(m, config));
  registry.load({ silent: true });
  const agentSettings = new AgentSettingsStore(db, bus);
  const clock = opts.clock ?? (() => new Date());
  const tz = config.timezone;

  const approvals = new Approvals(db, approvalsRepo(db), bus);
  const workspaces = new Workspaces(db, [ROOT]);
  const account = new Account(bus, clock);
  const taskRepo = tasksRepo(db);
  const simulated = simulatedRunner();
  // Uma correção parte do branch que a Mina conferiu.
  const code = new CodeRunner({ account, workspaces, fallbackModel: config.fallbackModel, startFrom: (t) => startPointOf(t, taskRepo) });
  const text = new TextRunner({
    account, workspaces, tasks: taskRepo, fallbackModel: config.fallbackModel, tmpDir: config.tmpDir,
    workDir: (id) => resolve(ROOT, 'data', 'agents', id),
    agentLabel: (id) => { const m = registry.get(id)?.manifest; return { name: m?.name ?? id, article: m?.article ?? 'o' }; },
    isPromptAgent: (id) => isTextAgent(registry, id),
  });
  const design = new DesignRunner({
    account, workspaces, tasks: taskRepo, fallbackModel: config.fallbackModel,
    designDir: config.designDir, pluginDir: config.pluginDir, browserPath: config.browserPath,
  });
  // O manifesto escolhe o runner: code é o Claude Code com git (o etnaD), text só lê e escreve texto (a Mina),
  // design desenha imagens (o Harker). none só conversa.
  const runnerFor = (agent: AgentDef): AgentRunner | null => {
    if (opts.runner) return opts.runner;
    const kind = agent.manifest ? runnerOf(agent.manifest) : 'none';
    if (kind === 'none') return null;
    if (config.runner === 'simulated') return simulated;
    return kind === 'text' ? text : kind === 'design' ? design : code;
  };

  // Anexos do chat, que também podem ir para uma tarefa de imagens. Os que ninguém usou em 24 horas saem já na partida.
  const attachments = new Attachments(db, config.uploadsDir, clock);
  attachments.prune();

  const tasks = new TaskBus({
    db, repo: taskRepo, bus, approvals, registry, runnerFor, agentSettings,
    workspaceExists: (id) => workspaces.get(id) !== null,
    stageAttachments: (taskId, ids) => { attachments.copyTo(ids, join(config.designDir, taskId, 'input')); },
    progressThrottleMs: opts.progressThrottleMs,
  });
  const auth = new Auth(devicesRepo(db));
  const mind = new Mind(mindRepo(db));
  // A cena e as telas mostram o modo ativo; avisa quando ele muda, pelo chat ou pelas configurações.
  mind.onModeChange((_prev, next) => bus.publish('mode.changed', { active: next }));

  // Assistente: notificações, agenda, lembretes, timers, listas, notas e hábitos.
  const push = new WebPush(db, { sender: opts.pushSender });
  const notifier = new Notifier(db, bus, mind, push);
  const calendar = new LocalCalendar(db, tz, () => bus.publish('data.changed', { entity: 'calendar' }));
  const reminders = new Reminders({ db, bus, notifier, timezone: tz, clock });
  const timers = new Timers({ db, bus, notifier, clock });
  const lists = new Lists(db, bus);
  const notes = new Notes(db, bus);
  const habits = new Habits({ db, bus, timezone: tz, clock });
  const scheduler = new Scheduler(reminders, timers, clock);

  const conversations = chatRepo(db);
  const engine = opts.engine ?? new SdkEngine({
    agentId: 'renfield',
    tools: [...renfieldTools({
      tasks, registry, mind, workspaces, account,
      // As fotos que o dono da casa mandou para o Harker: as da mensagem mais recente que tem anexos.
      recentAttachments: (id) => conversations.messages(id, 6).filter((m) => m.role === 'user' && m.attachments.length).at(-1)?.attachments ?? [],
    }), ...assistantTools({ calendar, reminders, timers, lists, notes, habits, notifier, timezone: tz })],
    account,
    approvals,
    fallbackModel: config.fallbackModel,
    workDir: resolve(ROOT, 'data', 'agents', 'renfield'),
    sessionStore: { get: (id) => conversations.sessionId(id), set: (id, s) => conversations.setSessionId(id, s) },
  });
  const chat = new ChatService({ repo: conversations, bus, tasks, registry, approvals, mind, workspaces, engine, timezone: tz, attachments, agentSettings });

  bus.subscribe((e) => {
    // Manifesto mudou (por exemplo, a concorrência): tenta despachar de novo.
    if (e.type === 'agent.updated') tasks.dispatch();
    // O que nasceu de um prompt da Mina e terminou bem volta para ela conferir.
    if (e.type === 'task.done') autoReview(e.data as Task, { tasks, repo: taskRepo, registry });
    // Tarefas de outros agentes também viram notificação, além do aviso no chat.
    if (e.type === 'task.done' || e.type === 'task.failed' || e.type === 'task.waiting_input') {
      const t = e.data as Task;
      if (t.assignee === 'renfield') return;
      const name = registry.get(t.assignee)?.manifest?.name ?? t.assignee;
      const suspect = e.type === 'task.done' && t.result?.verification?.status === 'suspect';
      const review = e.type === 'task.done' ? t.result?.review : undefined;
      const n = suspect ? { title: `${name} concluiu, mas o resultado é suspeito`, priority: 'high' as const }
        : review ? { title: `${name} conferiu: ${review.verdict === 'pass' ? 'tudo certo' : 'há pendências'}`, priority: 'normal' as const }
        : e.type === 'task.done' ? { title: `${name} concluiu`, priority: 'normal' as const }
          : e.type === 'task.failed' ? { title: `${name} não conseguiu concluir`, priority: 'normal' as const } : { title: `${name} precisa de você`, priority: 'high' as const };
      const body = suspect ? `${t.title}\n${t.result!.verification!.reason}` : t.title;
      notifier.notify({ ...n, body, kind: 'task', refId: t.id });
    }
  });

  bus.prune(config.eventRetentionDays);
  tasks.recover();
  if (opts.startScheduler !== false) scheduler.start();

  return {
    config, db, bus, registry, agentSettings, approvals, tasks, workspaces, auth, mind, account, chat, attachments,
    calendar, reminders, timers, lists, notes, habits, notifier, push, scheduler,
    planUsage: opts.planUsage ?? sdkPlanUsage(() => account.cleanEnv(), resolve(ROOT, 'data')),
    close() { scheduler.stop(); engine.reset(); tasks.shutdown(); db.close(); },
  };
}
