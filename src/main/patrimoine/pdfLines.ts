import type { PdfPage } from '../import/pdf/extract';

/** pdfjs y jitters by fractions of a point; round to group items onto one line. */
export function pageToLines(page: PdfPage): string[] {
  const byLine = new Map<number, { x: number; str: string }[]>();
  for (const it of page.items) {
    const key = Math.round(it.y);
    const row = byLine.get(key) ?? [];
    row.push({ x: it.x, str: it.str });
    byLine.set(key, row);
  }
  return [...byLine.keys()]
    .sort((a, b) => b - a) // top (higher y) first
    .map((y) =>
      (byLine.get(y) ?? [])
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 0);
}
