/**
 * Memoises an on-demand import until it fails. A rejected load is dropped
 * rather than cached, so a background prefetch that hit a network blip does
 * not make the next real press fail too.
 */
export function retryableLoad<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null
      throw error
    })
    return pending
  }
}
