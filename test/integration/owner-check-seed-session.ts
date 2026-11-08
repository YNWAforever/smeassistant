type SeedAttempt<T> = { ok: true; target: T } | { ok: false; error: unknown };

/**
 * Custom seed failures do not dispose of or replace the caller's owned target.
 * Only explicit attempts run; concurrent attempts share the in-flight result.
 * A successful seed cannot be applied twice.
 */
export function createOwnerCheckSeedSession<T>(seed: () => Promise<T>) {
  let ready: { ok: true; target: T } | undefined;
  let pending: Promise<SeedAttempt<T>> | undefined;
  return {
    get target(): T | undefined { return ready?.target; },
    attempt(): Promise<SeedAttempt<T>> {
      if (ready) return Promise.resolve(ready);
      if (pending) return pending;
      pending = Promise.resolve().then(seed).then(
        target => (ready = { ok: true, target }),
        error => ({ ok: false as const, error }),
      ).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
