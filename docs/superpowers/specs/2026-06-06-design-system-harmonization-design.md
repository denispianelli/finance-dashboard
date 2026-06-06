# Design-system harmonization — implement the kit everywhere

_Status: approved 2026-06-06. Author: design-harmonization session._

## Goal

Bring the live app into full conformance with the **Finance Dashboard Design
System** handoff bundle (Claude Design export, reverse-engineered from this
repo). The bundle's **UI kit** (`ui_kits/finance-dashboard/`) is the **source of
truth for layout, chrome, components, modals, dropdowns, states and spacing** —
not just tokens. Every divergence between a real screen and its kit recreation is
a drift to close.

The bundle is _harmonization_, not redesign: it reproduces the existing identity
(same hex/HSL, radii, fonts) and elevates consistency. Do **not** invent new
colors, fonts, or layouts.

## Source of truth

Bundle extracted to a scratch dir during this work; the canonical reference files:

- `ui_kits/finance-dashboard/shell.jsx` — chrome (Sidebar, Topbar, AppFrame) +
  primitives (Button, Chip, Badge, Card, SectionHead, Segmented, Kpi, Money,
  Overline/Label) + money helpers.
- `ui_kits/finance-dashboard/index.html` — the per-screen chrome contract (META).
- `ui_kits/finance-dashboard/{Dashboard,Transactions,Reports,Accounts,Categories,Settings}.jsx`,
  `ImportModal.jsx`, `charts.jsx` — the six screens, the import flow, the charts.
- `tokens/*.css`, `readme.md` — token definitions and the design critique.

## Authoritative chrome contract (from kit `index.html` META)

Every route shows a breadcrumb `[Group, ScreenName]` and a serif-italic title.

| Route           | title           | breadcrumb          | account selector          | "Catégoriser (N)" |
| --------------- | --------------- | ------------------- | ------------------------- | ----------------- |
| `/`             | Tableau de bord | Vue / Dashboard     | Compte joint · Boursorama | yes (pending)     |
| `/transactions` | Transactions    | Vue / Transactions  | —                         | yes (pending)     |
| `/accounts`     | Comptes         | Vue / Comptes       | —                         | —                 |
| `/categories`   | Catégories      | Vue / Catégories    | —                         | —                 |
| `/reports`      | Rapports        | Vue / Rapports      | —                         | —                 |
| `/settings`     | Paramètres      | Outils / Paramètres | —                         | —                 |

Sidebar nav order (groups **Vue** / **Outils**): Tableau de bord, Transactions,
Comptes, Catégories, Rapports / Importer (disabled), Chat IA (disabled),
Paramètres. Footer: `● local · privé` (sage dot) + `v0.1.0`, both mono.

AppFrame main: padding `24/28/28/32`, `gap 20`, flex column (already matched at
`xl`). Topbar: min-height 70, serif-italic title 26px, breadcrumb 10px/0.12em.

## The eight token-level drifts (kit `readme.md` critique)

1. Number rendering drift → one `Money` path: fr-FR, NBSP before `€`, U+2212 minus, tabular figures.
2. Too many / cool greys → fixed 5-step warm **ink** + 4-step warm **paper** only.
3. Accent overuse → brass only on overlines, active rail, focus, key figures.
4. Label casing chaos → two tiers only: `Overline` (9px/0.18em/brass) + `Label` (10px/0.12em/paper-mute).
5. Card padding/radius variance → one spec: 20/22 padding, 8px radius, 1px hairline, 14px gap.
6. Inconsistent hover/focus → surfaces step up one ink level on hover; single 2px brass focus ring.
7. Data-viz palette sprawl → charts pull from `--cat-*` + sage/coral only.
8. Mixed iconography → Lucide only, stroke 1.6–1.8, no emoji in chrome.

## Current gap (audit)

- Foundations already match: colors, radii, shadows are verbatim in `globals.css`.
- **Missing tokens** (in bundle, not in app): full typography scale
  (`--text-*`, `--fw-*`, `--tracking-*`, `--leading-*`, `--type-*`), spacing scale
  (`--space-*`) + component metrics (`--card-pad-x/y`, `--control-h`, `--sidebar-w`,
  `--topbar-h`, `--row-h`), `--shadow-xl`, `--radius-full`, category swatches
  (`--cat-1..15`), ready-to-use semantic values (`--color-income…`).
- `tailwind.config.ts` has the color layer but no `font-sans`, `fontSize`,
  `letterSpacing`, `lineHeight`, `boxShadow`, or `colors.cat`.
- Category palette lives in TS (`lib/categoryOptions.ts`), not CSS tokens.
- `Money` used 3×; 7 files format amounts ad-hoc (e.g. `VerdictRow` glues `' €'`
  with a normal space + manual sign).
- `Overline`/`Label` correct but 7 ad-hoc `uppercase tracking-[…]` labels remain.
- **`PAGE_META` incomplete** — only `/` and `/settings`; Transactions, Comptes,
  Catégories, Rapports fall back to title "Finance Dashboard" with no breadcrumb.

## Plan — six phased PRs

Each PR: branch + PR, CI green (typecheck · lint · test · build · E2E) and branch
up to date, then self-merge (autonomy authorized for this task). Re-base each
phase on updated `main` before starting.

1. **Token foundation (additive, zero visual change).** Add the missing tokens to
   `globals.css`; expose the consumable ones in `tailwind.config.ts`
   (`fontFamily.sans`, `fontSize`, `letterSpacing`, `lineHeight`, `boxShadow`,
   `colors.cat`, `borderRadius.full`); rewire `CATEGORY_COLORS` onto `--cat-*`.
   Acceptance: visual diff nil; build/lint/test/E2E green.
2. **App chrome conformance.** Complete `PAGE_META` for all six routes per the
   contract table; reconcile Sidebar, Topbar, footer, AppFrame against `shell.jsx`.
   Acceptance: every screen shows the right title + breadcrumb; chrome matches kit.
3. **Cross-cutting discipline (drifts 1, 3, 4, 5).** Route every amount through
   `Money` (extract a shared `formatEuro`/sign helper for non-JSX sites); replace
   ad-hoc labels with `Overline`/`Label`; align primitive specs (Button, Chip,
   Badge, Card, Segmented, Kpi) to `shell.jsx`; unify the card spec; replace magic
   font sizes/tracking with tokens; audit brass overuse.
4. **Dashboard + Transactions conformance** vs `Dashboard.jsx` / `Transactions.jsx`
   (account tabs, KPI tiles + sparklines, balance chart, Insight card, recent
   preview; filter bar, dense list, inline category picker dropdown).
5. **Reports conformance** vs `Reports.jsx` + `charts.jsx` (period picker, verdict
   row, two category donuts, net-worth ring, month bars, recurring, biggest
   movements) — data-viz palette onto `--cat-*`/sage/coral (drift 7).
6. **Accounts + Categories + Settings + Import modal** vs their kit files
   (create forms, rows + hover actions, settings sections + "À venir", the
   drop → learn-bank → review → summary flow). Final Lucide-only/no-emoji sweep
   (drift 8).

## Out of scope

- New features or screens not in the kit. Conversational AI / NL search / etc.
  (cut by ADR-009). Light/responsive themes (dark, desktop-only stays).
- Re-proposing anything ADR-009 removed.

## Validation per PR

`npm run typecheck && npm run lint && npm test && npm run build`, plus E2E via CI.
Visual conformance checked against the named kit file(s) for that phase.
