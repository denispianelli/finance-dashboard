import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { loadRules, matchRule, type CategorizationRule } from '../../../src/main/categorize/rules';

function rule(over: Partial<CategorizationRule> & { matchValue: string }): CategorizationRule {
  return {
    id: over.id ?? `r-${over.matchValue}`,
    matchType: over.matchType ?? 'contains',
    matchValue: over.matchValue,
    categoryId: over.categoryId ?? 'cat-x',
  };
}

describe('matchRule', () => {
  it('matches a contains rule case-insensitively', () => {
    const rules = [rule({ matchValue: 'CARREFOUR', categoryId: 'cat-alimentation' })];
    expect(matchRule(rules, 'cb carrefour market paris')?.categoryId).toBe('cat-alimentation');
  });

  it('returns null when nothing matches', () => {
    const rules = [rule({ matchValue: 'CARREFOUR' })];
    expect(matchRule(rules, 'BOULANGERIE DUPONT')).toBeNull();
  });

  it('returns the first matching rule (precedence by order)', () => {
    const rules = [
      rule({ matchValue: 'UBER EATS', categoryId: 'cat-restaurants' }),
      rule({ matchValue: 'UBER', categoryId: 'cat-transport' }),
    ];
    expect(matchRule(rules, 'UBER EATS AMSTERDAM')?.categoryId).toBe('cat-restaurants');
    expect(matchRule(rules, 'UBER TRIP PARIS')?.categoryId).toBe('cat-transport');
  });

  it('does not match a contains value embedded inside a longer word', () => {
    // Audit #184: short seeded tokens substring-matched unrelated labels,
    // e.g. ORANGE → "BOULANGERIE DE L'ORANGERIE" filed under Énergie.
    const rules = [rule({ matchValue: 'ORANGE', categoryId: 'cat-energie' })];
    expect(matchRule(rules, "BOULANGERIE DE L'ORANGERIE")).toBeNull();
    expect(matchRule(rules, 'PRLV ORANGE SA')?.categoryId).toBe('cat-energie');
  });

  it('does not match a contains value embedded at the end of a longer word', () => {
    const rules = [rule({ matchValue: 'EDF', categoryId: 'cat-energie' })];
    expect(matchRule(rules, 'CB REDFOX STORE')).toBeNull();
    expect(matchRule(rules, 'PRLV SEPA EDF CLIENTS')?.categoryId).toBe('cat-energie');
  });

  it('matches a contains value at punctuation and digit boundaries', () => {
    const rules = [rule({ matchValue: 'EDF', categoryId: 'cat-energie' })];
    // Bank labels glue references and punctuation onto payee names.
    expect(matchRule(rules, 'VIR/EDF FACTURE')?.categoryId).toBe('cat-energie');
    expect(matchRule(rules, 'EDF5521004412')?.categoryId).toBe('cat-energie');
  });

  it('treats regex metacharacters in a contains value literally', () => {
    const rules = [rule({ matchValue: 'NETFLIX.COM', categoryId: 'cat-loisirs' })];
    expect(matchRule(rules, 'CB NETFLIX.COM PARIS')?.categoryId).toBe('cat-loisirs');
    expect(matchRule(rules, 'CB NETFLIXXCOM PARIS')).toBeNull();
  });

  it('supports exact match', () => {
    const rules = [rule({ matchType: 'exact', matchValue: 'LOYER', categoryId: 'cat-logement' })];
    expect(matchRule(rules, 'LOYER')?.categoryId).toBe('cat-logement');
    expect(matchRule(rules, 'LOYER JANVIER')).toBeNull();
  });

  it('supports regex match', () => {
    const rules = [
      rule({ matchType: 'regex', matchValue: 'SNCF|RATP', categoryId: 'cat-transport' }),
    ];
    expect(matchRule(rules, 'paiement ratp')?.categoryId).toBe('cat-transport');
  });

  it('treats a malformed regex as non-matching instead of throwing', () => {
    const rules = [rule({ matchType: 'regex', matchValue: '(' })];
    expect(() => matchRule(rules, 'anything')).not.toThrow();
    expect(matchRule(rules, 'anything')).toBeNull();
  });
});

describe('loadRules', () => {
  it('loads the seeded rules in creation (rowid) order', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const rules = loadRules(db);
    expect(rules.length).toBeGreaterThan(0);

    // UBER EATS (Restaurants) must precede the broader UBER (Transport) rule.
    const eatsIdx = rules.findIndex((r) => r.matchValue === 'UBER EATS');
    const uberIdx = rules.findIndex((r) => r.matchValue === 'UBER');
    expect(eatsIdx).toBeGreaterThanOrEqual(0);
    expect(uberIdx).toBeGreaterThan(eatsIdx);
    db.close();
  });

  it('resolves a known seeded merchant to the expected category', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const match = matchRule(loadRules(db), 'CB CARREFOUR MARKET');
    expect(match?.categoryId).toBe('cat-alimentation');
    db.close();
  });
});
