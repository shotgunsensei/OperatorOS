export class SessionTransitionCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private currentGeneration = 0;

  get generation(): number {
    return this.currentGeneration;
  }

  advance(): number {
    this.currentGeneration += 1;
    return this.currentGeneration;
  }

  isCurrent(generation: number): boolean {
    return this.currentGeneration === generation;
  }

  serialize<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }
}
