/**
 * Sugar for a more promise-like setTimeout.
 *
 * Usage:
 *
 *    await delay(1000)
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function* generatorFromArray<T>(a: T[]) {
  yield* a
}
