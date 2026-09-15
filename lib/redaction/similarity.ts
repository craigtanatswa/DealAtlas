function paddedTrigrams(value: string): Set<string> {
  const padded = `  ${value.toLowerCase().replace(/\s+/g, " ").trim()} `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}

/** Dice coefficient over character trigrams, approximating pg_trgm similarity. */
export function trigramSimilarity(left: string, right: string): number {
  if (!left.trim() || !right.trim()) {
    return 0;
  }
  const a = paddedTrigrams(left);
  const b = paddedTrigrams(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const gram of a) {
    if (b.has(gram)) {
      shared += 1;
    }
  }
  return (2 * shared) / (a.size + b.size);
}

export function wordShingleSimilarity(left: string, right: string, size = 3): number {
  const shingles = (value: string) => {
    const words = value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    const set = new Set<string>();
    if (words.length < size) {
      if (words.length > 0) {
        set.add(words.join(" "));
      }
      return set;
    }
    for (let index = 0; index <= words.length - size; index += 1) {
      set.add(words.slice(index, index + size).join(" "));
    }
    return set;
  };
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) {
      shared += 1;
    }
  }
  return shared / Math.max(a.size, b.size);
}
