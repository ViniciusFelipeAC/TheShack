import type { AccountInfo, ModelInfo, Query, SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk';
import type { AccountStatus, QuotaStatus, QuotaWindow } from '@shack/shared';
import type { EventBus } from '../core/events.ts';
import { errorMessage } from '../errors.ts';
import { HttpError } from '../errors.ts';

/** Variáveis que fariam o Claude Code cobrar por uso em vez de usar a sua assinatura. */
const BILLING_VARS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_PROFILE',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS',
  'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID',
];
/** Origens de credencial que indicam cobrança por uso (chave de API). */
const PAID_SOURCES = new Set(['ANTHROPIC_API_KEY', 'apiKeyHelper', '/login managed key', 'user', 'project', 'org', 'temporary']);
const RECHECK_MS = 10 * 60_000;
const SEVERITY = { allowed: 0, allowed_warning: 1, rejected: 2 } as const;

/** Janelas do plano que o /usage informa, com os mesmos nomes dos avisos do SDK. */
const PLAN_WINDOWS = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'] as const;
/** Intervalo mínimo entre duas consultas ao uso do plano. */
const PLAN_TTL_MS = 60_000;
/** A partir daqui a janela fica em alerta, e o Renfield confirma antes de mandar tarefa nova ao etnaD. */
const WARN_PERCENT = 90;

type PlanWindow = { utilization: number | null; resets_at: string | null };
/** O que o /usage do Claude Code devolve. O servidor usa o SDK; os testes, uma resposta pronta. */
export type PlanUsageFetcher = () => Promise<{ rate_limits_available: boolean; rate_limits: Record<string, unknown> | null }>;

/** O SDK manda o uso como fração (0 a 1) ou porcentagem; a Shack guarda sempre de 0 a 100. */
export function toPercent(u: number | undefined | null): number | null {
  if (typeof u !== 'number' || !Number.isFinite(u) || u < 0) return null;
  return Math.min(100, u <= 1 ? u * 100 : u);
}

/**
 * Trava de custo zero. O Shack nunca lê nem guarda as suas credenciais: quem autentica é o
 * binário oficial do Claude Code. Aqui só limpamos o ambiente e conferimos o que ele informa.
 */
export class Account {
  #bus: EventBus;
  #checkedAt = 0;
  #clock: () => Date;
  #windows = new Map<string, QuotaWindow>();
  #overage = false;
  #published: string | null = null;
  #status: Omit<AccountStatus, 'quota'> = {
    subscriptionOk: null, subscriptionType: null, credentialSource: null, problem: null,
    availableModels: [], agentModels: {}, checkedAt: null, usageCheckedAt: null, usageError: null,
  };
  #planInFlight: Promise<void> | null = null;

  constructor(bus: EventBus, clock: () => Date = () => new Date()) {
    this.#bus = bus;
    this.#clock = clock;
  }

  /** Conta e cota. A cota é recalculada na hora: janela que já renovou sai da conta. */
  get status(): AccountStatus {
    return { ...this.#status, quota: this.#quota() };
  }

  /** Ambiente do processo do Claude Code, sem nenhuma variável que gere cobrança. */
  cleanEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'the-shack/0.3' };
    for (const key of BILLING_VARS) delete env[key];
    return env;
  }

  /** Lê a conta e os modelos disponíveis a partir de uma sessão já aberta. */
  async inspect(q: Query): Promise<void> {
    if (Date.now() - this.#checkedAt < RECHECK_MS && this.#status.subscriptionOk !== null) return;
    const [info, models] = await Promise.all([q.accountInfo(), q.supportedModels()]);
    this.#apply(info, models);
  }

  #apply(info: AccountInfo, models: ModelInfo[]): void {
    const source = info.apiKeySource ?? info.tokenSource ?? null;
    let problem: string | null = null;
    if (info.apiProvider && info.apiProvider !== 'firstParty') problem = `O Claude Code está configurado para outro provedor (${info.apiProvider}), que cobra por uso.`;
    else if (info.apiKeySource && PAID_SOURCES.has(info.apiKeySource)) problem = `A credencial em uso é uma chave de API (${info.apiKeySource}), que cobra por uso.`;
    else if (!info.subscriptionType) problem = 'Não encontrei um login de assinatura no Claude Code.';
    this.#checkedAt = Date.now();
    this.#status = {
      ...this.#status,
      subscriptionOk: problem === null,
      subscriptionType: info.subscriptionType ?? null,
      credentialSource: source,
      problem,
      availableModels: models.map((m) => ({
        value: m.value, displayName: m.displayName, description: m.description ?? '',
        efforts: m.supportedEffortLevels ?? (m.supportsEffort === false ? [] : null),
      })),
      checkedAt: new Date().toISOString(),
    };
  }

  assertSubscription(): void {
    if (this.#status.subscriptionOk === false) {
      throw new HttpError(409, 'subscription_required',
        `${this.#status.problem} Para continuar sem custo, entre com a sua assinatura usando /login no Claude Code.`);
    }
  }

  /** Primeiro modelo da lista do manifesto que o seu plano oferece. */
  pickModel(agentId: string, preferences: string[], fallback: string): string {
    const available = new Set(this.#status.availableModels.map((m) => m.value));
    const chosen = preferences.find((p) => available.has(p)) ?? (available.has(fallback) ? fallback : (available.size ? 'default' : preferences[0]!));
    this.#status.agentModels[agentId] = chosen;
    return chosen;
  }

  /** Cada aviso de limite do SDK atualiza uma janela (5 horas, 7 dias, por modelo). */
  onRateLimit(info: SDKRateLimitInfo): void {
    const kind = info.rateLimitType ?? 'plano';
    const previous = this.#windows.get(kind);
    const percent = toPercent(info.utilization) ?? (previous?.status === info.status ? previous.percent : null);
    this.#windows.set(kind, {
      kind, status: info.status, percent,
      resetsAt: info.resetsAt ? new Date(info.resetsAt * 1000).toISOString() : null,
      updatedAt: this.#clock().toISOString(),
    });
    if (info.isUsingOverage !== undefined || info.overageInUse !== undefined) this.#overage = Boolean(info.isUsingOverage || info.overageInUse);
    this.#publishIfChanged();
  }

  /**
   * Lê o uso do plano, o mesmo número do /usage do Claude Code: a sessão de 5 horas, a semana e as janelas por modelo.
   * Não gasta modelo. Os avisos do SDK só chegam quando algum agente roda; esta consulta dá o número a qualquer hora.
   * Uma consulta por minuto no máximo, e pedidos simultâneos dividem a mesma.
   */
  refreshPlan(fetch: PlanUsageFetcher, opts: { force?: boolean } = {}): Promise<void> {
    if (this.#planInFlight) return this.#planInFlight;
    const last = this.#status.usageCheckedAt ? Date.parse(this.#status.usageCheckedAt) : 0;
    if (!opts.force && this.#clock().getTime() - last < PLAN_TTL_MS) return Promise.resolve();
    this.#planInFlight = (async () => {
      try {
        const u = await fetch();
        if (!u.rate_limits_available || !u.rate_limits) {
          this.#status.usageError = 'Indisponível: o Claude Code não informou os limites do plano (a credencial é de assinatura?).';
          return;
        }
        const at = this.#clock().toISOString();
        const set = (kind: string, w: PlanWindow | null | undefined) => {
          if (!w) return;
          const percent = typeof w.utilization === 'number' && Number.isFinite(w.utilization) ? Math.max(0, Math.min(100, w.utilization)) : null;
          const status = percent === null ? 'allowed' : percent >= 100 ? 'rejected' : percent >= WARN_PERCENT ? 'allowed_warning' : 'allowed';
          this.#windows.set(kind, { kind, status, percent, resetsAt: w.resets_at ?? null, updatedAt: at });
        };
        const r = u.rate_limits as Record<string, PlanWindow | null | undefined> & { model_scoped?: Array<PlanWindow & { display_name: string }> };
        for (const kind of PLAN_WINDOWS) set(kind, r[kind]);
        for (const m of r.model_scoped ?? []) set(`model:${m.display_name}`, m);
        this.#status.usageError = null;
      } catch (err) {
        this.#status.usageError = `Indisponível: ${errorMessage(err)}`;
      } finally {
        this.#status.usageCheckedAt = this.#clock().toISOString();
        this.#planInFlight = null;
        this.#publishIfChanged();
      }
    })();
    return this.#planInFlight;
  }

  #quota(): QuotaStatus | null {
    const now = this.#clock().getTime();
    // Janela que já renovou não vale mais: o próximo aviso do SDK traz o número novo.
    for (const [kind, w] of this.#windows) if (w.resetsAt && Date.parse(w.resetsAt) <= now) this.#windows.delete(kind);
    const windows = [...this.#windows.values()];
    if (!windows.length) return this.#overage ? { status: 'allowed', kind: null, resetsAt: null, percent: null, windows: [], overage: true } : null;
    const main = [...windows].sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || (b.percent ?? -1) - (a.percent ?? -1))[0]!;
    return { status: main.status, kind: main.kind, resetsAt: main.resetsAt, percent: main.percent, windows, overage: this.#overage };
  }

  /** Avisa os clientes quando o estado muda ou o uso anda 5 pontos, sem inundar o WebSocket. */
  #publishIfChanged(): void {
    const q = this.#quota();
    const stamp = q ? `${q.status}|${q.kind}|${q.percent === null ? '-' : Math.floor(q.percent / 5)}|${q.overage}` : 'none';
    if (stamp === this.#published) return;
    this.#published = stamp;
    this.#bus.publish('system.quota', q);
  }
}
