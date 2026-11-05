import { resolve } from 'node:path';
import type { Task } from '@shack/shared';
import { CodeRunner } from './agents/code-runner.ts';
import { simulatedRunner } from './agents/simulated.ts';
import { type CalendarProvider, LocalCalendar } from './assistant/calendar.ts';
import { Lists, Notes } from './assistant/organizer.ts';
import { Reminders } from './assistant/reminders.ts';
import { Scheduler, Timers } from './assistant/timers.ts';
import { Auth } from './auth/tokens.ts';
import { type Config, ROOT } from './config.ts';
import { Approvals } from './core/approvals.ts';
import { EventBus } from './core/events.ts';
import { type AgentDef, Registry } from './core/registry.ts';
import { type AgentRunner, TaskBus } from './core/task-bus.ts';
import { Workspaces } from './core/workspaces.ts';
import { type Db, openDb } from './db/database.ts';
import { chatRepo, mindRepo } from './db/renfield-repos.ts';
import { approvalsRepo, devicesRepo, eventsRepo, tasksRepo } from './db/repos.ts';
import { Account } from './renfield/account.ts';
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
  notifier: Notifier;
  push: WebPush;
  scheduler: Scheduler;
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
};

/** Monta o sistema a partir da configuração. Usado pelo servidor, pelos scripts e pelos testes. */
export function createShack(config: Config, opts: ShackOptions = {}): Shack {
  const db = openDb(config.dbPath);
  const bus = new EventBus(db, eventsRepo(db));
  const registry = new Registry(config.agentsDir, bus);
  registry.load({ silent: true });
  const clock = opts.clock ?? (() => new Date());
  const tz = config.timezone;

  const approvals = new Approvals(db, approvalsRepo(db), bus);
  const workspaces = new Workspaces(db, [ROOT]);
  const account = new Account(bus, clock);
  const simulated = simulatedRunner();
  const code = new CodeRunner({ account, workspaces, fallbackModel: config.fallbackModel });
  // Agentes com ferramentas de código (o etnaD) usam o Claude Code. Os demais não executam tarefas.
  const runnerFor = (agent: AgentDef): AgentRunner | null => {
    if (opts.runner) return opts.runner;
    if (!agent.manifest?.tools.builtin.length) return null;
    return config.runner === 'simulated' ? simulated : code;
  };
  const tasks = new TaskBus({
    db, repo: tasksRepo(db), bus, approvals, registry, runnerFor,
    workspaceExists: (id) => workspaces.get(id) !== null,
    progressThrottleMs: opts.progressThrottleMs,
  });
  const auth = new Auth(devicesRepo(db));
  const mind = new Mind(mindRepo(db));
  // A cena e as telas mostram o modo ativo; avisa quando ele muda, pelo chat ou pelas configurações.
  mind.onModeChange((_prev, next) => bus.publish('mode.changed', { active: next }));

  // Assistente: notificações, agenda, lembretes, timers, listas e notas.
  const push = new WebPush(db, { sender: opts.pushSender });
  const notifier = new Notifier(db, bus, mind, push);
  const calendar = new LocalCalendar(db, tz, () => bus.publish('data.changed', { entity: 'calendar' }));
  const reminders = new Reminders({ db, bus, notifier, timezone: tz, clock });
  const timers = new Timers({ db, bus, notifier, clock });
  const lists = new Lists(db, bus);
  const notes = new Notes(db, bus);
  const scheduler = new Scheduler(reminders, timers, clock);

  // Anexos do chat. Os que ninguém usou em 24 horas saem já na partida.
  const attachments = new Attachments(db, config.uploadsDir, clock);
  attachments.prune();

  const conversations = chatRepo(db);
  const engine = opts.engine ?? new SdkEngine({
    agentId: 'renfield',
    tools: [...renfieldTools({ tasks, registry, mind, workspaces, account }), ...assistantTools({ calendar, reminders, timers, lists, notes, notifier, timezone: tz })],
    account,
    approvals,
    fallbackModel: config.fallbackModel,
    workDir: resolve(ROOT, 'data', 'agents', 'renfield'),
    sessionStore: { get: (id) => conversations.sessionId(id), set: (id, s) => conversations.setSessionId(id, s) },
  });
  const chat = new ChatService({ repo: conversations, bus, tasks, registry, approvals, mind, workspaces, engine, timezone: tz, attachments });

  bus.subscribe((e) => {
    // Manifesto mudou (por exemplo, a concorrência): tenta despachar de novo.
    if (e.type === 'agent.updated') tasks.dispatch();
    // Tarefas de outros agentes também viram notificação, além do aviso no chat.
    if (e.type === 'task.done' || e.type === 'task.failed' || e.type === 'task.waiting_input') {
      const t = e.data as Task;
      if (t.assignee === 'renfield') return;
      const name = registry.get(t.assignee)?.manifest?.name ?? t.assignee;
      const suspect = e.type === 'task.done' && t.result?.verification?.status === 'suspect';
      const n = suspect ? { title: `${name} concluiu, mas o resultado é suspeito`, priority: 'high' as const }
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
    config, db, bus, registry, approvals, tasks, workspaces, auth, mind, account, chat, attachments,
    calendar, reminders, timers, lists, notes, notifier, push, scheduler,
    close() { scheduler.stop(); engine.reset(); tasks.shutdown(); db.close(); },
  };
}
