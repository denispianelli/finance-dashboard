# Arithmetic Verification Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure `verifyArithmetic` function that checks `opening + Σ(signed amounts) == closing` in integer cents, returning a three-state result.

**Architecture:** One standalone pure file (`verifyArithmetic.ts`), same pattern as `txHash.ts`. Task 1 implements the function with hand-built unit tests. Task 2 adds real-LCL-fixture integration tests (mirrors the structure of `extractTransactions.test.ts`).

**Tech Stack:** TypeScript, Vitest. No DB, no I/O in the function itself.

**Spec:** `docs/superpowers/specs/2026-05-17-arithmetic-verification-design.md`

---

## File Structure

| File                                         | Responsibility                                           |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/main/import/verifyArithmetic.ts`        | Pure: `verifyArithmetic` + `ArithmeticCheckResult`       |
| `tests/unit/import/verifyArithmetic.test.ts` | Unit tests (hand-built) + real-fixture integration tests |

Reference (not modified): `src/main/import/pdf/extractTransactions.ts` (exports `ExtractedTransaction` and `extractTransactions`), `src/main/import/pdf/extract.ts` (exports `extractPdfText`).

Conventions: tests use `import { describe, it, expect } from 'vitest';`; relative import depth from `tests/unit/import/` is `../../../src/main/...`. `ExtractedTransaction` is `{ date: string; label: string; amount: number }` (positive = credit, negative = debit). Real fixture: `spike-fixtures/LCL_STATEMENT_FIXTURE.pdf` (opening 2638.20, closing 1173.71, verified balanced in Story #27).

---

### Task 1: verifyArithmetic core (pure unit tests)

**Files:**

- Create: `src/main/import/verifyArithmetic.ts`
- Test: `tests/unit/import/verifyArithmetic.test.ts`
- Also commit: `docs/superpowers/plans/2026-05-17-epic-2-story-6-arithmetic-verification.md`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/import/verifyArithmetic.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/verifyArithmetic.test.ts`
Expected: FAIL — `verifyArithmetic` not exported (module not found).

- [ ] **Step 3: Implement `verifyArithmetic.ts`**

Create `src/main/import/verifyArithmetic.ts`:

```typescript
import type { ExtractedTransaction } from './pdf/extractTransactions';

export interface ArithmeticCheckResult {
  status: 'passed' | 'failed' | 'cannot_verify';
  openingBalance: number | null;
  closingBalance: number | null;
  computedClosing: number | null;
  delta: number | null;
}

export function verifyArithmetic(
  transactions: ExtractedTransaction[],
  openingBalance: number | null,
  closingBalance: number | null,
): ArithmeticCheckResult {
  if (openingBalance === null || closingBalance === null) {
    return {
      status: 'cannot_verify',
      openingBalance,
      closingBalance,
      computedClosing: null,
      delta: null,
    };
  }

  const openingCents = Math.round(openingBalance * 100);
  const sumCents = transactions.reduce((acc, t) => acc + Math.round(t.amount * 100), 0);
  const computedClosingCents = openingCents + sumCents;
  const deltaCents = computedClosingCents - Math.round(closingBalance * 100);

  return {
    status: deltaCents === 0 ? 'passed' : 'failed',
    openingBalance,
    closingBalance,
    computedClosing: computedClosingCents / 100,
    delta: deltaCents / 100,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/verifyArithmetic.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `cd /home/denis/finance-dashboard && npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit (include plan file)**

```bash
cd /home/denis/finance-dashboard
git add src/main/import/verifyArithmetic.ts tests/unit/import/verifyArithmetic.test.ts docs/superpowers/plans/2026-05-17-epic-2-story-6-arithmetic-verification.md
git commit -m "feat: add arithmetic verification guard (#30)"
```

---

### Task 2: Real LCL fixture integration tests

**Files:**

- Modify: `tests/unit/import/verifyArithmetic.test.ts` (append a fixture-based describe block)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/import/verifyArithmetic.test.ts`. Add these imports at the top (next to the existing imports):

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../src/main/import/pdf/extract';
import { extractTransactions } from '../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../src/main/import/pdf/extractTransactions';
```

Append this describe block at the end of the file:

```typescript
const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

const LCL_MAPPING: ColumnMapping = {
  date_col: 42,
  label_col: 75,
  debit_col: 433,
  credit_col: 504,
  balance_col: null,
};

describe('verifyArithmetic — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))('passes on the real balanced LCL statement', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const { pages } = await extractPdfText(buffer);
    const result = extractTransactions(pages, LCL_MAPPING);
    const check = verifyArithmetic(
      result.transactions,
      result.openingBalance,
      result.closingBalance,
    );
    expect(check.status).toBe('passed');
    expect(check.delta).toBe(0);
  });

  it.skipIf(!existsSync(FIXTURE_PATH))('fails when the closing balance is falsified', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const { pages } = await extractPdfText(buffer);
    const result = extractTransactions(pages, LCL_MAPPING);
    const tamperedClosing = result.closingBalance === null ? null : result.closingBalance + 10;
    const check = verifyArithmetic(result.transactions, result.openingBalance, tamperedClosing);
    expect(check.status).toBe('failed');
    expect(check.delta).toBeCloseTo(-10, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/verifyArithmetic.test.ts`
Expected: PASS (12 tests — 10 from Task 1 + 2 fixture tests; fixture tests run because the fixture exists).

- [ ] **Step 3: Full suite, lint, typecheck**

Run: `cd /home/denis/finance-dashboard && npm test && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /home/denis/finance-dashboard
git add tests/unit/import/verifyArithmetic.test.ts
git commit -m "test: add real LCL fixture integration tests for arithmetic guard (#30)"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §3 file structure → File Structure table + Tasks 1–2. ✓
- Spec §4 API (`ArithmeticCheckResult` shape, `verifyArithmetic` signature) → Task 1 Step 3. ✓
- Spec §5.1 cannot_verify branch (null opening OR closing, echoes balances, computed/delta null) → Task 1 implementation + 3 cannot_verify tests. ✓
- Spec §5.2 integer-cents verify (Math.round ×100, sum, delta, passed/failed) → Task 1 implementation + passed/failed + integer-cents tests. ✓
- Spec §5.3 euro display fields (computedClosing, delta as cents/100; balances echoed) → Task 1 implementation, asserted in passed test. ✓
- Spec §6 edge cases (empty list passed/failed; no exceptions; both null) → Task 1 empty-list + both-null tests. ✓
- Spec §7 testing (passed real fixture delta 0; failed falsified closing ≈ −10; cannot_verify; integer cents; empty list) → Task 1 (cannot_verify/integer-cents/empty) + Task 2 (real fixture passed/failed). ✓

No gaps.

**2. Placeholder scan:** No TBD/TODO/vague steps. Every code step contains complete code.

**3. Type consistency:** `ArithmeticCheckResult` defined Task 1 Step 3, used implicitly via `.status`/`.delta`/`.computedClosing`/`.openingBalance`/`.closingBalance` in both tasks' tests — names match exactly. `verifyArithmetic(transactions, openingBalance, closingBalance)` signature identical across Task 1 and Task 2. `ExtractedTransaction` `{ date; label; amount }` consistent with the `tx()` helper. `ColumnMapping` / `extractTransactions` / `extractPdfText` usage in Task 2 matches the existing `extractTransactions.test.ts` convention (same `LCL_MAPPING`, same `skipIf`/`existsSync` pattern, `extractPdfText` returns `{ pages }`).
