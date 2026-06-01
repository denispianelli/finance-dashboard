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
