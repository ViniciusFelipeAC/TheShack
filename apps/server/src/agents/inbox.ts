/** Fila assíncrona que alimenta o modo de entrada contínua do Agent SDK. */
export class Inbox<T> implements AsyncIterable<T> {
  #items: T[] = [];
  #waiter: ((r: IteratorResult<T>) => void) | null = null;
  #done = false;

  push(v: T): void {
    if (this.#done) return;
    if (this.#waiter) { const w = this.#waiter; this.#waiter = null; w({ value: v, done: false }); } else this.#items.push(v);
  }

  end(): void {
    this.#done = true;
    if (this.#waiter) { const w = this.#waiter; this.#waiter = null; w({ value: undefined as never, done: true }); }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.#items.length) return Promise.resolve({ value: this.#items.shift()!, done: false });
        if (this.#done) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((r) => { this.#waiter = r; });
      },
    };
  }
}
