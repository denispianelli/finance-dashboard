import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText, computeHasText } from '../../../../src/main/import/pdf/extract';
import type { PdfPage } from '../../../../src/main/import/pdf/extract';

const FIXTURE_PATH = resolve('spike-fixtures/COMPTEDEDEPOTS_08992009022_20251202.pdf');

describe('extractPdfText', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts text items with coordinates from a real LCL PDF',
    async () => {
      const buffer = readFileSync(FIXTURE_PATH);
      const result = await extractPdfText(buffer);

      expect(result.hasText).toBe(true);
      expect(result.pages.length).toBeGreaterThan(0);

      const firstPage = result.pages[0];
      expect(firstPage).toBeDefined();
      expect(firstPage?.pageNumber).toBe(1);
      expect(firstPage?.items.length).toBeGreaterThan(0);

      const firstItem = firstPage?.items[0];
      expect(typeof firstItem?.str).toBe('string');
      expect(typeof firstItem?.x).toBe('number');
      expect(typeof firstItem?.y).toBe('number');
      expect(typeof firstItem?.width).toBe('number');
    },
  );
});

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
