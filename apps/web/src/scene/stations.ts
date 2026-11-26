/* As estações de trabalho, uma por agente: as mesas com monitor e a escrivaninha com máquina de escrever.
   A arte fixa é desenhada uma vez (art.ts chama daqui); o que muda com o estado fica em animated.ts. */
import type { Light } from './art.ts';
import type { Station } from './layout.ts';
import { type Ctx, R } from './pixel.ts';

function chair(g: Ctx, cx: number, cy: number): void {
  R(g, cx - 5, cy - 9, 10, 8, '#15171a'); R(g, cx - 4, cy - 8, 8, 6, '#202328'); R(g, cx - 5, cy - 9, 10, 1, '#2e3238');
  for (let x = cx - 3; x < cx + 4; x += 2) R(g, x, cy - 7, 1, 4, '#1a1c20');
  R(g, cx - 1, cy - 1, 2, 2, '#0e1012'); R(g, cx - 5, cy + 1, 10, 1, '#0e1012'); R(g, cx - 6, cy + 1, 1, 1, '#08090a'); R(g, cx + 5, cy + 1, 1, 1, '#08090a');
}

/** Cadeira de madeira de espaldar com ripas, para a escrivaninha. */
function woodChair(g: Ctx, cx: number, cy: number): void {
  R(g, cx - 5, cy - 10, 10, 2, '#5c4434'); R(g, cx - 5, cy - 10, 10, 1, '#7a5a44');
  for (const x of [cx - 4, cx - 1, cx + 2]) R(g, x, cy - 8, 2, 6, '#4a3628');
  R(g, cx - 5, cy - 2, 10, 2, '#3a2a20'); R(g, cx - 5, cy - 2, 10, 1, '#5c4434');
  R(g, cx - 5, cy, 1, 2, '#2a1e17'); R(g, cx + 4, cy, 1, 2, '#2a1e17');
}

/** Mesa de madeira com um monitor, luminária, xícara e caderno. */
function deskSingle(g: Ctx, cx: number): void {
  R(g, cx - 23, 62, 46, 2, 'rgba(0,0,0,0.35)'); R(g, cx - 22, 53, 2, 10, '#0e1012'); R(g, cx + 20, 53, 2, 10, '#0e1012');
  R(g, cx + 6, 53, 13, 10, '#16181b'); R(g, cx + 6, 58, 13, 1, '#22262a'); R(g, cx + 11, 55, 3, 1, '#b08a4a'); R(g, cx + 11, 60, 3, 1, '#b08a4a');
  R(g, cx - 24, 45, 48, 7, '#4a3628'); R(g, cx - 24, 45, 48, 1, '#5c4434'); R(g, cx - 24, 51, 48, 2, '#2a1e17');
  R(g, cx - 12, 26, 24, 16, '#0e1012'); R(g, cx - 11, 27, 22, 14, '#1a1d21'); R(g, cx - 2, 42, 4, 4, '#1a1d21'); R(g, cx - 6, 46, 12, 1, '#0e1012');
  R(g, cx - 21, 47, 6, 2, '#16181b'); R(g, cx - 19, 37, 1, 10, '#b08a4a'); R(g, cx - 19, 37, 4, 1, '#b08a4a');
  R(g, cx - 17, 35, 6, 3, '#c7913f'); R(g, cx - 17, 35, 6, 1, '#d9a24a'); R(g, cx - 16, 38, 4, 1, '#ffe0a6');
  R(g, cx + 7, 46, 4, 4, '#cfc9bd'); R(g, cx + 11, 47, 1, 2, '#cfc9bd'); R(g, cx + 7, 46, 4, 1, '#4a2f20');
  R(g, cx + 13, 46, 8, 5, '#2c3b36'); R(g, cx + 13, 46, 8, 1, '#3a4d47'); R(g, cx + 14, 47, 1, 4, '#e8a75a');
}

/** Mesa preta com dois monitores, teclado com luz, caneca e um cacto. */
function deskDual(g: Ctx, cx: number): void {
  R(g, cx - 23, 62, 46, 2, 'rgba(0,0,0,0.35)'); R(g, cx - 22, 53, 2, 10, '#0b0c0e'); R(g, cx + 20, 53, 2, 10, '#0b0c0e');
  R(g, cx - 24, 45, 48, 7, '#16181b'); R(g, cx - 24, 45, 48, 1, '#2a2e33'); R(g, cx - 24, 51, 48, 2, '#0b0c0e');
  for (const bx of [cx - 22, cx + 1]) { R(g, bx, 26, 22, 15, '#0b0c0e'); R(g, bx + 1, 27, 20, 13, '#181b1f'); }
  R(g, cx - 2, 41, 4, 4, '#181b1f'); R(g, cx - 8, 45, 16, 1, '#0b0c0e');
  R(g, cx - 10, 47, 20, 3, '#0f1113'); R(g, cx - 9, 47, 18, 1, '#24282d');
  for (let x = cx - 9; x < cx + 9; x += 2) R(g, x, 48, 1, 1, 'rgba(232,167,90,0.55)');
  R(g, cx + 13, 48, 3, 2, '#0f1113'); R(g, cx - 19, 45, 3, 5, '#8a949c'); R(g, cx - 19, 47, 3, 1, '#2c3b36');
  R(g, cx + 18, 47, 4, 3, '#2a2d31'); R(g, cx + 19, 43, 2, 4, '#447a4b'); R(g, cx + 18, 44, 1, 2, '#447a4b');
}

/**
 * Escrivaninha de madeira escura: fichário com as fichas (a base de conhecimento), folhas em branco,
 * a máquina de escrever no meio e o abajur verde de banqueiro. A folha e a pilha de prontas são animadas.
 */
function deskTypewriter(g: Ctx, cx: number): void {
  R(g, cx - 23, 62, 46, 2, 'rgba(0,0,0,0.35)'); R(g, cx - 22, 53, 2, 10, '#1f1510'); R(g, cx + 20, 53, 2, 10, '#1f1510');
  // gaveta com puxador de latão
  R(g, cx - 9, 53, 18, 6, '#2e2019'); R(g, cx - 9, 53, 18, 1, '#3e2b20'); R(g, cx - 1, 55, 2, 1, '#c9a24a');
  R(g, cx - 24, 45, 48, 7, '#3e2b20'); R(g, cx - 24, 45, 48, 1, '#5a4030'); R(g, cx - 24, 51, 48, 2, '#1f1510');
  // fichário de madeira com as fichas aparecendo
  R(g, cx - 23, 38, 8, 7, '#5a3f2c'); R(g, cx - 23, 38, 8, 1, '#7a5a44'); R(g, cx - 22, 40, 6, 1, '#2a1e17');
  for (const [x, h] of [[-22, 3], [-20, 4], [-18, 2]] as const) R(g, cx + x, 39 - h + 1, 1, h, '#e8e1d2');
  // folhas em branco
  R(g, cx - 14, 42, 5, 3, '#d9d3c4'); R(g, cx - 14, 42, 5, 1, '#f1ece2');
  // máquina de escrever: corpo, teclas, rolo com botões e a alavanca do carro
  R(g, cx - 9, 39, 18, 7, '#1d1f22'); R(g, cx - 9, 39, 18, 1, '#33373c'); R(g, cx - 10, 45, 20, 1, '#121315');
  for (let row = 0; row < 2; row++) for (let x = cx - 7 + row; x < cx + 7; x += 2) R(g, x, 41 + row * 2, 1, 1, '#8a8f95');
  R(g, cx - 10, 36, 20, 3, '#2a2d31'); R(g, cx - 10, 36, 20, 1, '#3c4046'); R(g, cx - 12, 36, 2, 3, '#121315'); R(g, cx + 10, 36, 2, 3, '#121315');
  R(g, cx - 14, 34, 4, 1, '#8a8f95'); R(g, cx - 11, 35, 1, 1, '#8a8f95');
  // abajur de banqueiro: cúpula verde, haste e base de latão
  R(g, cx + 17, 44, 6, 2, '#8a6a3a'); R(g, cx + 19, 38, 1, 6, '#c9a24a');
  R(g, cx + 14, 35, 10, 3, '#2f6b4a'); R(g, cx + 14, 35, 10, 1, '#4a8f67'); R(g, cx + 15, 38, 8, 1, '#ffe0a6');
}

/** Desenha a mesa da estação. */
export function deskArt(g: Ctx, s: Station): void {
  if (s.kind === 'dual') deskDual(g, s.cx);
  else if (s.kind === 'typewriter') deskTypewriter(g, s.cx);
  else deskSingle(g, s.cx);
}

/** Desenha a cadeira da estação. */
export function chairArt(g: Ctx, s: Station): void {
  if (s.kind === 'typewriter') woodChair(g, s.cx, 66); else chair(g, s.cx, 66);
}

/** Luz fixa da estação: a luminária da mesa de um monitor, o abajur da escrivaninha. */
export function stationLights(s: Station): Light[] {
  if (s.kind === 'single') return [{ x: s.cx - 16, y: 37, r: 40, c: '255,190,110', g: 0.22 }];
  if (s.kind === 'typewriter') return [{ x: s.cx + 19, y: 40, r: 36, c: '255,206,130', g: 0.24 }];
  return [];
}

/** Estações com tela acendem a sala com a cor do estado; a folha de papel não brilha. */
export const glows = (s: Station): boolean => s.kind !== 'typewriter';
