import { describe, it, expect } from 'vitest';
import { detectType } from '../../../src/main/import/detectType';

describe('detectType', () => {
  it('detects PDF by magic bytes', () => {
    const buf = Buffer.from('%PDF-1.7\n...', 'utf8');
    expect(detectType(buf, 'statement.pdf')).toBe('pdf');
  });

  it('detects OFX by OFXHEADER marker', () => {
    const buf = Buffer.from('OFXHEADER:100\nDATA:OFXSGML\n', 'utf8');
    expect(detectType(buf, 'export.ofx')).toBe('ofx');
  });

  it('detects OFX by <OFX> tag (XML variant)', () => {
    const buf = Buffer.from('<?xml version="1.0"?><OFX><SIGNONMSGSRSV1/>', 'utf8');
    expect(detectType(buf, 'export.ofx')).toBe('ofx');
  });

  it('falls back to CSV for delimited text with .csv extension', () => {
    const buf = Buffer.from('Date;Libelle;Debit;Credit\n01/01/2025;X;10,00;', 'utf8');
    expect(detectType(buf, 'export.csv')).toBe('csv');
  });

  it('returns null for an unsupported binary file', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG
    expect(detectType(buf, 'image.png')).toBeNull();
  });
});
