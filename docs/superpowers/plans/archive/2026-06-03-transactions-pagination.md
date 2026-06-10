# Transactions page pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginate the Transactions page client-side (25 rows/page, Précédent/Suivant + "Page X / Y") so only the current page renders.

**Architecture:** Pure client-side slicing of the already-filtered array inside `TransactionsPage`. A `page` state, derived `pageCount`/`safePage`/`pageRows`, a reset effect on filter/account change, and inline Prev/Next controls. No new component, no dependency.

**Tech Stack:** React + react-router, TypeScript strict, Tailwind/shadcn (`Button`, Lucide `ChevronLeft`/`ChevronRight`), Vitest 4 (jsdom).

**Conventions:** TS strict (no `any`, no non-null assertions, `noUncheckedIndexedAccess` on). Conventional Commits, imperative subject (commitlint via husky). Commit body trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Pre-commit hook reformats staged files (re-add + retry). Run unit tests with `npm test -- <pattern>`.

**Current file** `src/renderer/pages/TransactionsPage.tsx` (post-merge): imports `useMemo, useState` from react; computes `filtered` via `useMemo`; renders `TxTable rows={filtered.map(toTxRow)}` in the else-branch of the two empty-state ternary. The test file `tests/unit/renderer/TransactionsPage.test.tsx` has a `tx(over)` factory, a `stubIpc(transactions = TX)` helper (default `TX` = 3 transactions), `renderPage()` rendering at `/transactions`, and uses `fireEvent`.

---

### Task 1: Client-side pagination in TransactionsPage

**Files:**

- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Test: `tests/unit/renderer/TransactionsPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/renderer/TransactionsPage.test.tsx`, add a 30-item fixture just after the existing `const TX: DashboardTransaction[] = [...]` declaration:

```tsx
const MANY: DashboardTransaction[] = Array.from({ length: 30 }, (_, i) =>
  tx({ id: `m${String(i)}`, labelClean: `Op ${String(i).padStart(2, '0')}`, amount: -(i + 1) }),
);
```

Then add these tests inside `describe('TransactionsPage', ...)`:

```tsx
it('paginates: renders only the first 25 rows and shows the page indicator', async () => {
  stubIpc(MANY);
  renderPage();
  expect(await screen.findByText('Op 00')).toBeInTheDocument();
  expect(screen.getByText('Op 24')).toBeInTheDocument();
  expect(screen.queryByText('Op 25')).not.toBeInTheDocument();
  expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
});

it('navigates to the next page with Suivant', async () => {
  stubIpc(MANY);
  renderPage();
  await screen.findByText('Op 00');
  fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
  expect(screen.getByText('Op 25')).toBeInTheDocument();
  expect(screen.getByText('Op 29')).toBeInTheDocument();
  expect(screen.queryByText('Op 00')).not.toBeInTheDocument();
  expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
});

it('disables Précédent on the first page and Suivant on the last page', async () => {
  stubIpc(MANY);
  renderPage();
  await screen.findByText('Op 00');
  expect(screen.getByRole('button', { name: /Précédent/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
  expect(screen.getByRole('button', { name: /Suivant/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Précédent/ })).not.toBeDisabled();
});

it('resets to page 1 when a filter changes', async () => {
  stubIpc(MANY);
  renderPage();
  await screen.findByText('Op 00');
  fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
  expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'Op' } });
  expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
  expect(screen.getByText('Op 00')).toBeInTheDocument();
});

it('renders no pagination controls when results fit on one page', async () => {
  renderPage();
  await screen.findByText('Carrefour');
  expect(screen.queryByRole('button', { name: /Suivant/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Page \d+ \//)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TransactionsPage`
Expected: the 5 new tests FAIL (no "Page X / Y" indicator, no Suivant/Précédent buttons, all 30 rows render).

- [ ] **Step 3: Implement pagination in `src/renderer/pages/TransactionsPage.tsx`**

(a) Change the react import (line 1) from:

```ts
import { useMemo, useState } from 'react';
```

to:

```ts
import { useEffect, useMemo, useState } from 'react';
```

(b) Add the icon + Button imports. After the existing `import { TxTable } ...` line, add:

```ts
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
```

(c) Add the page-size constant next to `FULL_HISTORY_LIMIT` (just below its declaration):

```ts
/** Rows per page in the paginated list. */
const PAGE_SIZE = 25;
```

(d) Add the `page` state alongside the other `useState` calls (immediately after `const [query, setQuery] = useState('');`):

```ts
const [page, setPage] = useState(1);
```

(e) Immediately AFTER the existing `filtered` `useMemo` block, add the derivation and the reset effect:

```ts
const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
const safePage = Math.min(page, pageCount);
const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

useEffect(() => {
  setPage(1);
}, [period, type, category, query, selectedAccountId]);
```

(f) Replace the `TxTable` else-branch. Change:

```tsx
        ) : (
          <TxTable
            rows={filtered.map(toTxRow)}
            categories={categories}
            onReassign={(txId, catId) => {
              void reassign(txId, catId);
            }}
            onCreateCategory={createCategory}
          />
        )}
```

to:

```tsx
        ) : (
          <>
            <TxTable
              rows={pageRows.map(toTxRow)}
              categories={categories}
              onReassign={(txId, catId) => {
                void reassign(txId, catId);
              }}
              onCreateCategory={createCategory}
            />
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                  }}
                >
                  <ChevronLeft size={14} strokeWidth={1.6} />
                  Précédent
                </Button>
                <span className="font-mono text-xs text-paper-mute">
                  Page {safePage} / {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => {
                    setPage((p) => Math.min(pageCount, p + 1));
                  }}
                >
                  Suivant
                  <ChevronRight size={14} strokeWidth={1.6} />
                </Button>
              </div>
            )}
          </>
        )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- TransactionsPage`
Expected: PASS — all TransactionsPage tests (the 7 pre-existing + 5 new).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx` → clean.
Run: `npx tsc --noEmit` → clean.

Note: the `useEffect` deps array lists trigger values (`period, type, category, query, selectedAccountId`) that are not read in the body — this is the intended "reset on change" pattern and `react-hooks/exhaustive-deps` does not flag extra deps. Do not remove them.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx
git commit -m "feat(transactions): paginate the Transactions list (25 per page)"
```

(append the Co-Authored-By trailer)

---

### Task 2: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint** — Run: `npm run lint` → clean.
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 3: Unit tests** — Run: `npm test` → all green.
- [ ] **Step 4: Build** — Run: `npm run build` → succeeds.
- [ ] **Step 5 (manual, optional):** Launch the app, open Transactions on an account with >25 transactions: confirm 25 rows + "Page 1 / N", Précédent disabled, Suivant advances, the total count stays the full filtered total, controls disappear once a filter narrows the result to one page.

---

## Self-review notes

- **Spec coverage:** PAGE_SIZE 25 (Task 1c), page state + pageCount/safePage/pageRows (1e), reset effect on filters+account excluding `transactions` (1e), Prev/Next + "Page X / Y" with Lucide icons rendered only when `pageCount > 1` (1f), header total count unchanged (untouched), empty states unchanged (untouched). All tests from the spec map to the 5 new cases (1-page no-controls, 25-cap+indicator, Suivant, disabled-edges, filter reset). Covered.
- **Placeholder scan:** none.
- **Type consistency:** `page`/`setPage`, `pageCount`, `safePage`, `pageRows`, `PAGE_SIZE` used consistently; `pageRows.map(toTxRow)` matches the prior `filtered.map(toTxRow)` shape (`TxRow`). `Button` (ghost/sm) and Lucide icon props match existing usage (`MoreHorizontal size={14} strokeWidth={1.6}` in TxTable).
