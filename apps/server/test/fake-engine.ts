import type { ChatEngine, TurnInput } from '../src/renfield/engine.ts';

/** Motor falso do Renfield: não chama modelo nenhum. Os testes trocam o `handler` para simular ferramentas. */
export class FakeEngine implements ChatEngine {
  turns: TurnInput[] = [];
  active = 0;
  maxActive = 0;
  handler: (input: TurnInput) => string | Promise<string> = (i) => `Pois não. Você disse: ${i.text}`;

  async turn(input: TurnInput): Promise<{ text: string }> {
    this.turns.push(input);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise((r) => setTimeout(r, 5));
      const text = await this.handler(input);
      input.onDelta(text.slice(0, 5));
      input.onDelta(text.slice(5));
      return { text };
    } finally {
      this.active--;
    }
  }

  reset(): void {}

  get last(): TurnInput {
    return this.turns[this.turns.length - 1]!;
  }
}
