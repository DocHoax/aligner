/**
 * Typed Event Bus
 * Lightweight event emitter for internal engine and external UI reactivity.
 */
export type EventListener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<EventListener<unknown>>>();

  on<T>(event: string, listener: EventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as EventListener<unknown>);

    return () => {
      set.delete(listener as EventListener<unknown>);
    };
  }

  emit<T>(event: string, data: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for event "${event}":`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
