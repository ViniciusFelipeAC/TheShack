import type { AgentInfo, QuotaStatus } from '@shack/shared';
import { useEffect, useRef, useState } from 'react';
import { nowText, STATUS_TEXT } from './AgentPanel.tsx';
import type { Connection } from './live.ts';
import { Portrait } from './Portrait.tsx';
import type { MapName, Weather } from './scene/engine.ts';

export type Section = 'quadro' | 'agenda' | 'lembretes' | 'listas' | 'notas';
export const SECTIONS: Array<[Section, string]> = [['quadro', 'Quadro'], ['agenda', 'Agenda'], ['lembretes', 'Lembretes e timers'], ['listas', 'Listas'], ['notas', 'Notas']];
const WEATHER_TEXT: Record<Weather, string> = { fog: 'Neblina', rain: 'Chuva', clear: 'Céu fechado' };
const CONNECTION_TEXT: Record<Connection, string> = { online: 'Conectado', connecting: 'Conectando…', offline: 'Sem conexão' };

let spClock: Intl.DateTimeFormat | null = null;
try { spClock = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); } catch { /* sem fusos */ }

function useClock(): string {
  const fmt = () => (spClock ?? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })).format(new Date());
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setNow(fmt()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type TopBarProps = {
  connection: Connection;
  mode: string | null;
  weather: Weather;
  map: MapName;
  unread: number;
  quota: QuotaStatus | null;
  /** Memórias e regras novas que você ainda não revisou. */
  toReview: number;
  onToggleMap(): void;
  onBell(): void;
  onSection(s: Section): void;
  onWeather(w: Weather): void;
  onSettings(): void;
  onHelp(): void;
  onLogout(): void;
};

/** Barra de cima: nome, hora de São Paulo, conexão e as ações da casa. */
export function TopBar(p: TopBarProps) {
  const now = useClock();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menu]);
  const pick = (fn: () => void) => () => { setMenu(false); fn(); };

  return (
    <header className="topbar">
      <div className="brand-box glass">
        <b>THE SHACK</b>
        <span>
          <i className={`dot ${p.connection}`} title={CONNECTION_TEXT[p.connection]} aria-label={CONNECTION_TEXT[p.connection]} />
          {now}<span className="long"> · {WEATHER_TEXT[p.weather]} · São Paulo</span>
          {p.mode && <span className="mode-pill">Modo {p.mode}</span>}
          <QuotaMeter quota={p.quota} />
        </span>
      </div>
      <div className="actions" ref={box}>
        <button className="tbtn" type="button" onClick={p.onToggleMap}>
          {p.map === 'in'
            ? <><span className="long">Ver lá fora</span><span className="short">Lá fora</span></>
            : <><span className="long">Voltar para dentro</span><span className="short">Entrar</span></>}
        </button>
        <button className="tbtn" type="button" onClick={p.onBell} aria-label={`Avisos: ${p.unread} não lidos`}>
          Avisos{p.unread > 0 && <span className="badge">{p.unread > 99 ? '99+' : p.unread}</span>}
        </button>
        <button className="tbtn" type="button" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
          Menu{p.toReview > 0 && <i className="dot review" aria-label={`${p.toReview} itens para revisar`} />}
        </button>
        {menu && (
          <div className="menu glass" role="menu">
            {SECTIONS.map(([id, label]) => <button key={id} type="button" role="menuitem" onClick={pick(() => p.onSection(id))}>{label}</button>)}
            <hr />
            <div className="menu-field">
              <span className="muted small">Clima da cena</span>
              <div className="seg">
                {(['fog', 'rain', 'clear'] as const).map((w) => (
                  <button key={w} type="button" aria-pressed={p.weather === w} onClick={() => p.onWeather(w)}>{WEATHER_TEXT[w]}</button>
                ))}
              </div>
            </div>
            <hr />
            <button type="button" role="menuitem" onClick={pick(p.onSettings)}>
              Configurações{p.toReview > 0 && <span className="badge" title="Memórias e regras novas para revisar">{p.toReview}</span>}
            </button>
            <button type="button" role="menuitem" onClick={pick(p.onHelp)}>Como usar</button>
            <button type="button" role="menuitem" onClick={pick(p.onLogout)}>Sair deste dispositivo</button>
          </div>
        )}
      </div>
    </header>
  );
}

const WINDOW_TEXT: Record<string, string> = {
  five_hour: 'janela de 5 horas', seven_day: 'janela de 7 dias', seven_day_opus: 'janela de 7 dias do Opus', seven_day_sonnet: 'janela de 7 dias do Sonnet',
};

/** Uso da cota do plano, sempre à vista. Sem número do SDK, diz "sem dados" em vez de fingir 0%. */
export function QuotaMeter({ quota }: { quota: QuotaStatus | null }) {
  const pct = quota?.percent ?? null;
  const state = quota?.status ?? 'unknown';
  const label = !quota ? 'Cota: sem dados' : quota.status === 'rejected' ? 'Cota esgotada' : pct === null ? 'Cota: sem dados' : `Cota ${Math.round(pct)}%`;
  const short = !quota || (pct === null && quota.status !== 'rejected') ? '–' : quota.status === 'rejected' ? 'esgotada' : `${Math.round(pct!)}%`;
  const title = !quota
    ? 'O uso da cota aparece depois da primeira resposta do Renfield ou do etnaD.'
    : [
      quota.kind ? `Medido na ${WINDOW_TEXT[quota.kind] ?? quota.kind}.` : null,
      quota.resetsAt ? `Renova em ${new Date(quota.resetsAt).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : null,
      quota.status === 'allowed_warning' ? 'Perto do limite.' : null,
    ].filter(Boolean).join(' ');
  return (
    <span className="quota" data-state={state} title={title} aria-label={`${label}. ${title}`}>
      <span className="qbar"><span style={{ width: `${quota?.status === 'rejected' ? 100 : Math.max(0, Math.min(100, pct ?? 0))}%` }} /></span>
      <span className="qtext"><span className="long">{label}</span><span className="short">{short}</span></span>
    </span>
  );
}

/** Cartões dos agentes no canto da cena. Tocar abre o painel. */
export function Dock({ agents, activity, focusId, onSelect }: {
  agents: AgentInfo[]; activity: Record<string, string | null>; focusId: string | null; onSelect(id: string): void;
}) {
  return (
    <div className="dock" aria-label="Agentes">
      {agents.map((a) => (
        <button key={a.id} type="button" className="acard" data-state={a.status} aria-pressed={focusId === a.id} onClick={() => onSelect(a.id)}>
          <Portrait id={a.id} appearance={a.appearance} />
          <span className="who">
            <span className="name">{a.name}</span>
            <span className="pill" data-state={a.status}>{STATUS_TEXT[a.status]}</span>
            <span className="act">{nowText(a, activity[a.id])}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Zoom({ onZoom }: { onZoom(step: number): void }) {
  return (
    <div className="zoom">
      <button className="tbtn" type="button" aria-label="Aproximar" onClick={() => onZoom(1)}>+</button>
      <button className="tbtn" type="button" aria-label="Afastar" onClick={() => onZoom(-1)}>−</button>
    </div>
  );
}

export function Welcome({ onClose }: { onClose(): void }) {
  const go = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { go.current?.focus(); }, []);
  return (
    <div className="welcome" onClick={onClose}>
      <div className="wcard glass" role="dialog" aria-modal="true" aria-labelledby="wTitle" onClick={(e) => e.stopPropagation()}>
        <h2 id="wTitle">Bem-vindo à Shack</h2>
        <ul>
          <li><b>1</b><span><strong>Fale com o Renfield</strong> no chat ao lado (no celular, embaixo). Ele cuida da agenda, dos lembretes e das listas, e passa trabalho para os outros agentes.</span></li>
          <li><b>2</b><span><strong>Veja a casa trabalhar.</strong> Cada agente tem a sua mesa e vai até ela quando recebe uma tarefa. Toque num cartão ou num personagem para ver a tarefa, a fila e o histórico.</span></li>
          <li><b>3</b><span><strong>Quando alguém precisar de você</strong>, aparece um aviso e um balão "?". Você aprova ou nega com um toque.</span></li>
          <li><b>4</b><span>No <strong>Quadro</strong> (no Menu e no topo do chat) ficam o calendário, a lista de compras e os afazeres que o Renfield mantém. No <strong>Menu</strong> ficam também os lembretes, as notas e as configurações. Arraste para andar pela casa e use a roda do mouse ou a pinça para dar zoom.</span></li>
        </ul>
        <div className="row"><button ref={go} className="btn primary" type="button" onClick={onClose}>Começar</button></div>
      </div>
    </div>
  );
}
