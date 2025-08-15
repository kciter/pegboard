import { EventCallback, EventMap } from './types';

export class EventEmitter {
  private listeners: Map<string, EventCallback[]> = new Map();

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, []);
    }
    this.listeners.get(event as string)!.push(callback);
  }

  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    const callbacks = this.listeners.get(event as string);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const callbacks = this.listeners.get(event as string);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
