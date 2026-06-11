import { describe, it, expect } from 'vitest';
import { suggestRuleToken } from '../../../src/shared/categorize/labelKey';

describe('suggestRuleToken', () => {
  it('suggests the first significant token as a contains rule', () => {
    expect(suggestRuleToken('CB CARREFOUR MARKET PARIS 11')).toEqual({
      matchType: 'contains',
      value: 'CARREFOUR',
    });
  });

  it('skips bank stopwords and short tokens', () => {
    expect(suggestRuleToken('PAIEMENT CB NETFLIX')).toEqual({
      matchType: 'contains',
      value: 'NETFLIX',
    });
  });

  it('skips digit-bearing tokens', () => {
    expect(suggestRuleToken('VIR 12345678 EDF5521 BOULANGERIE')).toEqual({
      matchType: 'contains',
      value: 'BOULANGERIE',
    });
  });

  it('falls back to an exact rule on the stable key when no token qualifies', () => {
    // Only stopwords + digits: stableLabelKey returns the full normalized label.
    expect(suggestRuleToken('VIR SEPA 123456')).toEqual({
      matchType: 'exact',
      value: 'VIR SEPA 123456',
    });
  });

  it('uppercases its input (label_clean is already upper, but be defensive)', () => {
    expect(suggestRuleToken('cb carrefour market')).toEqual({
      matchType: 'contains',
      value: 'CARREFOUR',
    });
  });
});
