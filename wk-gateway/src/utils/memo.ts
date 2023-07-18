export function memo<T>(fn: () => NonNullable<T>): () => NonNullable<T> {
  let cache: T
  return () => cache ??= fn()
}
