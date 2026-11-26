/* Contas da grade de hábitos, como os quadradinhos de commits do GitHub. Sem React, para testar no Node. */
import type { Habit, HabitColor } from '@shack/shared';
import { dayKey, dayTitle } from './board.ts';

/** Um ano de colunas, como no GitHub. No celular a grade rola de lado e abre já no fim, em hoje. */
export const WEEKS = 53;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const COLOR_NAMES: Record<HabitColor, string> = { moss: 'musgo', amber: 'âmbar', sky: 'céu', rose: 'rosa', violet: 'violeta', sand: 'areia' };

/**
 * Semanas em colunas, de domingo a sábado, terminando na semana de hoje. A última coluna para em hoje:
 * dia que ainda não chegou não tem quadradinho.
 */
export function habitWeeks(today: Date, weeks = WEEKS): string[][] {
  const end = dayKey(today);
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => dayKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + d)))
    .filter((key) => key <= end));
}

/** O mês em cima da coluna em que ele começa. O primeiro sai se o segundo vier colado: não cabem os dois. */
export function monthLabels(weeks: string[][]): Array<{ col: number; label: string }> {
  const out: Array<{ col: number; label: string }> = [];
  let prev = '';
  weeks.forEach((week, col) => {
    const month = week[0]!.slice(0, 7);
    if (month === prev) return;
    prev = month;
    out.push({ col, label: MONTHS[Number(month.slice(5)) - 1]! });
  });
  if (out.length > 1 && out[1]!.col - out[0]!.col < 3) out.shift();
  return out;
}

const days = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** "Sequência de 5 dias · recorde de 12 dias · 120 dias no último ano". Só conta no ano o que aparece na grade. */
export function habitStats(h: Pick<Habit, 'streak' | 'best' | 'days'>, from: string): string {
  if (!h.best) return 'Nenhum dia marcado ainda';
  const shown = h.days.filter((d) => d >= from).length;
  return [h.streak ? `Sequência de ${days(h.streak)}` : 'Sem sequência agora', `recorde de ${days(h.best)}`, `${days(shown)} no último ano`].join(' · ');
}

/** Texto do quadradinho para leitor de tela e para o mouse em cima. */
export const cellLabel = (key: string, done: boolean): string => `${dayTitle(key)}: ${done ? 'feito' : 'não feito'}`;

/** Próximo quadradinho com as setas: esquerda e direita andam uma semana, cima e baixo um dia. Nunca passa de hoje. */
export function stepDay(key: string, arrow: string, first: string, last: string): string | null {
  const delta = ({ ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[arrow];
  if (!delta) return null;
  const [y, m, d] = key.split('-').map(Number);
  const next = dayKey(new Date(y!, m! - 1, d! + delta));
  return next < first || next > last ? key : next;
}
