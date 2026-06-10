# Design System Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable layout/content primitives from `finance-dashboard-design/ui_kits/dashboard` so Phase 2 features compose into the kit instead of drifting, and prove them by rendering the populated dashboard screen with mock data (issue #69).

**Architecture:** Extend the Tailwind theme with the identity token scale (ink/paper/brass/line) + kit radii, then build primitives as React components using Tailwind utility classes + `cn()` (the repo's shadcn pattern; replaces the inline-style approach the code reviewer flagged). Restyle the existing shadcn `Card`/`Button` to the kit `.cardx`/`.btn` specs (one source of truth — only DashboardPage/SettingsPage use Card; ImportModal does not, so regression risk is contained). The acceptance proof is the kit's `screen-dashboard.jsx` rebuilt with hard-coded mock data — no DB/IPC wiring, no Recharts (static SVG as the kit itself does it). Sidebar is out of scope (merged, works). Custom titlebar is #68.

**Tech Stack:** React 19 · TypeScript strict · Tailwind v3 · shadcn/ui (`cn()` + variants) · lucide-react · Vitest 4 + @testing-library/react (per-file `// @vitest-environment jsdom` + explicit `cleanup()`).

---

## File Structure

**Create:**

- `src/renderer/components/ui/overline.tsx` — `Overline` (`.ovl`) + `Label` (`.lbl`)
- `src/renderer/components/ui/chip.tsx` — `Chip` (`.chip`)
- `src/renderer/components/ui/money.tsx` — `Money` amount formatter
- `src/renderer/components/dashboard/layout.tsx` — `KpiGrid`, `Row2` grid wrappers
- `src/renderer/components/dashboard/Kpi.tsx` — KPI tile (`.kpi`)
- `src/renderer/components/dashboard/AccountTabs.tsx` — `.accounts`/`.account-tab`
- `src/renderer/components/dashboard/TxTable.tsx` — `.tx-table`
- `src/renderer/components/dashboard/Insight.tsx` — `.insight`
- `src/renderer/components/dashboard/ChartCard.tsx` — static SVG chart card
- `src/renderer/components/dashboard/mockDashboard.ts` — hard-coded sample data
- `src/renderer/lib/categoryIcon.tsx` — kit icon-name → lucide glyph in hairline circle
- `tests/unit/renderer/money.test.tsx`
- `tests/unit/renderer/kpi.test.tsx`

**Modify:**

- `tailwind.config.ts` — add identity colors + kit radii
- `src/renderer/styles/globals.css` — add `--radius-xs/sm/md/lg/xl`; webkit scrollbar polish
- `src/renderer/components/ui/card.tsx` — restyle to `.cardx`
- `src/renderer/components/ui/button.tsx` — restyle variants to kit `.btn`
- `src/renderer/components/Topbar.tsx` — breadcrumb + account switcher + right slot; Tailwind classes
- `src/renderer/pages/DashboardPage.tsx` — full dashboard composition with mock data
- `src/renderer/pages/SettingsPage.tsx` — adopt restyled Card cleanly
- `tests/e2e/app-launch.test.ts` — keep "Importer un relevé" reachable (now in Topbar)

---

### Task 1: Tailwind token extension + radii

**Files:**

- Modify: `tailwind.config.ts`
- Modify: `src/renderer/styles/globals.css`
- Add: `docs/superpowers/plans/2026-05-18-design-system-primitives.md` (this file)

- [ ] **Step 1: Add kit radii vars to globals.css**

In `src/renderer/styles/globals.css`, inside `:root`, immediately after the `--radius: 0.5rem;` line, add:

```css
--radius-xs: 2px;
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
```

- [ ] **Step 2: Add webkit scrollbar polish to globals.css**

At the end of `src/renderer/styles/globals.css` (after the final `}` of `@layer base`), append:

```css
@layer utilities {
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--line-2);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--line-3);
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
}
```

- [ ] **Step 3: Extend tailwind.config.ts colors + radii**

In `tailwind.config.ts`, inside `theme.extend`, add a `borderRadius` key and extend `colors` with the identity scale. Replace the `colors: { ... }` object by adding these keys alongside the existing shadcn ones (keep all existing keys unchanged):

```ts
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
```

And add to `colors` (after `secondary`):

```ts
        ink: {
          0: 'var(--ink-0)',
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          3: 'var(--line-3)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          soft: 'var(--paper-soft)',
          mute: 'var(--paper-mute)',
          dim: 'var(--paper-dim)',
        },
        brass: {
          DEFAULT: 'var(--brass)',
          hi: 'var(--brass-hi)',
          lo: 'var(--brass-lo)',
          soft: 'var(--brass-soft)',
          ghost: 'var(--brass-ghost)',
        },
        sage: { DEFAULT: 'hsl(var(--sage))', soft: 'hsl(var(--sage-soft))' },
        coral: { DEFAULT: 'hsl(var(--coral))', soft: 'hsl(var(--coral-soft))' },
        flag: { DEFAULT: 'hsl(var(--flag))', soft: 'hsl(var(--flag-soft))' },
```

Note: `borderRadius.lg` now resolves to `var(--radius-lg)` (8px) instead of the shadcn `calc(var(--radius))` chain. shadcn `Card` uses `rounded-lg`; the kit `.cardx` also uses `--radius-lg` (8px) so this aligns them. Existing shadcn `Button` uses `rounded-md` → now 6px, matching kit `.btn`. This is intended.

- [ ] **Step 4: Verify build + baseline still green**

Run: `npm run build && npm run lint && npm test`
Expected: build emits assets, lint clean, 128 tests pass.

- [ ] **Step 5: Commit (include the plan file)**

```bash
git add docs/superpowers/plans/2026-05-18-design-system-primitives.md tailwind.config.ts src/renderer/styles/globals.css
git commit -m "feat: extend tailwind with identity token scale and kit radii"
```

---

### Task 2: Money primitive (TDD)

**Files:**

- Create: `src/renderer/components/ui/money.tsx`
- Test: `tests/unit/renderer/money.test.tsx`

French formatting per design README: `1 234,56 €` (narrow no-break space thousands, comma decimal, non-breaking space before €). Income = sage with explicit `+`; expense = coral with `−` (U+2212 minus); transfer = neutral with `→`; plain = paper-soft.

- [ ] **Step 1: Write the failing test**

`tests/unit/renderer/money.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Money } from '@renderer/components/ui/money';

afterEach(() => {
  cleanup();
});

describe('Money', () => {
  it('formats income with + and sage class', () => {
    render(<Money value={3240} kind="income" />);
    const el = screen.getByText((t) => t.replace(/\s/g, ' ').includes('+ 3 240,00 €'));
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-sage');
  });

  it('formats expense with minus sign and coral class', () => {
    render(<Money value={-84.3} kind="expense" />);
    const el = screen.getByText((t) => t.includes('−') && t.includes('84,30'));
    expect(el.className).toContain('text-coral');
  });

  it('formats transfer with arrow and neutral class', () => {
    render(<Money value={500} kind="transfer" />);
    const el = screen.getByText((t) => t.includes('→') && t.includes('500,00'));
    expect(el.className).toContain('text-paper-soft');
  });

  it('plain kind has no sign prefix', () => {
    render(<Money value={12847.32} kind="plain" />);
    const el = screen.getByText((t) => t.includes('12 847,32'));
    expect(el.textContent).not.toMatch(/[+→]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/money.test.tsx`
Expected: FAIL — cannot resolve `@renderer/components/ui/money`.

- [ ] **Step 3: Implement Money**

`src/renderer/components/ui/money.tsx`:

```tsx
import { cn } from '@renderer/lib/utils';

export type MoneyKind = 'income' | 'expense' | 'transfer' | 'plain';

const KIND_CLASS: Record<MoneyKind, string> = {
  income: 'text-sage',
  expense: 'text-coral',
  transfer: 'text-paper-soft',
  plain: 'text-paper-soft',
};

const NBSP = ' ';

function formatEuro(abs: number): string {
  const n = abs.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n}${NBSP}€`;
}

export function Money({
  value,
  kind = 'plain',
  className,
}: {
  value: number;
  kind?: MoneyKind;
  className?: string;
}) {
  const abs = Math.abs(value);
  let prefix = '';
  if (kind === 'income') prefix = `+${NBSP}`;
  else if (kind === 'expense') prefix = `−${NBSP}`;
  else if (kind === 'transfer') prefix = `→${NBSP}`;

  return (
    <span className={cn('font-mono tabular-nums tracking-[-0.005em]', KIND_CLASS[kind], className)}>
      {prefix}
      {formatEuro(abs)}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/money.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui/money.tsx tests/unit/renderer/money.test.tsx
git commit -m "feat: add Money primitive with French amount formatting"
```

---

### Task 3: Overline + Chip primitives

**Files:**

- Create: `src/renderer/components/ui/overline.tsx`
- Create: `src/renderer/components/ui/chip.tsx`

- [ ] **Step 1: Implement Overline + Label**

`src/renderer/components/ui/overline.tsx` (`.ovl` and `.lbl` from kit.css lines 95–96):

```tsx
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/utils';

export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-brass',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper-mute',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Implement Chip**

`src/renderer/components/ui/chip.tsx` (`.chip` from kit.css lines 100–103):

```tsx
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/utils';

export function Chip({
  active = false,
  dotColor,
  children,
  onClick,
}: {
  active?: boolean;
  dotColor?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-sm border px-[9px] font-sans text-[11px] font-medium transition-colors',
        active
          ? 'border-brass/40 bg-brass-soft text-paper'
          : 'border-line-2 bg-ink-3 text-paper-soft hover:bg-ink-4',
      )}
    >
      {dotColor ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      ) : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/overline.tsx src/renderer/components/ui/chip.tsx
git commit -m "feat: add Overline, Label and Chip primitives"
```

---

### Task 4: Restyle shadcn Card to .cardx

**Files:**

- Modify: `src/renderer/components/ui/card.tsx`

Target `.cardx` (kit.css 88–92): `bg-ink-2 border border-line-2 rounded-lg p-[20px_22px] flex flex-col gap-3.5`. `.cardx-head`: flex row, space-between. Header title `.t`: `font-medium text-sm tracking-[-0.01em]`.

- [ ] **Step 1: Rewrite card.tsx**

Replace the full contents of `src/renderer/components/ui/card.tsx`:

```tsx
import * as React from 'react';

import { cn } from '@renderer/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5 text-paper',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center justify-between', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('font-sans text-sm font-medium tracking-[-0.01em] text-paper', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-mono text-[11px] text-paper-mute', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-[13px] text-paper-soft', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 2: Update SettingsPage to drop the now-redundant inline serif title**

Replace the full contents of `src/renderer/pages/SettingsPage.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';

export function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <Overline>À venir · Phase 2+</Overline>
      </CardHeader>
      <CardTitle>Paramètres</CardTitle>
      <CardContent>Gestion des comptes, modèle LLM, OCR, thème, backup.</CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck + tests + build**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: clean; 128 tests pass; build OK.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/card.tsx src/renderer/pages/SettingsPage.tsx
git commit -m "feat: restyle shadcn Card to kit .cardx spec"
```

---

### Task 5: Restyle shadcn Button to kit .btn variants

**Files:**

- Modify: `src/renderer/components/ui/button.tsx`

- [ ] **Step 1: Read current button.tsx**

Run: `cat src/renderer/components/ui/button.tsx`
Note the existing `cva` variant keys (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) and size keys so the public API is preserved.

- [ ] **Step 2: Rewrite the cva variant/size class strings to kit .btn (kit.css 75–85)**

Keep the exact same `cva` structure, `buttonVariants` export, `ButtonProps`, `asChild`/`Slot` logic, and variant **key names** (do not rename keys — other files reference `variant="..."`). Only replace the Tailwind class strings:

- base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-[13px] font-medium tracking-[-0.005em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-1 disabled:pointer-events-none disabled:opacity-50`
- variant.default: `bg-brass text-ink-1 hover:bg-brass-hi`
- variant.destructive: `border border-line-2 bg-transparent text-coral hover:border-coral hover:bg-coral-soft`
- variant.outline: `border border-line-2 bg-ink-3 text-paper hover:bg-ink-4`
- variant.secondary: `border border-line-2 bg-ink-3 text-paper hover:bg-ink-4`
- variant.ghost: `bg-transparent text-paper-soft hover:bg-ink-3 hover:text-paper`
- variant.link: `text-brass underline-offset-4 hover:underline`
- size.default: `h-9 px-[14px]`
- size.sm: `h-7 px-2.5 text-xs`
- size.lg: `h-11 px-[18px] text-sm`
- size.icon: `h-9 w-9`

(`text-ink-1` as button foreground stands in for kit `--paper-inv` — both resolve to the near-black ink, correct contrast on brass.)

- [ ] **Step 3: Verify lint + typecheck + tests + build**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: clean; 128 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/button.tsx
git commit -m "feat: restyle shadcn Button variants to kit .btn spec"
```

---

### Task 6: KPI tile + layout grids (TDD for delta direction)

**Files:**

- Create: `src/renderer/components/dashboard/layout.tsx`
- Create: `src/renderer/components/dashboard/Kpi.tsx`
- Test: `tests/unit/renderer/kpi.test.tsx`

- [ ] **Step 1: Implement layout grids**

`src/renderer/components/dashboard/layout.tsx` (`.kpi-grid` / `.row-2`, kit.css 115–116):

```tsx
import type { ReactNode } from 'react';

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-4 gap-3.5">{children}</div>;
}

export function Row2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[1.6fr_1fr] gap-3.5">{children}</div>;
}
```

- [ ] **Step 2: Write the failing KPI test**

`tests/unit/renderer/kpi.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Kpi } from '@renderer/components/dashboard/Kpi';

afterEach(() => {
  cleanup();
});

describe('Kpi', () => {
  it('renders label, value and sub', () => {
    render(<Kpi label="Solde net" value="12 847" sub=",32 €" ctx="vs. avril" />);
    expect(screen.getByText('Solde net')).toBeInTheDocument();
    expect(screen.getByText(',32 €')).toBeInTheDocument();
  });

  it('applies sage class for an up delta', () => {
    render(<Kpi label="x" value="1" ctx="c" delta="+ 4,2 %" deltaDir="up" />);
    expect(screen.getByText('+ 4,2 %').className).toContain('text-sage');
  });

  it('applies coral class for a down delta', () => {
    render(<Kpi label="x" value="1" ctx="c" delta="+ 8,1 %" deltaDir="down" />);
    expect(screen.getByText('+ 8,1 %').className).toContain('text-coral');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/kpi.test.tsx`
Expected: FAIL — cannot resolve `Kpi`.

- [ ] **Step 4: Implement Kpi**

`src/renderer/components/dashboard/Kpi.tsx` (`.kpi` kit.css 120–127):

```tsx
import { cn } from '@renderer/lib/utils';
import { Label } from '../ui/overline';

export interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  ctx: string;
  spark?: string;
  sparkColor?: string;
}

export function Kpi({ label, value, sub, delta, deltaDir, ctx, spark, sparkColor }: KpiProps) {
  return (
    <div className="relative flex min-h-[130px] flex-col gap-2.5 overflow-hidden rounded-lg border border-line-2 bg-ink-2 px-5 py-[18px]">
      <Label>{label}</Label>
      <span className="whitespace-nowrap font-serif text-[32px] italic leading-none tracking-[-0.02em] text-paper [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
        {sub ? <span className="text-[20px] text-paper-mute">{sub}</span> : null}
      </span>
      <div className="flex items-center gap-2.5 font-sans text-xs text-paper-mute">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              deltaDir === 'up' && 'text-sage',
              deltaDir === 'down' && 'text-coral',
            )}
          >
            {delta}
          </span>
        ) : null}
        <span>{ctx}</span>
      </div>
      {spark ? (
        <svg
          className="absolute right-[18px] top-[18px] h-6 w-16 opacity-60"
          viewBox="0 0 84 32"
          preserveAspectRatio="none"
        >
          <polyline
            points={spark}
            fill="none"
            stroke={sparkColor ?? 'var(--brass)'}
            strokeWidth="1.2"
          />
        </svg>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/kpi.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dashboard/layout.tsx src/renderer/components/dashboard/Kpi.tsx tests/unit/renderer/kpi.test.tsx
git commit -m "feat: add Kpi tile and KpiGrid/Row2 layout primitives"
```

---

### Task 7: Category icon mapper + AccountTabs

**Files:**

- Create: `src/renderer/lib/categoryIcon.tsx`
- Create: `src/renderer/components/dashboard/AccountTabs.tsx`

- [ ] **Step 1: Implement category icon mapper**

`src/renderer/lib/categoryIcon.tsx` — maps kit icon names to lucide glyphs inside the 24px hairline circle (`.tx-row .ic`, kit.css 137):

```tsx
import {
  ArrowDownToLine,
  Car,
  House,
  ShoppingCart,
  Tv,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  incoming: ArrowDownToLine,
  shop: ShoppingCart,
  car: Car,
  home: House,
  utensils: Utensils,
  wallet: Wallet,
  tv: Tv,
};

export function CategoryIcon({ name }: { name: string }) {
  const Icon = MAP[name] ?? Wallet;
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-3 text-paper-soft">
      <Icon size={12} strokeWidth={1.6} />
    </span>
  );
}
```

- [ ] **Step 2: Implement AccountTabs**

`src/renderer/components/dashboard/AccountTabs.tsx` (`.accounts`/`.account-tab`, kit.css 208–214). Controlled by `activeId`/`onSelect`:

```tsx
import { Plus } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: string; // pre-formatted or "—"
}

export function AccountTabs({
  accounts,
  activeId,
  onSelect,
}: {
  accounts: Account[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-2 bg-ink-2">
      <div className="flex items-stretch">
        {accounts.map((a) => {
          const active = a.id === activeId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onSelect(a.id);
              }}
              className={cn(
                'flex min-w-[130px] flex-col gap-1 border-r border-line-2 px-4 py-3 text-left last:border-r-0',
                active && 'bg-ink-3',
              )}
            >
              <span
                className={cn(
                  'font-sans text-[11px] font-medium uppercase tracking-[0.06em]',
                  active ? 'text-brass' : 'text-paper-mute',
                )}
              >
                {a.name}
              </span>
              <span className="font-mono text-base font-medium tabular-nums text-paper">
                {a.balance === '—' ? '—' : `${a.balance} €`}
              </span>
              <span className="font-sans text-[9px] tracking-[0.06em] text-paper-dim">
                {a.bank}
              </span>
            </button>
          );
        })}
        <div className="flex min-w-[80px] flex-col items-center justify-center gap-1 px-4 py-3 text-paper-dim">
          <Plus size={16} strokeWidth={1.6} />
          <span className="font-sans text-[9px]">Ajouter</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/lib/categoryIcon.tsx src/renderer/components/dashboard/AccountTabs.tsx
git commit -m "feat: add category icon mapper and AccountTabs"
```

---

### Task 8: TxTable

**Files:**

- Create: `src/renderer/components/dashboard/TxTable.tsx`

`.tx-table` is a 7-col CSS grid with `display: contents` rows (kit.css 130–146).

- [ ] **Step 1: Implement TxTable**

`src/renderer/components/dashboard/TxTable.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import { CategoryIcon } from '@renderer/lib/categoryIcon';
import { Money, type MoneyKind } from '../ui/money';

export interface TxRow {
  date: string;
  icon: string;
  main: string;
  sub: string;
  catColor: string;
  catName: string;
  amount: number;
  amountKind: MoneyKind;
  conf: string;
  confLow?: boolean;
}

const HEAD =
  'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute pb-2.5 border-b border-line-2';
const CELL = 'py-[11px] border-b border-line-1';

export function TxTable({ rows }: { rows: TxRow[] }) {
  return (
    <div className="grid grid-cols-[84px_28px_1fr_max-content_max-content_max-content_24px] items-center gap-x-3.5">
      <span className={HEAD} />
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={cn(HEAD, 'text-right')}>Conf.</span>
      <span className={HEAD} />
      {rows.map((t, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="group contents">
          <span
            className={cn(
              CELL,
              'font-mono text-xs tabular-nums text-paper-mute group-hover:bg-ink-3',
            )}
          >
            {t.date}
          </span>
          <span className={cn(CELL, 'group-hover:bg-ink-3')}>
            <CategoryIcon name={t.icon} />
          </span>
          <span className={cn(CELL, 'flex min-w-0 flex-col gap-0.5 group-hover:bg-ink-3')}>
            <span className="truncate font-sans text-[13px] font-medium leading-tight text-paper">
              {t.main}
            </span>
            <span className="font-mono text-[11px] tracking-[0.02em] text-paper-dim">{t.sub}</span>
          </span>
          <span className={cn(CELL, 'group-hover:bg-ink-3')}>
            <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-medium text-paper-soft">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.catColor }} />
              {t.catName}
            </span>
          </span>
          <span className={cn(CELL, 'text-right group-hover:bg-ink-3')}>
            <Money value={t.amount} kind={t.amountKind} className="text-[13px] font-medium" />
          </span>
          <span
            className={cn(
              CELL,
              'text-right font-mono text-[11px] font-medium group-hover:bg-ink-3',
              t.confLow ? 'text-flag' : 'text-paper-mute',
            )}
          >
            {t.conf}
          </span>
          <span className={cn(CELL, 'flex justify-center text-paper-dim group-hover:bg-ink-3')}>
            <MoreHorizontal size={14} strokeWidth={1.6} />
          </span>
        </div>
      ))}
    </div>
  );
}
```

Note: the array-index key + the lint-disable comment is acceptable here — mock rows are static and never reordered. The `react/no-array-index-key` rule may not be enabled; if `npm run lint` reports the disable directive as unused, remove that one comment line.

- [ ] **Step 2: Verify lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean (adjust the lint-disable line per the note if flagged).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/dashboard/TxTable.tsx
git commit -m "feat: add TxTable transaction grid primitive"
```

---

### Task 9: Insight panel + ChartCard

**Files:**

- Create: `src/renderer/components/dashboard/Insight.tsx`
- Create: `src/renderer/components/dashboard/ChartCard.tsx`

- [ ] **Step 1: Implement Insight**

`src/renderer/components/dashboard/Insight.tsx` (`.insight`, kit.css 149–153; the brass tick rail is the `before:` pseudo via Tailwind):

```tsx
import type { ReactNode } from 'react';
import { Overline } from '../ui/overline';

export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-lg border border-line-2 bg-ink-2 py-[18px] pl-8 pr-5 before:absolute before:bottom-[18px] before:left-3.5 before:top-[18px] before:w-px before:bg-brass before:content-['']">
      <Overline>Insights</Overline>
      {children}
    </div>
  );
}

export function Quote({ children, size = 17 }: { children: ReactNode; size?: number }) {
  return (
    <p className="font-serif italic leading-snug text-paper" style={{ fontSize: size }}>
      {children}
    </p>
  );
}

export function QuoteNum({ children }: { children: ReactNode }) {
  return <span className="font-mono not-italic text-brass">{children}</span>;
}
```

- [ ] **Step 2: Implement ChartCard (static SVG, exactly as the kit)**

`src/renderer/components/dashboard/ChartCard.tsx` — copy the SVG markup verbatim from `screen-dashboard.jsx` lines 71–94 (gradient, gridlines, area path, brass polyline, dashed violet projection, end dot+label) and the head with `Chip` range selectors:

```tsx
import { useState } from 'react';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';

const RANGES = ['1M', '3M', '6M', '1A', 'MAX'] as const;

export function ChartCard() {
  const [range, setRange] = useState<string>('1A');
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Overline>— II</Overline>
          <span className="font-sans text-sm font-medium tracking-[-0.012em]">
            Solde sur 12 mois
          </span>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <Chip
              key={r}
              active={r === range}
              onClick={() => {
                setRange(r);
              }}
            >
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <svg className="block h-[220px] w-full" viewBox="0 0 600 220" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#D4B062" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#D4B062" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 22, 44, 88, 132, 176].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--line-1)" strokeWidth="1" />
        ))}
        <path
          d="M0,150 L50,128 L100,140 L150,108 L200,98 L250,114 L300,82 L350,68 L400,76 L450,52 L500,48 L550,38 L600,30 L600,220 L0,220 Z"
          fill="url(#dashFill)"
        />
        <polyline
          points="0,150 50,128 100,140 150,108 200,98 250,114 300,82 350,68 400,76 450,52 500,48 550,38 600,30"
          fill="none"
          stroke="#D4B062"
          strokeWidth="1.5"
        />
        <polyline
          points="0,160 50,150 100,144 150,132 200,122 250,112 300,100 350,90 400,78 450,68 500,58 550,48 600,38"
          fill="none"
          stroke="#8D7DC4"
          strokeWidth="1.2"
          strokeDasharray="3 4"
        />
        <circle cx="550" cy="38" r="3" fill="#D4B062" />
        <text x="558" y="32" fontFamily="var(--font-mono)" fontSize="10" fill="var(--paper)">
          12 847
        </text>
      </svg>
      <div className="flex gap-[18px] border-t border-line-2 pt-1.5">
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5" style={{ background: 'var(--brass)' }} />
          Solde réel
        </div>
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5" style={{ background: 'var(--violet, #8D7DC4)' }} />
          Projection
        </div>
        <div className="ml-auto flex items-center font-sans text-[11px] text-paper-dim">
          Mai 2026 · 4 comptes
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/dashboard/Insight.tsx src/renderer/components/dashboard/ChartCard.tsx
git commit -m "feat: add Insight panel and static ChartCard"
```

---

### Task 10: Topbar enrichment (breadcrumb + account switcher + right slot)

**Files:**

- Modify: `src/renderer/components/Topbar.tsx`
- Modify: `src/renderer/components/AppShell.tsx`

Kit `.topbar` (kit.css 53–72): breadcrumb (uppercase tracked) above the serif title, spacer, account switcher, right action slot. The "Importer un relevé" button moves here from the page body.

- [ ] **Step 1: Read AppShell + DashboardPage import modal wiring**

Run: `cat src/renderer/components/AppShell.tsx src/renderer/pages/DashboardPage.tsx`
Note how `ImportModal` open state is currently owned by `DashboardPage`. The modal state must move up so the Topbar button can open it while the modal still renders. Decision: lift modal state into `AppShell` and render `<ImportModal>` there; pass an `onImport` callback to `Topbar`.

- [ ] **Step 2: Rewrite Topbar.tsx**

```tsx
import { MoreHorizontal } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from './ui/button';

interface PageMeta {
  title: string;
  breadcrumb: string[];
  account?: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'Tableau de bord',
    breadcrumb: ['Vue', 'Dashboard'],
    account: 'Compte joint · Boursorama',
  },
  '/settings': { title: 'Paramètres', breadcrumb: ['Outils', 'Paramètres'] },
};

export function Topbar({ onImport }: { onImport: () => void }) {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: 'Finance Dashboard', breadcrumb: [] };

  return (
    <header
      aria-label="En-tête de l'application"
      className="flex min-h-[70px] items-center gap-[18px] border-b border-line-2 bg-ink-1 px-7 py-[18px]"
    >
      <div className="flex flex-col gap-1.5">
        {meta.breadcrumb.length > 0 ? (
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper-mute">
            {meta.breadcrumb.map((b, i) => (
              <span key={b}>
                {i > 0 ? <span className="mx-2 text-paper-dim">/</span> : null}
                {b}
              </span>
            ))}
          </span>
        ) : null}
        <h1 className="whitespace-nowrap font-serif text-[26px] italic leading-[1.05] tracking-[-0.02em] text-paper">
          {meta.title}
        </h1>
      </div>
      <span className="flex-1" />
      {meta.account ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-ink-2 px-3 py-[7px] font-sans text-xs font-medium text-paper-soft"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brass" />
          {meta.account}
          <MoreHorizontal size={12} strokeWidth={1.6} />
        </button>
      ) : null}
      <Button onClick={onImport}>Importer un relevé</Button>
    </header>
  );
}
```

- [ ] **Step 3: Rewrite AppShell.tsx to own the import modal + .page wrapper**

```tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ImportModal } from './ImportModal';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex h-full bg-ink-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onImport={() => {
            setImportOpen(true);
          }}
        />
        <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-7 pb-8 pt-6">
          <Outlet />
        </main>
      </div>
      <ImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean (DashboardPage will still typecheck; its own modal state is removed in Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Topbar.tsx src/renderer/components/AppShell.tsx
git commit -m "feat: enrich Topbar with breadcrumb, account switcher and import action"
```

---

### Task 11: Mock data + full DashboardPage composition

**Files:**

- Create: `src/renderer/components/dashboard/mockDashboard.ts`
- Modify: `src/renderer/pages/DashboardPage.tsx`

- [ ] **Step 1: Create mock data**

`src/renderer/components/dashboard/mockDashboard.ts` — lifted verbatim from `screen-dashboard.jsx` ACCOUNTS (lines 7–12) and RECENT_TX (lines 14–21), typed against the component interfaces:

```ts
import type { Account } from './AccountTabs';
import type { TxRow } from './TxTable';

// Mock data — NOT wired to DB/IPC. Real data is Phase 2 (see issue #69 scope).

export const MOCK_ACCOUNTS: Account[] = [
  { id: 'joint', name: 'Compte joint', bank: 'Boursorama', balance: '3 240,00' },
  { id: 'perso', name: 'Compte courant', bank: 'LCL', balance: '1 487,32' },
  { id: 'livret', name: 'Livret A', bank: 'LBP', balance: '8 120,00' },
  { id: 'epargne', name: 'Épargne logement', bank: 'Crédit Agricole', balance: '—' },
];

export const MOCK_TX: TxRow[] = [
  {
    date: '14/05',
    icon: 'incoming',
    main: 'Virement reçu — Acme SAS',
    sub: 'VIR EUROPEEN EMIS',
    catColor: '#6FA582',
    catName: 'Revenus',
    amount: 3240,
    amountKind: 'income',
    conf: '0,99',
  },
  {
    date: '14/05',
    icon: 'shop',
    main: 'Carrefour Market',
    sub: 'CB 14/05 · PARIS 11',
    catColor: '#7AB890',
    catName: 'Alimentation',
    amount: -84.3,
    amountKind: 'expense',
    conf: '0,94',
  },
  {
    date: '12/05',
    icon: 'car',
    main: 'SNCF Connect',
    sub: 'CB 12/05 · LYON',
    catColor: '#8AA8C7',
    catName: 'Transport',
    amount: -119,
    amountKind: 'expense',
    conf: '0,71',
    confLow: true,
  },
  {
    date: '11/05',
    icon: 'wallet',
    main: 'Virement → Livret A',
    sub: 'VIR INTERNE',
    catColor: '#6E6E78',
    catName: 'Transferts',
    amount: 500,
    amountKind: 'transfer',
    conf: '—',
  },
  {
    date: '10/05',
    icon: 'tv',
    main: 'Spotify',
    sub: 'PRELEV SEPA',
    catColor: '#8D7DC4',
    catName: 'Abonnements',
    amount: -10.99,
    amountKind: 'expense',
    conf: '1,00',
  },
  {
    date: '09/05',
    icon: 'utensils',
    main: 'BOULANGER MARTIN',
    sub: 'CB 09/05 · PARIS 11',
    catColor: '#E07365',
    catName: 'Restaurants',
    amount: -14.8,
    amountKind: 'expense',
    conf: '0,78',
    confLow: true,
  },
];
```

- [ ] **Step 2: Rewrite DashboardPage.tsx (compose the kit dashboard)**

Mirrors `screen-dashboard.jsx` structure (AccountTabs → KpiGrid → Row2[ChartCard, Insight] → Card[TxTable]). Modal state now lives in AppShell, so DashboardPage no longer owns it:

```tsx
import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { KpiGrid, Row2 } from '../components/dashboard/layout';
import { Kpi } from '../components/dashboard/Kpi';
import { ChartCard } from '../components/dashboard/ChartCard';
import { Insight, Quote, QuoteNum } from '../components/dashboard/Insight';
import { TxTable } from '../components/dashboard/TxTable';
import { MOCK_ACCOUNTS, MOCK_TX } from '../components/dashboard/mockDashboard';

export function DashboardPage() {
  const [account, setAccount] = useState('joint');

  return (
    <>
      <AccountTabs accounts={MOCK_ACCOUNTS} activeId={account} onSelect={setAccount} />

      <KpiGrid>
        <Kpi
          label="Solde net"
          value="12 847"
          sub=",32 €"
          delta="+ 4,2 %"
          deltaDir="up"
          ctx="vs. avril"
          spark="0,28 12,22 24,24 36,18 48,16 60,20 72,12 84,8"
          sparkColor="var(--sage, #7AB890)"
        />
        <Kpi
          label="Dépenses · mai"
          value="3 412"
          sub=",18 €"
          delta="+ 8,1 %"
          deltaDir="down"
          ctx="restaurants + 34 %"
          spark="0,24 12,20 24,22 36,16 48,18 60,10 72,14 84,6"
          sparkColor="var(--coral, #E07365)"
        />
        <Kpi
          label="Revenus · mai"
          value="3 240"
          sub=",00 €"
          delta="stable"
          ctx="1 virement"
          spark="0,22 12,22 24,22 36,21 48,22 60,21 72,22 84,22"
          sparkColor="var(--brass)"
        />
        <Kpi
          label="Épargne projetée"
          value="14 280"
          sub=",00 €"
          delta="fin 2026"
          ctx="à ce rythme"
          spark="0,28 12,26 24,22 36,20 48,16 60,12 72,8 84,4"
          sparkColor="#8D7DC4"
        />
      </KpiGrid>

      <Row2>
        <ChartCard />
        <Insight>
          <Quote>
            Tes <QuoteNum>restaurants</QuoteNum> sont à <QuoteNum>+34 %</QuoteNum> ce mois — porté
            surtout par les sorties du week-end.
          </Quote>
          <span className="h-px bg-line-2" />
          <Quote size={15}>
            3 abonnements similaires détectés : <QuoteNum>Netflix</QuoteNum>,{' '}
            <QuoteNum>Disney+</QuoteNum>, <QuoteNum>Apple TV+</QuoteNum>.
          </Quote>
          <span className="h-px bg-line-2" />
          <Quote size={15}>
            À ce rythme, ton épargne atteindra <QuoteNum>14 280 €</QuoteNum> fin 2026.
          </Quote>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm">
              Voir le détail
            </Button>
            <Button variant="ghost" size="sm">
              Masquer
            </Button>
          </div>
        </Insight>
      </Row2>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— III</Overline>
            <CardTitle>Dernières transactions</CardTitle>
          </div>
          <Button variant="ghost" size="sm">
            Tout voir →
          </Button>
        </CardHeader>
        <TxTable rows={MOCK_TX} />
      </Card>
    </>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck + unit tests + build**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: clean; tests pass (128 + Money 4 + Kpi 3 = 135); build OK.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/dashboard/mockDashboard.ts src/renderer/pages/DashboardPage.tsx
git commit -m "feat: compose populated dashboard from kit primitives with mock data"
```

---

### Task 12: E2E smoke + final review checkpoint

**Files:**

- Modify: `tests/e2e/app-launch.test.ts`

- [ ] **Step 1: Read current E2E test**

Run: `cat tests/e2e/app-launch.test.ts`
The first test asserts the `/tableau de bord/i` heading (in Topbar — still valid). The second clicks `button name=/importer un relevé/i` — that button moved from DashboardPage body into the Topbar, but the accessible name is unchanged, so the locator still resolves. Verify the modal still opens.

- [ ] **Step 2: Add a dashboard-content assertion to the first test**

In `tests/e2e/app-launch.test.ts`, in the `'app launches and renders dashboard'` test, after the heading assertion, add:

```ts
await expect(window.getByText('Dernières transactions')).toBeVisible();
await expect(window.getByText('BOULANGER MARTIN')).toBeVisible();
```

- [ ] **Step 3: Run full E2E**

Run: `npm run test:e2e`
Expected: 2 tests pass (dashboard renders populated content; import modal still opens from the Topbar button).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app-launch.test.ts
git commit -m "test: assert populated dashboard content in E2E smoke"
```

- [ ] **Step 5: Visual review checkpoint**

Run `npm run dev`, screenshot, and compare against `ui_kits/dashboard/index.html` (dashboard screen). Spot-check: account tabs row, 4-up KPI grid with serif italic numerals + sparklines, chart card with range chips + dashed projection, insight panel brass tick rail, transaction table grid (hairline category circles, mono amounts with sage/coral/neutral, low-conf flag colour), Topbar breadcrumb + account switcher + Importer button. Note any pixel deltas for a follow-up polish pass; do not block the PR on sub-pixel differences.

---

## Self-Review

**Spec coverage (issue #69 acceptance criteria):**

- `npm run lint && npm test` pass → Tasks 4/5/11 verify gates.
- `Card`/`Overline`/`KpiGrid`/`Row2`/`KPI`/`Money` exist matching kit CSS → Tasks 2,3,4,6.
- Demo render visually matching `index.html` → Task 11 (full dashboard) + Task 12 checkpoint.
- Topbar breadcrumb + account switcher + right slot; no action button floating in page body → Task 10 (button lifted to Topbar/AppShell).
- Pixel spot-check vs `index.html` → Task 12 Step 5.

**Type consistency:** `Account` (Task 7) consumed by `mockDashboard` + DashboardPage (Tasks 11). `TxRow`/`MoneyKind` (Tasks 8/2) consumed by `TxTable` + `mockDashboard`. `KpiProps` (Task 6) consumed by DashboardPage. `Topbar` gains required `onImport` prop (Task 10) supplied by `AppShell` (Task 10) — DashboardPage no longer renders `<ImportModal>` (Task 11) — consistent, no dangling references.

**Out-of-scope guards honoured:** no DB/IPC (mock data only, Task 11), no Recharts (static SVG, Task 9), Sidebar untouched, custom titlebar deferred to #68.

**Placeholder scan:** every code step contains complete source. No "TODO"/"similar to"/"add error handling" left.
