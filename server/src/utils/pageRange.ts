// Parse strings like "1-5", "1,3,7", "2-4,8,10-12" into zero-based page indices.
export function parsePageRange(input: string, totalPages: number): number[] {
  if (!input || !input.trim()) throw new Error('Empty page range');
  const result = new Set<number>();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((s) => s.trim());
      const start = parseInt(a, 10);
      const end = parseInt(b, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        throw new Error(`Invalid range: ${part}`);
      }
      for (let i = start; i <= Math.min(end, totalPages); i++) result.add(i - 1);
    } else {
      const n = parseInt(part, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid page: ${part}`);
      if (n <= totalPages) result.add(n - 1);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}
