export interface RateLimiter {
  acquire(): Promise<void>;
}

export function createRateLimiter({
  capacity,
  refillMs,
}: {
  capacity: number;
  refillMs: number;
}): RateLimiter {
  let tokens = capacity;
  const waiters: Array<() => void> = [];

  const timer = setInterval(() => {
    tokens = capacity;
    while (tokens > 0 && waiters.length > 0) {
      tokens--;
      const next = waiters.shift();
      next?.();
    }
  }, refillMs);
  // Do not keep the process (or the seed script) alive just for the refill timer.
  if (typeof timer.unref === "function") timer.unref();

  return {
    acquire() {
      if (tokens > 0) {
        tokens--;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}
