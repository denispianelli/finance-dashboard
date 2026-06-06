# Transfer-pair detection — design

- **Date** : 2026-06-06
- **Status** : Accepted
- **ADR** : ADR-016 (deterministic transfer-pair neutralization)

## Goal

Stop over-counting inter-account transfers in income/expense. Pair a `−X` on one tracked account
with a `+X` on another (exact amount, ≤3 days), flag both `is_internal_transfer = 1`. Auto, after
each import, idempotent, user-overridable. No schema change (`is_internal_transfer` and
`user_modified` already exist).

## Units

### `src/main/transfers/detect.ts`

```ts
export interface PairRow {
  id: string;
  accountId: string;
  date: string;
  amount: number;
}

/** Pure pairing: returns the set of transaction ids that belong to a detected
 *  internal-transfer pair. Greedy, one-to-one, closest dates first. */
export function findTransferPairs(rows: PairRow[]): Set<string>;

/** DB pass: reset auto-marked transfers (is_internal_transfer=1 AND user_modified=0) to 0,
 *  re-pair the candidate set (user_modified=0 rows), and set is_internal_transfer=1 on matches.
 *  user_modified=1 rows are never touched. Idempotent. */
export function detectTransfers(db: DatabaseSync): { paired: number };
```

**Algorithm (`findTransferPairs`):** split rows into outflows (`amount < 0`) and inflows
(`amount > 0`). For each outflow (iterate a stable order), find the **unused** inflow on a
**different account** with `inflow.amount === -outflow.amount` and `|dayDiff| ≤ 3`, choosing the
**smallest** day diff (ties → earliest date, then id). On a match, add both ids to the result and
mark both used. Each transaction is used at most once.

**`detectTransfers(db)`:**

1. `UPDATE transactions SET is_internal_transfer = 0 WHERE is_internal_transfer = 1 AND user_modified = 0`
2. Read candidates: `SELECT id, account_id, date, amount FROM transactions WHERE user_modified = 0`.
3. `const ids = findTransferPairs(candidates)`.
4. For each id in `ids`: `UPDATE transactions SET is_internal_transfer = 1 WHERE id = ?` (in a tx).
5. Return `{ paired: ids.size }`.

### Run after import — `src/main/ipc/handlers/importConfirm.ts`

After a successful insert (and before returning), call `detectTransfers(getDb())`. Transfers can
span accounts and separate imports, so re-running the whole pass each time keeps it correct.

### User override — IPC `transactions:setTransfer`

`payload { transactionId: string; isTransfer: boolean }` →
`UPDATE transactions SET is_internal_transfer = ?, user_modified = 1 WHERE id = ?`, returns
`{ ok: true }`. Setting `user_modified = 1` locks the row from the auto pass (mark or un-mark).
Handler `src/main/ipc/handlers/transactionsSetTransfer.ts`; wire channel + contract + register.

UI affordance (mark/un-mark a transfer) lands on the Transactions row actions — small, can be a
fast follow; the IPC + data contract ship here so correctness + override exist immediately.

## Testing

- `findTransferPairs` (pure): a clean −500/+500 pair across accounts within window is matched;
  same-account opposite amounts are **not** paired; outside the ±3-day window not paired; a
  single leg (no mirror) not paired; two identical pairs the same day pair one-to-one (no
  cross-double-count); an unrelated equal-and-opposite that _is_ within window **is** matched
  (documents the accepted false-positive surface).
- `detectTransfers` (seeded `:memory:` DB): marks both legs `is_internal_transfer=1`; leaves
  `user_modified=1` rows untouched; is idempotent (second run = same state); a re-run after
  un-marking (user_modified=1, is_internal_transfer=0) does not re-mark.
- `transactions:setTransfer` handler sets the flag + `user_modified=1`.
- Regression: existing income/expense aggregates (`getConsolidatedCashflow`, `getDashboardMetrics`)
  now exclude detected pairs (covered indirectly; `NOT_TRANSFER` already keys off the flag).

## DoD

`tsc`, `vitest`, `npm run lint`, `npm run build` green.
