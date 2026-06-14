import { describe, it, expect } from 'vitest';
import { pageToLines } from '../../../src/main/patrimoine/pdfLines';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

const page: PdfPage = {
  pageNumber: 1,
  items: [
    { str: '002', x: 10, y: 100, width: 5 },
    { str: '05/07/2018', x: 40, y: 100, width: 5 },
    { str: '998,33', x: 120, y: 100, width: 5 },
    { str: 'INTITULE DU PRET : X', x: 10, y: 200, width: 5 },
  ],
};

describe('pageToLines', () => {
  it('groups items by y (top to bottom) and orders left to right', () => {
    expect(pageToLines(page)).toEqual(['INTITULE DU PRET : X', '002 05/07/2018 998,33']);
  });
});
