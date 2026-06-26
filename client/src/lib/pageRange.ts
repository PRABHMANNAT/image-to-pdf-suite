// Client-side mirror of server/src/utils/pageRange.ts. Returns ZERO-based page
// indices in the order the user typed them.

export function parsePageRange(input: string, total: number): number[] {
  if (!input.trim()) return [];
  const out: number[] = [];
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) {
        if (i >= 1 && i <= total) out.push(i - 1);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1 && n <= total) out.push(n - 1);
    }
  }
  return out;
}

/** Inverse: serialise a sorted, unique 0-based list back to compact ranges (1-based). */
export function formatPageRange(indices0: number[]): string {
  if (!indices0.length) return '';
  const sorted = [...new Set(indices0)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const v = sorted[i];
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    if (v === undefined) break;
    start = v;
    prev = v;
  }
  return ranges.join(',');
}
