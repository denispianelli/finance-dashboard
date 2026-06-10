import { describe, it, expect } from 'vitest';
import { stableLabelKey } from '../../../src/main/categorize/labelKey';

describe('stableLabelKey', () => {
  it('strips a trailing date so dated variants share a key', () => {
    expect(stableLabelKey('VIREMENT M JEAN DUPONT 12/03/25')).toBe('VIREMENT M JEAN DUPONT');
    expect(stableLabelKey('VIREMENT M JEAN DUPONT 14/05/25')).toBe('VIREMENT M JEAN DUPONT');
  });

  it('strips LCL dot dates so dated variants share a key', () => {
    // Audit #184: only /-dates were stripped; LCL card labels carry 13.10.25-style dates.
    expect(stableLabelKey('CB TICKETMASTER 13.10.25')).toBe('CB TICKETMASTER');
    expect(stableLabelKey('CB TICKETMASTER 14.11.25')).toBe('CB TICKETMASTER');
    expect(stableLabelKey('CB MONOPRIX 03.02 PARIS')).toBe('CB MONOPRIX PARIS');
  });

  it('strips long reference numbers', () => {
    expect(stableLabelKey('VIREMENT ETRANGER 26022598893')).toBe('VIREMENT ETRANGER');
  });

  it('keeps a card merchant label minus its date', () => {
    expect(stableLabelKey('CB TICKETMASTER 13/10/25')).toBe('CB TICKETMASTER');
  });

  it('uppercases and collapses whitespace', () => {
    expect(stableLabelKey('  Vir.Permanent   Durand ')).toBe('VIR.PERMANENT DURAND');
  });

  it('falls back to the full label when stripping leaves no significant token', () => {
    // Only generic vocabulary + a ref number → keep the whole thing so it stays specific.
    expect(stableLabelKey('VIREMENT 26022598893')).toBe('VIREMENT 26022598893');
  });
});
