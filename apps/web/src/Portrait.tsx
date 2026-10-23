import { useEffect, useRef } from 'react';
import { buildCharacter, paintPortrait, type Sprites } from './scene/characters.ts';
import { lookOf } from './scene/model.ts';

const cache = new Map<string, Sprites>();

function spritesFor(id: string, appearance: Record<string, unknown>): Sprites {
  const key = `${id}|${JSON.stringify(appearance)}`;
  let s = cache.get(key);
  if (!s) { s = buildCharacter(lookOf(id, appearance)); cache.set(key, s); }
  return s;
}

/** Rostinho do agente em pixel art, o mesmo personagem que anda pela casa. */
export function Portrait({ id, appearance, className = 'portrait' }: { id: string; appearance: Record<string, unknown>; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const look = JSON.stringify(appearance);
  useEffect(() => {
    // a aparência entra pela assinatura em texto, para não redesenhar a cada render
    if (ref.current) paintPortrait(ref.current, spritesFor(id, JSON.parse(look) as Record<string, unknown>));
  }, [id, look]);
  return <canvas ref={ref} className={className} width={16} height={16} aria-hidden="true" />;
}
