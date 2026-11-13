function words(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// A conservative wording check, not a claim of semantic equivalence.
export function isRepeatedFact(candidate: string, previous: string): boolean {
  const a = words(candidate);
  const b = words(previous);
  if (a.join(" ") === b.join(" ")) return true;
  if (Math.min(a.length, b.length) < 8) return false;
  const pairs = (tokens: string[]) => new Set(
    tokens.slice(1).map((word, i) => `${tokens[i]} ${word}`),
  );
  const left = pairs(a);
  const right = pairs(b);
  const common = [...left].filter((pair) => right.has(pair)).length;
  return (2 * common) / (left.size + right.size) >= 0.8;
}
