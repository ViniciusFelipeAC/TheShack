import { type RefObject, useEffect, useRef } from 'react';
import { createScene, type MapName, type SceneHandle, type Weather } from './scene/engine.ts';
import type { SceneAgentInput } from './scene/model.ts';

type Props = {
  agents: SceneAgentInput[];
  focusId: string | null;
  weather: Weather;
  resting: boolean;
  handle: RefObject<SceneHandle | null>;
  onSelect(id: string): void;
  onMap(map: MapName): void;
  onActivity(activity: Record<string, string | null>): void;
};

/** Canvas da casa. O motor roda sozinho; aqui só repassamos o estado real dos agentes. */
export function SceneCanvas({ agents, focusId, weather, resting, handle, onSelect, onMap, onActivity }: Props) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const events = useRef({ onSelect, onMap, onActivity });
  events.current = { onSelect, onMap, onActivity };

  useEffect(() => {
    const el = canvas.current;
    if (!el?.parentElement) return;
    const scene = createScene(el, el.parentElement, {
      onSelect: (id) => events.current.onSelect(id),
      onMap: (m) => events.current.onMap(m),
      onActivity: (a) => events.current.onActivity(a),
    });
    handle.current = scene;
    return () => { scene.destroy(); handle.current = null; };
  }, [handle]);

  // A barra de cima e os cartões cobrem parte da cena; a casa se centraliza no espaço que sobra.
  useEffect(() => {
    const stage = canvas.current?.parentElement;
    if (!stage) return;
    const measure = () => {
      const s = stage.getBoundingClientRect();
      const top = stage.querySelector('.topbar')?.getBoundingClientRect();
      const dock = stage.querySelector('.dock')?.getBoundingClientRect();
      handle.current?.setInsets(top ? top.bottom - s.top : 0, dock?.height ? s.bottom - dock.top : 0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    for (const sel of ['.topbar', '.dock']) { const n = stage.querySelector(sel); if (n) ro.observe(n); }
    measure();
    return () => ro.disconnect();
  }, [handle]);

  useEffect(() => { handle.current?.setAgents(agents); }, [agents, handle]);
  useEffect(() => { handle.current?.setFocus(focusId); }, [focusId, handle]);
  useEffect(() => { handle.current?.setWeather(weather); }, [weather, handle]);
  useEffect(() => { handle.current?.setResting(resting); }, [resting, handle]);

  const summary = agents.length
    ? `Casa de vidro na floresta enevoada, vista de cima, com ${agents.map((a) => a.name).join(', ')}`
    : 'Casa de vidro na floresta enevoada, vista de cima';
  return <canvas ref={canvas} className="scene" role="img" aria-label={summary} />;
}
