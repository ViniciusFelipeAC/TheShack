import { useEffect, useRef, useState } from 'react';

/**
 * Itens que apareceram desde a última leitura, para piscarem quando o Renfield mexe pelo chat.
 * Trocar de `scope` (de mês, por exemplo) não conta como novidade.
 */
export function useFresh(ids: string[] | null, scope: string): Set<string> {
  const seen = useRef<{ scope: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const sig = ids?.join('|') ?? null;
  useEffect(() => {
    if (!ids) return;
    const prev = seen.current;
    seen.current = { scope, ids: new Set(ids) };
    if (!prev || prev.scope !== scope) return;
    const added = ids.filter((id) => !prev.ids.has(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 2600);
    return () => clearTimeout(t);
  }, [sig, scope]);
  return fresh;
}
