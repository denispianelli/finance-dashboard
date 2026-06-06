import { describe, it, expect } from 'vitest';
import { stableLabelKey } from '../../../src/main/categorize/labelKey';

describe('stableLabelKey', () => {
  it('strips a trailing date so dated variants share a key', () => {
    expect(stableLabelKey('VIREMENT M DENIS PIANELLI 12/03/25')).toBe('VIREMENT M DENIS PIANELLI');
    expect(stableLabelKey('VIREMENT M DENIS PIANELLI 14/05/25')).toBe('VIREMENT M DENIS PIANELLI');
  });

  it('strips long reference numbers', () => {
    expect(stableLabelKey('VIREMENT ETRANGER 26022598893')).toBe('VIREMENT ETRANGER');
  });

  it('keeps a card merchant label minus its date', () => {
    expect(stableLabelKey('CB TICKETMASTER 13/10/25')).toBe('CB TICKETMASTER');
  });

  it('uppercases and collapses whitespace', () => {
    expect(stableLabelKey('  Vir.Permanent   Amendola ')).toBe('VIR.PERMANENT AMENDOLA');
  });

  it('falls back to the full label when stripping leaves no significant token', () => {
    // Only generic vocabulary + a ref number → keep the whole thing so it stays specific.
    expect(stableLabelKey('VIREMENT 26022598893')).toBe('VIREMENT 26022598893');
  });
});
