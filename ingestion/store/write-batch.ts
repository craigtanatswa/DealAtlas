/** Write rows in chunks. A failed chunk is retried one row at a time. */
export async function writeInBatches<T>(
  rows: readonly T[],
  writeMany: (chunk: T[]) => Promise<void>,
  writeOne: (row: T) => Promise<void>,
  size = 50,
): Promise<void> {
  const chunkSize = Number.isInteger(size) && size > 0 ? size : 50;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length === 1) {
      await writeOne(chunk[0] as T);
      continue;
    }
    try {
      await writeMany(chunk);
    } catch {
      let failure: unknown;
      for (const row of chunk) {
        try {
          await writeOne(row);
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    }
  }
}
