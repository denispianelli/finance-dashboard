import { describe, it, expect } from 'vitest';
import { verifyArithmetic } from '../../../src/main/import/verifyArithmetic';
import type { ExtractedTransaction } from '../../../src/main/import/pdf/extractTransactions';

const tx = (amount: number): ExtractedTransaction => ({
  date: '2025-01-01',
  label: 'X',
  amount,
});

describe('verifyArithmetic — cannot_verify', () => {
  it('returns cannot_verify when openingBalance is null', () => {
    const r = verifyArithmetic([tx(-10)], null, 90);
    expect(r.status).toBe('cannot_verify');
    expect(r.openingBalance).toBeNull();
    expect(r.closingBalance).toBe(90);
    expect(r.computedClosing).toBeNull();
    expect(r.delta).toBeNull();
  });

  it('returns cannot_verify when closingBalance is null', () => {
    const r = verifyArithmetic([tx(-10)], 100, null);
    expect(r.status).toBe('cannot_verify');
    expect(r.openingBalance).toBe(100);
    expect(r.closingBalance).toBeNull();
    expect(r.computedClosing).toBeNull();
    expect(r.delta).toBeNull();
  });

  it('returns cannot_verify when both balances are null', () => {
    const r = verifyArithmetic([], null, null);
    expect(r.status).toBe('cannot_verify');
  });
});

describe('verifyArithmetic — passed / failed', () => {
  it('passes when opening + movements equals closing', () => {
    const r = verifyArithmetic([tx(-30), tx(50)], 100, 120);
    expect(r.status).toBe('passed');
    expect(r.computedClosing).toBe(120);
    expect(r.delta).toBe(0);
    expect(r.openingBalance).toBe(100);
    expect(r.closingBalance).toBe(120);
  });

  it('fails when the maths do not add up', () => {
    const r = verifyArithmetic([tx(-30), tx(50)], 100, 999);
    expect(r.status).toBe('failed');
    expect(r.computedClosing).toBe(120);
    expect(r.delta).toBe(-879);
  });
});

describe('verifyArithmetic — integer cents', () => {
  it('passes on amounts that drift under naive float addition', () => {
    // 0.1 + 0.1 + 0.1 === 0.30000000000000004 in IEEE-754; integer cents fixes it
    const r = verifyArithmetic([tx(0.1), tx(0.1), tx(0.1)], 0, 0.3);
    expect(r.status).toBe('passed');
    expect(r.delta).toBe(0);
  });
});

describe('verifyArithmetic — empty list', () => {
  it('passes when there are no movements and balances are equal', () => {
    const r = verifyArithmetic([], 100, 100);
    expect(r.status).toBe('passed');
    expect(r.computedClosing).toBe(100);
    expect(r.delta).toBe(0);
  });

  it('fails when there are no movements but balances differ', () => {
    const r = verifyArithmetic([], 100, 150);
    expect(r.status).toBe('failed');
    expect(r.delta).toBe(-50);
  });
});
