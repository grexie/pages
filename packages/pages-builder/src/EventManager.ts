export enum EventPhase {
  before = 'before',
  after = 'after',
}

export type EventHandler = (...args: any[]) => Promise<void> | void;
export type EventHandlerRecord = {
  phase: EventPhase;
  context: EventContext;
  handler: EventHandler;
};
export type HandlerEvent = string;
export interface EventContext {
  plugin: string;
}

export type Events<T> = T & {
  [key in keyof T]: Events<T[key]>;
} & {
  before: (event: string, handler: EventHandler) => void;
  after: (event: string, handler: EventHandler) => void;
};

const EventManagerTable = new WeakMap<object, EventManager>();

export class EventManager<T extends object = object> {
  readonly handlers: Record<string, EventHandlerRecord[]> = {};
  readonly target: T;

  private constructor(target: T) {
    this.target = target;
  }

  static get<T extends object = object>(target: T): EventManager<T> {
    if (!EventManagerTable.has(target)) {
      EventManagerTable.set(target, new EventManager<T>(target));
    }

    return EventManagerTable.get(target)! as EventManager<T>;
  }

  create(plugin: string): Events<T> {
    const context: EventContext = {
      plugin,
    };

    const proxy = new Proxy<T>(this.target, {
      get: (target, p, receiver) => {
        if (p === 'after') {
          return this.after.bind(this, context);
        }

        if (p === 'before') {
          return this.before.bind(this, context);
        }

        const value = Reflect.get(target, p);

        if (typeof value === 'object' && value !== null) {
          return EventManager.get(value).create(plugin);
        }

        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },
    });

    return proxy as Events<T>;
  }

  #addHandler(
    context: EventContext,
    phase: EventPhase,
    event: HandlerEvent,
    handler: EventHandler
  ) {
    const record: EventHandlerRecord = {
      phase,
      context,
      handler,
    };
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(record);
    return () => {
      const index = this.handlers[event].indexOf(record);
      if (index !== -1) {
        this.handlers[event].splice(index, 1);
        if (this.handlers[event].length === 0) {
          delete this.handlers[event];
        }
      }
    };
  }

  before(context: EventContext, event: HandlerEvent, handler: EventHandler) {
    return this.#addHandler(context, EventPhase.before, event, handler);
  }

  after(context: EventContext, event: HandlerEvent, handler: EventHandler) {
    return this.#addHandler(context, EventPhase.after, event, handler);
  }

  async emit(phase: EventPhase, event: string, ...args: any[]) {
    const handlers =
      this.handlers[event]?.filter(record => record.phase === phase) ?? [];

    for (const handler of handlers) {
      await handler.handler(...args);
    }
  }
}
