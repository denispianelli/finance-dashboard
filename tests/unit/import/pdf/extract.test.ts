import { describe, it, expect } from 'vitest';
import { computeHasText } from '../../../../src/main/import/pdf/extract';
import type { PdfPage } from '../../../../src/main/import/pdf/extract';

describe('computeHasText', () => {
  it('returns false when all pages have no items', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, items: [] }];
    expect(computeHasText(pages)).toBe(false);
  });

  it('returns false when all items are whitespace-only', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, items: [{ str: '   ', x: 0, y: 0, width: 0 }] }];
    expect(computeHasText(pages)).toBe(false);
  });

  it('returns true when at least one item has non-empty text', () => {
    const pages: PdfPage[] = [
      { pageNumber: 1, items: [{ str: 'Solde', x: 10, y: 20, width: 30 }] },
    ];
    expect(computeHasText(pages)).toBe(true);
  });
});
