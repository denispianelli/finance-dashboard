# Design — Dashboard recent transactions + full Transactions page

Date: 2026-06-03
Branch: `feat/dashboard-recent-transactions`

## Problem

The dashboard "Dernières transactions" card renders every transaction returned by
`dashboard:getTransactions`, which defaults to a `LIMIT` of 100. It reads as "all
transactions" rather than a recent preview, and the "Tout voir →" button has no action.

## Goals

1. The dashboard card shows only the **10 latest** transactions (a true preview).
2. "Tout voir →" navigates to a dedicated, filterable full **Transactions** page.

Non-goals: server-side search/category/type filtering, reports, export, multi-account
aggregation. Out of scope per ADR-009 and MVP posture.

## Existing infrastructure (reused, not rebuilt)

- `dashboard:getTransactions` already accepts `{ accountId, from, to, limit }` and orders
  `date DESC, id DESC`. Date filtering is therefore already available server-side.
- The Sidebar already declares a `Transactions` item (`ArrowLeftRight` icon, path
  `/transactions`) but disabled (`enabled: false`); the route is not yet wired in `App.tsx`.
- `TxTable` renders rows + the category reassign / create-category picker; reused as-is.
- `AccountTabs` renders the account picker; reused as-is.

## Decision: client-side filtering

The full page fetches all transactions for the selected account once, then filters in the
renderer (period / category / label search / type). Rationale: local single-user app with a
bounded transaction volume — instant filtering, no IPC round-trip per keystroke, no extra
backend surface. Pushing every filter into SQL (option B) adds query surface and IPC churn
for zero benefit at this scale (YAGNI). Date range is left client-side too, since the full
set is already loaded.

## Design

### 1. Dashboard preview — `pages/DashboardPage.tsx`

- Render `transactions.slice(0, 10)` in the "Dernières transactions" `TxTable`.
- **Do not change the `useDashboard` fetch.** Its 100-transaction list also feeds the
  "plus grosse dépense du mois" insight via `topSpendingCategories`; capping the fetch would
  break that. Only the rendered slice changes.
- Replace the inert "Tout voir →" `Button` with a react-router `<Link to="/transactions">`
  styled as the same ghost button.

### 2. Full page — `pages/TransactionsPage.tsx`

- Wired in `App.tsx` as `<Route path="/transactions" element={<TransactionsPage />} />`
  inside the existing `AppShell` layout route.
- Sidebar `Transactions` item flips to `enabled: true`.
- `AccountTabs` header; account selection is **local page state**, defaulting to the first
  account (independent from the dashboard's selection — no shared global store added).
- Fetches all transactions for the selected account via `dashboard:getTransactions` with a
  high `limit` (see "Fetch limit" below), then applies client-side filters:
  - **Période**: presets `30 jours` / `3 mois` / `Cette année` / `Tout` (default `Tout`),
    relative to today. The page reads the current date and passes it as `today` into the
    pure filter, so `filterTransactions` itself never touches the clock (keeps it pure and
    testable with fixed dates).
  - **Catégorie**: select populated from `categories:list`, plus an "Toutes" option;
    matches on `categoryId`. An explicit "Sans catégorie" option matches `categoryId === null`.
  - **Recherche**: text input filtering `labelClean`, case- and accent-insensitive
    (normalize via `String.prototype.normalize('NFD')` + strip diacritics, lowercased).
  - **Type**: toggle `Tous` / `Revenus` (`amount > 0`) / `Dépenses` (`amount < 0`).
- Reuses `TxTable` for rendering + reassignment (same `reassign` / `createCategory` wiring).
- Shows a result count and a distinct empty state when filters match nothing (separate from
  the "no transactions imported yet" empty state).

### 3. Isolation / units

- `lib/filterTransactions.ts` — **pure** function:
  `filterTransactions(txns, { period, today, categoryId, query, type }) => DashboardTransaction[]`.
  No React, no clock access (today injected). Unit-testable in isolation.
- `hooks/useAccountTransactions.ts` — fetches a single account's full transaction list and
  exposes `reassign` / `createCategory`, mirroring the relevant slice of `useDashboard`
  without duplicating the whole hook. Refetches on the same internal tick after a reassign.

### Fetch limit

`getTransactions` requires a `LIMIT`. The page passes an explicit high limit (e.g. `100000`)
to fetch the full account history. A personal-finance dataset stays well within this. If the
limit is ever hit, the page shows the count it received — no silent truncation beyond that
documented cap.

## Testing

- Unit (Vitest, pure): `filterTransactions` — each filter dimension (period boundaries,
  category incl. "sans catégorie", accent-insensitive search, type sign) and combinations.
- Component (Vitest + jsdom, per-file `// @vitest-environment jsdom` + explicit
  `afterEach(cleanup)`): `TransactionsPage` — filters reduce rendered rows; filtered-empty
  state renders; "Tout voir" link on the dashboard points at `/transactions`.

## Definition of done

Lint clean, `tsc --noEmit` clean, unit + component tests green, `npm run build` succeeds.
