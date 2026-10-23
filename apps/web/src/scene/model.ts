/* Como o estado real de cada agente vira comportamento na cena, e o manifesto vira aparência. */
import type { AgentInfo } from '@shack/shared';
import type { PoiKind, StationKind } from './layout.ts';
import { hashSeed, rng, shade } from './pixel.ts';

export type SceneAgentInput = Pick<AgentInfo, 'id' | 'name' | 'status' | 'currentTaskId' | 'chat' | 'appearance'>;
export type SceneState = 'idle' | 'working' | 'waiting' | 'error';

/**
 * Trabalhando vai para a mesa; esperando fica de pé com o balão "?"; erro senta com o LED vermelho.
 * Um agente de chat que só está respondendo você não vai até a mesa: ele mostra o balão de digitando onde estiver.
 */
export function sceneStateOf(a: Pick<AgentInfo, 'status' | 'chat' | 'currentTaskId'>): { state: SceneState; talking: boolean } {
  switch (a.status) {
    case 'working': return a.chat && !a.currentTaskId ? { state: 'idle', talking: true } : { state: 'working', talking: false };
    case 'waiting_input': return { state: 'waiting', talking: false };
    case 'error': return { state: 'error', talking: false };
    default: return { state: 'idle', talking: false };
  }
}

export const stationKindOf = (appearance: Record<string, unknown>): StationKind =>
  appearance.station === 'dual-monitor' ? 'dual' : 'single';

/** Ordem das mesas: agentes de chat primeiro, depois a ordem do servidor. */
export function houseOrder<T extends Pick<AgentInfo, 'chat'>>(agents: T[]): T[] {
  return [...agents.filter((a) => a.chat), ...agents.filter((a) => !a.chat)];
}

const IDLE_KIND: Record<string, PoiKind> = {
  tea: 'coffee', coffee: 'coffee', 'sofa-read': 'sofa', sofa: 'sofa', fireplace: 'fire', bookshelf: 'shelf',
  'water-plant': 'plant', plant: 'plant', window: 'window', armchair: 'armchair',
};

/** Lugares preferidos quando o agente está ocioso, a partir de `appearance.idle`. */
export function idleKinds(appearance: Record<string, unknown>): PoiKind[] {
  const list = Array.isArray(appearance.idle) ? appearance.idle : [];
  return [...new Set(list.map((v) => IDLE_KIND[String(v)]).filter((k): k is PoiKind => Boolean(k)))];
}

export const prefersTea = (appearance: Record<string, unknown>): boolean =>
  Array.isArray(appearance.idle) && appearance.idle.includes('tea') && !appearance.idle.includes('coffee');

export type Look = {
  skin: string; hair: string; temples: string | null; hairStyle: 'neat' | 'messy';
  outfit: string; sleeve: string; shirt: string; accent: string;
  accessory: 'bowtie' | 'headphones' | 'none'; pants: string; shoes: string;
};

const SKINS = ['#f1c9a5', '#e3b896', '#c08560', '#9c6644', '#6f4a33'];
const HAIRS = ['#26252b', '#1a1614', '#5a3a26', '#a0683a', '#d9c08a', '#8d8d95'];
const OUTFITS = ['#22252d', '#2c3b36', '#3b2c4a', '#4a2f2a', '#2e3e55', '#3d4a2f'];
const ACCENTS = ['#7a2a2e', '#e8a75a', '#8fb3d9', '#8cc29b', '#c9a0dc'];
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Aparência a partir do manifesto. Cores que faltarem saem do id do agente,
 * então cada agente novo ganha um visual próprio e estável.
 */
export function lookOf(id: string, appearance: Record<string, unknown>): Look {
  const raw = (appearance.palette ?? {}) as Record<string, unknown>;
  const pick = (key: string): string | null => (typeof raw[key] === 'string' && HEX.test(raw[key] as string) ? (raw[key] as string) : null);
  const r = rng(hashSeed(id));
  const from = (list: string[]) => list[Math.floor(r() * list.length)];
  const skin = pick('skin') ?? from(SKINS), hair = pick('hair') ?? from(HAIRS);
  const outfit = pick('outfit') ?? from(OUTFITS), accent = pick('accent') ?? from(ACCENTS);
  const accessory = appearance.accessory === 'bowtie' || appearance.accessory === 'headphones' ? appearance.accessory : 'none';
  const sleeve = pick('sleeve') ?? (accessory === 'bowtie' ? '#d9d6cf' : outfit);
  return {
    skin, hair, outfit, accent, accessory, sleeve,
    temples: pick('temples'),
    hairStyle: appearance.hair === 'messy' ? 'messy' : 'neat',
    shirt: pick('shirt') ?? sleeve,
    pants: pick('pants') ?? shade(outfit, -0.22),
    shoes: pick('shoes') ?? '#121317',
  };
}
