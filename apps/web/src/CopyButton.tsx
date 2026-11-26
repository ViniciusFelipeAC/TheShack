import { useState } from 'react';

/** Copia para a área de transferência. Fora do HTTPS o navegador não deixa; aí vai pelo jeito antigo. */
export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  }
}

/** "Copiar" que avisa por um instante que copiou. */
export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const run = async () => {
    setState((await copy(text)) ? 'ok' : 'fail');
    setTimeout(() => setState('idle'), 1800);
  };
  return <button className="btn small" type="button" onClick={run}>{state === 'ok' ? 'Copiado' : state === 'fail' ? 'Não deu para copiar' : label}</button>;
}
