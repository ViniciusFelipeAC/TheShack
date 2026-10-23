import { z } from 'zod';

/**
 * Schemas tolerantes para as ferramentas do Marvin. O modelo erra parâmetros com frequência, e cada
 * rejeição custa uma ida e volta na cota. Aqui o valor é ajustado (limitado, aparado, convertido) e
 * só é rejeitado quando não tem conserto. O JSON Schema que o modelo vê continua o tipo certo.
 */

const trimmed = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

/** Número limitado a [min, max]. Aceita "5", "2,5" e arredonda quando precisa ser inteiro. */
export function num(o: { min: number; max: number; int?: boolean }) {
  const base = o.int ? z.number().int() : z.number();
  return z.preprocess((v) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return v;
    return Math.min(o.max, Math.max(o.min, o.int ? Math.round(n) : n));
  }, base.min(o.min).max(o.max));
}

/** Texto aparado e cortado no máximo, em vez de recusado por ser longo. Números viram texto. */
export function text(max: number, min = 0) {
  return z.preprocess((v) => {
    if (typeof v === 'number') return String(v);
    return typeof v === 'string' ? v.trim().slice(0, max) : v;
  }, min > 0 ? z.string().min(min).max(max) : z.string().max(max));
}

/** Identificador: aparado; número vira texto. */
export function id() {
  return z.preprocess((v) => (typeof v === 'number' ? String(v) : trimmed(v)), z.string().min(1));
}

const TRUE = new Set(['true', 'sim', 's', 'yes', 'y', '1', 'verdadeiro']);
const FALSE = new Set(['false', 'não', 'nao', 'n', 'no', '0', 'falso']);

/** Booleano que aceita "true", "sim", "não", 1 e 0. */
export function bool() {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (TRUE.has(t)) return true;
      if (FALSE.has(t)) return false;
    }
    if (v === 1) return true;
    if (v === 0) return false;
    return v;
  }, z.boolean());
}

/** Enum sem diferença de maiúsculas, com apelidos em português (por exemplo "alta" para "high"). */
export function oneOf<const T extends readonly [string, ...string[]]>(values: T, aliases: Record<string, T[number]> = {}) {
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim().toLowerCase();
    return aliases[t] ?? t;
  }, z.enum(values));
}

export const priority = () => oneOf(['low', 'normal', 'high'], {
  baixa: 'low', baixo: 'low', média: 'normal', media: 'normal', medium: 'normal', alta: 'high', alto: 'high', urgente: 'high', urgent: 'high',
});

/** Lista de textos. Aceita uma string só, separada por vírgula, ponto e vírgula ou quebra de linha. */
export function textList(o: { maxItems: number; maxLength: number }) {
  return z.preprocess((v) => {
    const items = typeof v === 'string' ? v.split(/[\n,;]/) : Array.isArray(v) ? v : null;
    if (!items) return v;
    return items
      .map((x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim().slice(0, o.maxLength) : x))
      .filter((x) => x !== '')
      .slice(0, o.maxItems);
  }, z.array(z.string().min(1).max(o.maxLength)).min(1).max(o.maxItems));
}

const BR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(?:às\s+)?(\d{1,2})[:h](\d{2}))?$/i;

/** Data e hora: aparada; aceita também "22/10/2026 08:00" e "22/10/2026 às 8h30", que viram ISO. */
export function when() {
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    const m = t.match(BR_DATE);
    if (!m) return t.replace(/^(\d{4}-\d{2}-\d{2})t/, '$1T');
    const pad = (s: string) => s.padStart(2, '0');
    return `${m[3]}-${pad(m[2]!)}-${pad(m[1]!)}${m[4] ? `T${pad(m[4])}:${m[5]}` : ''}`;
  }, z.string().min(1));
}
