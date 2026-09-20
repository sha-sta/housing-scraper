import type { ServerEvent } from "@housing/shared";

export type EventListener = (event: ServerEvent) => void;

export interface EventBus {
  publish(event: ServerEvent): void;
  subscribe(listener: EventListener): () => void;
  listenerCount(): number;
}

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();
  return {
    publish(event) {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
  };
}
