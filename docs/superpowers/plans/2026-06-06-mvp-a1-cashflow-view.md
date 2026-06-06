# A1 — Monthly/yearly gained-lost view (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Surface US1 — see, **month by month and year by year**, whether you gained or lost money (consolidated, transfers excluded) — by mounting a `CashflowCard` on a new **Reports page** that A2 will grow.

**Architecture:** A `useCashflow` hook fetches F1's `dashboard:cashflow` for a toggled granularity; `CashflowCard` renders the period rows (label, income, expense, colored net); `ReportsPage` hosts it and is wired into the router + sidebar (the `/reports` entry already exists, disabled). Renderer-only — reads the F1 channel, no new main code.

**Tech Stack:** React 19, TypeScript strict, shadcn/Tailwind tokens, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md` (brick A1). Depends on F1 (merged: `dashboard:cashflow`).

---

## File structure

- Create `src/renderer/hooks/useCashflow.ts`
- Create `src/renderer/components/dashboard/CashflowCard.tsx`
- Create `src/renderer/pages/ReportsPage.tsx`
- Modify `src/renderer/App.tsx` (route), `src/renderer/components/Sidebar.tsx` (enable `/reports`)
- Tests: `tests/unit/renderer/useCashflow.test.ts`, `tests/unit/renderer/CashflowCard.test.tsx`, `tests/unit/renderer/ReportsPage.test.tsx`

Per-file directive `// @vitest-environment jsdom` + explicit `afterEach(() => cleanup())` (CLAUDE.md).

---

### Task 1: `useCashflow` hook

- [ ] **Step 1: Test** `tests/unit/renderer/useCashflow.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { useCashflow } from '@renderer/hooks/useCashflow';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const monthSeries = [{ period: '2026-04', income: 2000, expense: -500, net: 1500 }];
const yearSeries = [{ period: '2026', income: 9000, expense: -4000, net: 5000 }];

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockImplementation(((
    channel: string,
    payload: { granularity?: string },
  ) => {
    if (channel === 'dashboard:cashflow') {
      return Promise.resolve({ series: payload.granularity === 'year' ? yearSeries : monthSeries });
    }
    return Promise.resolve({});
  }) as typeof ipcMod.ipc.invoke);
});

describe('useCashflow', () => {
  it('loads the month series by default', async () => {
    const { result } = renderHook(() => useCashflow());
    await waitFor(() => expect(result.current.series).toEqual(monthSeries));
    expect(result.current.granularity).toBe('month');
  });

  it('refetches with year granularity when toggled', async () => {
    const { result } = renderHook(() => useCashflow());
    await waitFor(() => expect(result.current.series).toEqual(monthSeries));
    act(() => {
      result.current.setGranularity('year');
    });
    await waitFor(() => expect(result.current.series).toEqual(yearSeries));
    expect(result.current.granularity).toBe('year');
  });
});
```

- [ ] **Step 2:** Run → FAIL. `npx vitest run tests/unit/renderer/useCashflow.test.ts`

- [ ] **Step 3: Implement** `src/renderer/hooks/useCashflow.ts`:

```typescript
import { useEffect, useState } from 'react';
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

export interface UseCashflow {
  series: CashflowPoint[];
  granularity: CashflowGranularity;
  setGranularity: (g: CashflowGranularity) => void;
}

/** Consolidated gained/lost per period (F1's `dashboard:cashflow`), toggling
 *  between calendar month and year. Refetches whenever the granularity changes. */
export function useCashflow(): UseCashflow {
  const [granularity, setGranularity] = useState<CashflowGranularity>('month');
  const [series, setSeries] = useState<CashflowPoint[]>([]);

  useEffect(() => {
    let active = true;
    void ipc.invoke('dashboard:cashflow', { granularity }).then(({ series: next }) => {
      if (active) setSeries(next);
    });
    return () => {
      active = false;
    };
  }, [granularity]);

  return { series, granularity, setGranularity };
}
```

- [ ] **Step 4:** Run → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** `feat(reports): useCashflow hook over the consolidated cash-flow channel`

---

### Task 2: `CashflowCard` component

- [ ] **Step 1: Test** `tests/unit/renderer/CashflowCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CashflowCard } from '@renderer/components/dashboard/CashflowCard';
import type { CashflowPoint } from '@shared/types/dashboard';

afterEach(() => {
  cleanup();
});

const series: CashflowPoint[] = [
  { period: '2026-04', income: 2000, expense: -500, net: 1500 },
  { period: '2026-05', income: 1800, expense: -2300, net: -500 },
];

describe('CashflowCard', () => {
  it('renders a French month label and the net for each period', () => {
    render(<CashflowCard series={series} granularity="month" onGranularityChange={() => {}} />);
    expect(screen.getByText(/avril 2026/i)).toBeTruthy();
    expect(screen.getByText(/mai 2026/i)).toBeTruthy();
    // net 1500 gain and -500 loss both shown
    expect(screen.getByText(/\+\s?1 ?500,00/)).toBeTruthy();
    expect(screen.getByText(/−\s?500,00|-\s?500,00/)).toBeTruthy();
  });

  it('shows the raw year as the label in year granularity', () => {
    render(
      <CashflowCard
        series={[{ period: '2026', income: 9000, expense: -4000, net: 5000 }]}
        granularity="year"
        onGranularityChange={() => {}}
      />,
    );
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('calls onGranularityChange when the Année toggle is clicked', () => {
    let picked = '';
    render(
      <CashflowCard
        series={series}
        granularity="month"
        onGranularityChange={(g) => {
          picked = g;
        }}
      />,
    );
    fireEvent.click(screen.getByText('Année'));
    expect(picked).toBe('year');
  });

  it('shows an empty state with no data', () => {
    render(<CashflowCard series={[]} granularity="month" onGranularityChange={() => {}} />);
    expect(screen.getByText(/importez un relevé/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `src/renderer/components/dashboard/CashflowCard.tsx`:

```typescript
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';
import { formatBalance } from '../../lib/dashboardMap';
import { monthLabelFr } from '../../lib/dashboardCharts';

export interface CashflowCardProps {
  series: CashflowPoint[];
  granularity: CashflowGranularity;
  onGranularityChange: (g: CashflowGranularity) => void;
}

function periodLabel(period: string, granularity: CashflowGranularity): string {
  if (granularity === 'year') return period;
  return `${monthLabelFr(period)} ${period.slice(0, 4)}`;
}

/** Signed euro with an explicit + / − sign for the net column. */
function signedEuro(n: number): string {
  const sign = n >= 0 ? '+ ' : '− ';
  return `${sign}${formatBalance(Math.abs(n))} €`;
}

export function CashflowCard({ series, granularity, onGranularityChange }: CashflowCardProps) {
  const rows = [...series].reverse(); // most recent first
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>— I</Overline>
          <span className="truncate font-sans text-sm font-medium tracking-[-0.012em]">
            Gains et pertes · tous comptes
          </span>
        </div>
        <div className="flex gap-1.5">
          <Chip active={granularity === 'month'} onClick={() => onGranularityChange('month')}>
            Mois
          </Chip>
          <Chip active={granularity === 'year'} onClick={() => onGranularityChange('year')}>
            Année
          </Chip>
        </div>
      </div>

      {rows.length > 0 ? (
        <table className="w-full border-collapse font-sans text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-t border-line-2/70">
                <td className="py-2 text-paper-soft">{periodLabel(r.period, granularity)}</td>
                <td className="py-2 text-right tabular-nums text-paper-mute">
                  {formatBalance(r.income)} €
                </td>
                <td className="py-2 text-right tabular-nums text-paper-mute">
                  {formatBalance(r.expense)} €
                </td>
                <td
                  className="py-2 text-right font-medium tabular-nums"
                  style={{ color: r.net >= 0 ? 'var(--sage)' : 'var(--coral)' }}
                >
                  {signedEuro(r.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex min-h-[120px] w-full items-center justify-center text-sm text-paper-mute">
          Pas encore de données — importez un relevé.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4:** Run → PASS. `npx tsc --noEmit` clean. (If the sign/space assertions are brittle, match the component's exact output.)

- [ ] **Step 5: Commit** `feat(reports): CashflowCard — gained/lost per period with month/year toggle`

---

### Task 3: Reports page + routing + sidebar

- [ ] **Step 1: Test** `tests/unit/renderer/ReportsPage.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { ReportsPage } from '@renderer/pages/ReportsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockResolvedValue({
    series: [{ period: '2026-04', income: 2000, expense: -500, net: 1500 }],
  } as never);
});

describe('ReportsPage', () => {
  it('renders the cash-flow card from the channel data', async () => {
    render(<ReportsPage />);
    await waitFor(() => expect(screen.getByText(/gains et pertes/i)).toBeTruthy());
    expect(screen.getByText(/avril 2026/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `src/renderer/pages/ReportsPage.tsx`:

```typescript
import { CashflowCard } from '../components/dashboard/CashflowCard';
import { useCashflow } from '../hooks/useCashflow';

/**
 * Reports — the retrospective surface (ADR-009). A1 ships the consolidated
 * gained/lost section; A2 adds the remaining analyses (net worth, top
 * categories, savings rate, recurring, year-vs-N-1, biggest movements).
 */
export function ReportsPage() {
  const { series, granularity, setGranularity } = useCashflow();
  return (
    <div className="flex flex-col gap-4">
      <CashflowCard series={series} granularity={granularity} onGranularityChange={setGranularity} />
    </div>
  );
}
```

- [ ] **Step 4: Route** — in `src/renderer/App.tsx` add the import `import { ReportsPage } from './pages/ReportsPage';` and the route after the categories route:

```tsx
<Route path="/reports" element={<ReportsPage />} />
```

- [ ] **Step 5: Sidebar** — in `src/renderer/components/Sidebar.tsx`, flip the reports entry to enabled:

```typescript
      { path: '/reports', label: 'Rapports', Icon: LineChart, enabled: true },
```

- [ ] **Step 6: Full gate.** `npx tsc --noEmit && npx vitest run && npm run lint`. Fix any Sidebar test that asserted `/reports` was disabled (update it to expect an enabled link).

- [ ] **Step 7: Commit** `feat(reports): Reports page hosting the cash-flow view; enable the nav entry`

---

## Self-review

- **Spec coverage (A1):** month + year gained/lost, consolidated, transfers excluded (data from F1) → `useCashflow` + `CashflowCard`; visible on a real page → `ReportsPage` + route + nav. Empty state graceful → Task 2 empty test. ✅
- **Placeholder scan:** none.
- **Type consistency:** `CashflowGranularity`/`CashflowPoint` from shared types throughout; `useCashflow` returns `{series, granularity, setGranularity}` consumed verbatim by `ReportsPage`; `CashflowCard` props match.
- **Out of A1:** the other six Reports analyses (net worth, top categories, savings rate, recurring, year-vs-N-1, biggest movements) are A2; recurring detection itself is D1.
