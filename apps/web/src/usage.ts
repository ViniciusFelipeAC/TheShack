import type { QuotaWindow } from '@shack/shared';

/** Os nomes das janelas do plano, como o /usage do Claude Code mostra. */
const NAMES: Record<string, string> = {
  five_hour: 'Sessão (5 horas)', seven_day: 'Semana', seven_day_opus: 'Semana do Opus', seven_day_sonnet: 'Semana do Sonnet',
};
const ORDER = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];

export const windowName = (kind: string) => NAMES[kind] ?? (kind.startsWith('model:') ? `Semana do ${kind.slice(6)}` : kind);

/** A sessão e a semana primeiro, depois as janelas por modelo. */
export function orderWindows(list: QuotaWindow[]): QuotaWindow[] {
  const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
  return [...list].sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}

const time = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "renova hoje às 22:20", "renova amanhã às 07:00" ou "renova ter., 02/12 às 07:00". */
export function resetLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  if (days <= 0) return `renova hoje às ${time(d)}`;
  if (days === 1) return `renova amanhã às ${time(d)}`;
  const date = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `renova ${date} às ${time(d)}`;
}

/** Quanto falta: "em 25 min", "em 1h17", "em 3 dias". */
export function untilText(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60_000));
  if (min < 60) return `em ${min} min`;
  if (min < 24 * 60) return `em ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  // Só dias inteiros: 6 dias e 12 horas é "em 6 dias", não "em 7".
  const days = Math.floor(min / (24 * 60));
  return `em ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** "há 1 min", "agora". */
export function agoText(iso: string, now = new Date()): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)}h`;
}

/** Tokens em português: 820, "12,3 mil", "1,2 mi". */
export function tokensText(n: number): string {
  if (n < 1000) return String(n);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (n < 1_000_000) return `${fmt(n / 1000)} mil`;
  return `${fmt(n / 1_000_000)} mi`;
}
