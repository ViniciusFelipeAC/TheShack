import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { Choice } from './models.ts';

type Props = { label: string; choices: Choice[]; value: string; disabled?: boolean; onPick(value: string): void };

/**
 * Seletor com legenda, como o de modelos do VS Code: cada opção mostra o nome e uma frase embaixo.
 * A lista abre dentro do painel, empurrando o resto, para não ser cortada pela rolagem da gaveta no celular.
 */
export function Picker({ label, choices, value, disabled = false, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const current = choices.find((c) => c.value === value) ?? choices[0]!;

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const pick = (v: string) => {
    setOpen(false);
    button.current?.focus();
    if (v !== value) onPick(v);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Escape fecha só a lista, e não o painel inteiro.
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };

  return (
    <div className="picker" ref={box}>
      <span className="meta" id={`${id}-label`}>{label}</span>
      <button
        ref={button} id={`${id}-btn`} type="button" className="picker-btn" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-btn`} onClick={() => setOpen((o) => !o)}
      >
        <span className="picker-text">
          <span className="strong ellipsis">{current.label}</span>
          {current.hint && <span className="meta ellipsis">{current.hint}</span>}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8" /></svg>
      </button>
      {open && (
        <div role="listbox" aria-labelledby={`${id}-label`} className="picker-list" onKeyDown={onKey}>
          {choices.map((c) => (
            <button key={c.value} type="button" role="option" aria-selected={c.value === value} onClick={() => pick(c.value)}>
              <span className="picker-text">
                <span className="strong">{c.label}</span>
                {c.hint && <span className="meta">{c.hint}</span>}
              </span>
              {c.value === value && <span className="picker-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
