/* Partículas da cena: a fumaça das mesas com erro, a fumaça da chaminé e a chuva lá fora. Saíram do engine.ts. */
import type { Pt } from './layout.ts';
import type { Ctx } from './pixel.ts';
import { glows } from './stations.ts';
import type { Walker } from './walker.ts';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number };

export class Particles {
  readonly smoke: Particle[] = [];
  readonly flue: Particle[] = [];
  drops: Pt[] = [];
  #flueT = 0;

  /** Gotas espalhadas pela largura da vista de fora. */
  resetRain(width: number): void {
    this.drops = Array.from({ length: Math.round((150 * width) / 480) }, () => ({ x: Math.random() * width, y: Math.random() * 340 }));
  }

  update(dt: number, o: { walkers: Iterable<Walker>; out: boolean; rain: boolean; width: number; still: boolean }): void {
    if (!o.still) {
      for (const a of o.walkers) {
        // só sai fumaça de máquina com tela; a escrivaninha mostra a bola de papel (animated.ts)
        if (a.state === 'error' && a.mode === 'seated' && glows(a.desk)) {
          a.smokeT -= dt;
          if (a.smokeT <= 0) {
            a.smokeT = 0.35;
            const s = a.desk.smokeAt;
            this.smoke.push({ x: s.x + Math.random() * 6 - 3, y: s.y, vx: (Math.random() - 0.5) * 2, vy: -5 - Math.random() * 3, life: 2.2, max: 2.2 });
          }
        }
      }
      if (o.out) {
        this.#flueT -= dt;
        if (this.#flueT <= 0) { this.#flueT = 0.5; this.flue.push({ x: 301 + Math.random() * 3, y: 42, vx: 2 + Math.random() * 2, vy: -6 - Math.random() * 3, life: 3.6, max: 3.6 }); }
        if (o.rain) {
          const W = o.width;
          for (const d of this.drops) { d.y += 180 * dt; d.x -= 28 * dt; if (d.y > 330) { d.y -= 350; d.x = Math.random() * W; } if (d.x < -10) d.x += W - 10; }
        }
      }
    }
    for (const arr of [this.smoke, this.flue]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) arr.splice(i, 1);
      }
    }
  }

  draw(ctx: Ctx, which: 'smoke' | 'flue', rgb: string): void {
    for (const p of this[which]) {
      const k = p.life / p.max, s = Math.round(2 + (1 - k) * 3);
      ctx.fillStyle = `rgba(${rgb},${(k * 0.55).toFixed(3)})`;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
  }

  drawRain(ctx: Ctx): void {
    ctx.fillStyle = 'rgba(170,192,200,0.42)';
    for (const d of this.drops) { ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 4); ctx.fillRect(Math.round(d.x) - 1, Math.round(d.y) + 3, 1, 2); }
  }
}
