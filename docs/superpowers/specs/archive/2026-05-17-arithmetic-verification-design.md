# Arithmetic Verification Guard — Design Spec

**Date:** 2026-05-17
**Status:** Validated, pending implementation plan
**Story:** [#30 — Arithmetic verification guard](https://github.com/denispianelli/finance-dashboard/issues/30)
**Parent:** Epic — Import Pipeline (#23)
**Reference:** Finance Dashboard design spec §5.1

---

## 1. Goal

Provide a deterministic guarantee that nothing was invented or omitted during
extraction: verify that
`opening_balance + Σ(signed amounts) == closing_balance` before any `INSERT`.

This is the first anti-hallucination guard (design spec §5.1). It is a pure
function; the caller decides whether to block.

## 2. Scope

In scope:

- `verifyArithmetic.ts` — one pure function + its result type
- Unit tests (passed / failed / cannot_verify / integer-cents / empty list)

Out of scope (deferred):

- IPC wiring and the green/red Review surface → Story #31 (Review page +
  atomic INSERT) builds the IPC layer; this story produces the result type
  it will consume.
- Pipeline orchestration (when/where the guard is called).

## 3. Architecture

One new file, nothing existing modified. Pure, no DB — same pattern as
`txHash.ts`.

```
src/main/import/
  verifyArithmetic.ts        NEW (pure)

tests/unit/import/
  verifyArithmetic.test.ts   NEW
```

Consumes `ExtractedTransaction` from `src/main/import/pdf/extractTransactions`
(`{ date: string; label: string; amount: number }`, `amount` positive = credit,
negative = debit).

## 4. API

```typescript
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
): ArithmeticCheckResult;
```

## 5. Logic

1. **Cannot verify.** If `openingBalance === null` OR `closingBalance === null`:
   - `status: 'cannot_verify'`
   - `openingBalance` / `closingBalance` echoed back as received (may be null)
   - `computedClosing: null`, `delta: null`

2. **Verify in integer cents** (avoids float drift; spec §5.1 mandates exact
   tolerance):
   - `openingCents = Math.round(openingBalance * 100)`
   - `sumCents = Σ Math.round(tx.amount * 100)` over all transactions
   - `computedClosingCents = openingCents + sumCents`
   - `deltaCents = computedClosingCents - Math.round(closingBalance * 100)`
   - `status = deltaCents === 0 ? 'passed' : 'failed'`

3. **Euro fields for display:**
   - `computedClosing = computedClosingCents / 100`
   - `delta = deltaCents / 100`
   - `openingBalance` / `closingBalance` echoed back as received

## 6. Edge cases

- **Empty transaction list, both balances present:** reduces to
  `openingBalance == closingBalance`. If equal → `passed`; if not → `failed`
  (a statement with no movements but a balance change is genuinely
  inconsistent — correct to flag).
- **No exceptions.** The function never throws. It reports; the caller
  (Story #31) decides whether to block the import.
- **Both balances null:** `cannot_verify` (rule 1 covers it).

## 7. Testing

Vitest. The real LCL fixture is `spike-fixtures/LCL_STATEMENT_FIXTURE.pdf`
(opening 2638.20, closing 1173.71 — verified balanced in Story #27).

- **passed:** real LCL fixture via `extractPdfText` + `extractTransactions`
  - `verifyArithmetic` → `status: 'passed'`, `delta: 0`.
- **failed:** same extracted data but `closingBalance` falsified (e.g.
  `1173.71 + 10`) → `status: 'failed'`, `delta` ≈ −10.
- **cannot_verify:** `openingBalance = null` → `cannot_verify`,
  `computedClosing` and `delta` null; same with `closingBalance = null`.
- **integer cents:** a hand-built transaction list whose float amounts would
  drift under naive `+` (e.g. amounts `0.1`, `0.2`) but balance exactly in
  cents → `status: 'passed'` (proves the integer-cents technique works).
- **empty list:** `[]` with `opening = closing = 100` → `passed`;
  `[]` with `opening = 100`, `closing = 150` → `failed`.

## 8. Self-Review

- Placeholders: none.
- Internal consistency: API (§4) matches logic (§5) and tests (§7); the
  three statuses are produced by exactly the branches in §5.
- Scope: single pure function, one focused plan; IPC explicitly deferred to
  #31 (§2) — no decomposition needed.
- Ambiguity: tolerance is explicit (integer cents, exact zero); null
  handling is explicit (cannot_verify); empty-list behaviour is explicit
  (§6).
