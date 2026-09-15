export type IsolatedResult<T, R> =
  | { item: T; ok: true; result: R }
  | { item: T; ok: false; error: string };

export async function runIsolated<T, R>(
  items: T[],
  run: (item: T) => Promise<R>,
  errorMessage: (error: unknown) => string,
): Promise<IsolatedResult<T, R>[]> {
  const results: IsolatedResult<T, R>[] = [];
  for (const item of items) {
    try {
      const result = await run(item);
      results.push({ item, ok: true, result });
    } catch (error) {
      results.push({ item, ok: false, error: errorMessage(error) });
    }
  }
  return results;
}
