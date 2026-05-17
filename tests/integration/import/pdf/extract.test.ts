import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../../src/main/import/pdf/extract';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

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
