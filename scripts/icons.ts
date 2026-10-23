// Gera os ícones do app (PWA e Tela de Início do iPhone) em pixel art, sem dependências.
// Uso: node scripts/icons.ts. Os PNG vão para apps/web/public/icons/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const N = 32;
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;

/** A casa de vidro sobre palafitas, na floresta enevoada, com as janelas acesas. */
function draw(): RGB[] {
  const px: RGB[] = new Array(N * N);
  const set = (x: number, y: number, c: RGB) => { if (x >= 0 && x < N && y >= 0 && y < N) px[y * N + x] = c; };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };

  // céu noturno descendo para a neblina
  for (let y = 0; y < N; y++) rect(0, y, N - 1, y, mix(hex('#081012'), hex('#16211f'), y / (N - 1)));
  // lua atrás da neblina
  rect(24, 4, 25, 5, hex('#9fb0aa')); set(26, 5, hex('#5d6b67')); set(24, 6, hex('#5d6b67'));
  // pinheiros: os do fundo mais claros, os da frente quase pretos
  const pine = (cx: number, top: number, bottom: number, c: RGB) => {
    for (let y = top; y <= bottom; y++) { const w = Math.floor((y - top) / 2); rect(cx - w, y, cx + w, y, c); }
  };
  pine(3, 7, 26, hex('#132420')); pine(29, 9, 26, hex('#132420')); pine(7, 12, 26, hex('#0f1d19'));
  pine(26, 13, 26, hex('#0f1d19')); pine(0, 14, 28, hex('#0a1411')); pine(31, 15, 28, hex('#0a1411'));

  // a casa
  const frame = hex('#1b2524'), roof = hex('#2c3533'), roofTop = hex('#46524f');
  const amber = hex('#f0b05e'), amberHot = hex('#f8d49a'), amberDim = hex('#c98838');
  rect(7, 10, 24, 11, roof); rect(8, 9, 23, 9, roofTop);
  rect(8, 12, 23, 21, frame);
  rect(9, 13, 14, 20, amber); rect(10, 14, 12, 16, amberHot);
  rect(17, 13, 22, 20, amberDim); rect(18, 14, 19, 15, amber);
  for (let y = 13; y <= 20; y++) { set(12, y, frame); set(20, y, frame); }
  rect(9, 17, 14, 17, frame); rect(17, 17, 22, 17, frame);
  rect(15, 15, 16, 21, hex('#2a1f14')); set(16, 18, amber); // porta
  // varanda, luz das janelas no deck e palafitas
  rect(5, 22, 26, 22, roof); rect(9, 22, 14, 22, hex('#5a4325')); rect(17, 22, 22, 22, hex('#4a3820'));
  for (const x of [7, 15, 24]) rect(x, 23, x, 27, hex('#1f2a28'));
  // neblina rente ao chão
  const fog = hex('#93a39e');
  for (let y = 25; y < N; y++) for (let x = 0; x < N; x++) {
    const wave = Math.sin(x * 0.55 + y * 1.3) * 0.08;
    const t = Math.min(0.55, (y - 24) * 0.09 + wave);
    if (t > 0) set(x, y, mix(px[y * N + x]!, fog, t));
  }
  return px;
}

function png(size: number, scale: number, art: RGB[]): Buffer {
  const pad = Math.floor((size - N * scale) / 2);
  const edge = art[N * (N - 1)]!; // a margem continua a cor do chão enevoado
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const ax = Math.floor((x - pad) / scale), ay = Math.floor((y - pad) / scale);
      const inside = ax >= 0 && ax < N && ay >= 0 && ay < N;
      const c = inside ? art[ay * N + ax]! : mix(art[Math.min(N - 1, Math.max(0, ay)) * N + Math.min(N - 1, Math.max(0, ax))]!, edge, 0.3);
      raw.set([c[0], c[1], c[2], 255], row + 1 + x * 4);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = join(import.meta.dirname, '..', 'apps', 'web', 'public', 'icons');
mkdirSync(out, { recursive: true });
const art = draw();
// iPhone: 180 px. Android e o manifesto: 192 e 512. "maskable" tem margem para o recorte redondo.
const files: Array<[string, number, number]> = [
  ['apple-touch-icon.png', 180, 5], ['icon-192.png', 192, 6], ['icon-512.png', 512, 16], ['maskable-512.png', 512, 12], ['favicon-32.png', 32, 1],
];
for (const [name, size, scale] of files) writeFileSync(join(out, name), png(size, scale, art));
console.log(`Ícones gerados em ${out}`);
