# Aurora PR 1 — Global Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the whole app to the Aurora identity in one low-risk PR — swap the CSS token block, merge the additive Tailwind keys, add a dark/light theme toggle (lime accent only), introduce the glass `.tile` / `.aurora-bg` primitives, the new brand mark, and retire the Instrument-Serif italic figures.

**Architecture:** The app binds Tailwind utilities to CSS variables in `globals.css`. Aurora reuses every existing variable name and only changes values, so swapping the token block reskins ~90% of the app with zero component edits. Three surgical additions finish it: a `ThemeProvider` (writes `data-theme` on `<html>`, persists to `localStorage`), the glass component classes, and a de-serif sweep of the ~17 figure call sites. **Lime accent only** — the handoff's violet/cyan/coral `data-accent` blocks and the accent-swatch UI are dropped.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind (`darkMode: 'class'`), shadcn/ui, Vitest 4 (jsdom per-file directive + explicit `cleanup()`), Electron renderer.

**Source files (handoff, canonical "(Copy) (1)" folder):**
`/mnt/c/Users/denis/Downloads/Finance Dashboard Design System (Copy) (1)/design_handoff_aurora/` — `globals.aurora.css`, `tailwind.aurora.snippet.ts`, `ThemeAccentProvider.tsx`, `brand-mark.svg`.

**Branch:** `feat/aurora-global-reskin` off `main` (open as its own PR; this PR is heavily visual → maintainer validates in-app before merge).

---

## File Structure

- **Create** `src/renderer/components/ThemeProvider.tsx` — context provider + `useTheme()` hook. Owns `theme: 'dark' | 'light'`, writes `data-theme` + toggles the `dark` class on `<html>`, persists to `localStorage` (key `theme`), defaults `dark`. One responsibility: theme state + DOM/storage sync.
- **Create** `tests/unit/renderer/ThemeProvider.test.tsx` — behaviour of the provider/hook.
- **Modify** `src/renderer/styles/globals.css` — replace with the Aurora token block + glass/motion helpers (lime-only).
- **Modify** `tailwind.config.ts` — point `serif` family at Geist; merge additive Aurora keys (surfaces, radii, shadows, blur).
- **Modify** `src/renderer/App.tsx` — wrap the tree in `<ThemeProvider>`.
- **Modify** `src/renderer/components/AppShell.tsx` — drop the opaque root bg, mount `<div className="aurora-bg" />`, layer content at `z-10`.
- **Modify** `src/renderer/components/Sidebar.tsx` — swap the serif-ƒ `BrandMark` for the rising-line mark; de-serif the "Dashboard" wordmark.
- **Modify** `src/renderer/components/Topbar.tsx` — add the theme-toggle button; de-serif the page title; add the missing `/patrimoine` breadcrumb entry.
- **Modify** the remaining 6 de-serif call sites (Kpi, Insight, NetWorthAnchor, DonutCard, VerdictRow, ReportsPage, TransactionReviewTable).
- **Modify** `src/renderer/pages/SettingsPage.tsx` — wire the real dark/light toggle into the existing "Apparence" stub (replaces the "Clair · À venir" `SoonBadge`).

---

## Task 1: ThemeProvider + useTheme hook (TDD)

**Files:**

- Create: `src/renderer/components/ThemeProvider.tsx`
- Test: `tests/unit/renderer/ThemeProvider.test.tsx`

Follows the existing `useSidebarCollapse` persistence pattern (localStorage in a try/catch). Reduced from the handoff's `ThemeAccentProvider` — **no accent state**.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '@renderer/components/ThemeProvider';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} data-testid="probe">
      {theme}
    </button>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => {
    cleanup();
  });

  it('defaults to dark and reflects it on <html>', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles to light, syncs <html> and persists', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('probe'));
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('reads the persisted theme on mount', () => {
    localStorage.setItem('theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('throws when useTheme is used outside the provider', () => {
    function Bare() {
      useTheme();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/renderer/ThemeProvider.test.tsx`
Expected: FAIL — `Cannot find module '@renderer/components/ThemeProvider'`.

- [ ] **Step 3: Write the implementation**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

interface ThemeValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const STORAGE_KEY = 'theme';

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Owns the dark/light theme. Aurora keys every colour off `data-theme` on
 * <html> (light overrides via `:root[data-theme="light"]`), so writing that
 * attribute is the only wiring colours need. The `dark` class is kept in sync
 * for any shadcn `dark:` utilities. Lime is the sole accent — no `data-accent`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // persistence is best-effort; ignore storage failures
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ theme, setTheme: setThemeState, toggleTheme }),
    [theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/renderer/ThemeProvider.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ThemeProvider.tsx tests/unit/renderer/ThemeProvider.test.tsx
git commit -m "feat(aurora): add ThemeProvider (dark/light, lime-only)"
```

---

## Task 2: Wrap the app in ThemeProvider

**Files:**

- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add the import and wrap the tree**

Add the import after the `Toaster` import:

```tsx
import { ThemeProvider } from './components/ThemeProvider';
```

Wrap the existing `<HashRouter>…</HashRouter>` so the whole UI sits inside the provider:

```tsx
export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <Toaster richColors />
        <SyncLaunchGate />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/patrimoine" element={<PatrimoinePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(aurora): wrap app in ThemeProvider"
```

---

## Task 3: Swap the CSS token block (lime-only)

**Files:**

- Modify: `src/renderer/styles/globals.css` (replace lines 1-244 wholesale)

The handoff's `globals.aurora.css` is a verified superset of the current variable names. Use it verbatim **except**: delete the three `data-accent` variant lines (lime is the only accent). Keep the Geist `@fontsource` imports; the Instrument-Serif imports are already absent from the Aurora file.

- [ ] **Step 1: Replace the file with the Aurora token block**

Copy the full contents of
`/mnt/c/Users/denis/Downloads/Finance Dashboard Design System (Copy) (1)/design_handoff_aurora/globals.aurora.css`
into `src/renderer/styles/globals.css`, then **delete these three lines** (the violet/cyan/coral accent variants — lime-only scope):

```css
:root[data-accent='violet'] {
  --accent-brand: #b9a3ff;
  --accent-2: #d2c4ff;
  --accent-ink: #16102b;
  --accent-glow: 185 163 255;
  --primary: 258 100% 82%;
  --ring: 258 100% 82%;
}
:root[data-accent='cyan'] {
  --accent-brand: #5fd0f5;
  --accent-2: #a6e6fb;
  --accent-ink: #04222e;
  --accent-glow: 95 208 245;
  --primary: 197 88% 67%;
  --ring: 197 88% 67%;
}
:root[data-accent='coral'] {
  --accent-brand: #ff9d6b;
  --accent-2: #ffc3a1;
  --accent-ink: #2a1407;
  --accent-glow: 255 157 107;
  --primary: 20 100% 71%;
  --ring: 20 100% 71%;
}
```

Also remove the now-stale comment fragment "4 accent variants," from the file header (lines 5-6) so the doc matches reality — change it to read "+ light theme, .aurora-bg glow, .tile glass class, motion."

- [ ] **Step 2: Verify the dev build compiles the CSS**

Run: `npm run build`
Expected: build succeeds (Vite processes the CSS; no unknown `@import`/`@layer` errors).

- [ ] **Step 3: Verify no Instrument-Serif import survived**

Run: `grep -n "instrument-serif" src/renderer/styles/globals.css`
Expected: no output (the serif font is retired).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/globals.css
git commit -m "feat(aurora): swap CSS token block to Aurora (lime-only)"
```

---

## Task 4: Merge additive Aurora keys into tailwind.config.ts

**Files:**

- Modify: `tailwind.config.ts`

Two changes: (a) point the `serif` family at Geist so any residual `font-serif` class renders Geist (the typeface is retired), and (b) add the Aurora-native handles (glass surfaces, soft radii, glass shadows, blur). Existing keys are untouched — their _values_ already moved in Task 3.

- [ ] **Step 1: Repoint the serif family at Geist**

Replace the `serif` line in `theme.extend.fontFamily` (currently line 20):

```ts
        serif: ['"Instrument Serif"', 'Cambria', '"Times New Roman"', 'serif'],
```

with:

```ts
        // Serif is retired in Aurora; alias to Geist so any residual `font-serif`
        // call site renders the sans face (figures are bold Geist now).
        serif: [
          '"Geist Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
```

- [ ] **Step 2: Add the Aurora surface/text colours**

In `theme.extend.colors`, add these keys (after the `cat` block, before the closing brace of `colors`):

```ts
        // ---- Aurora-native handles (additive) ----
        accentBrand: 'var(--accent-brand)',
        accent2: 'var(--accent-2)',
        'accent-ink': 'var(--accent-ink)',
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          solid: 'var(--surface-solid)',
        },
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          4: 'var(--text-4)',
        },
        income: 'var(--income)',
        expense: 'var(--expense)',
        flagc: 'var(--flag-color)',
```

- [ ] **Step 3: Add the Aurora radii, shadows, and blur**

Add the soft radii to `theme.extend.borderRadius` (after `full`):

```ts
        'r-xs': 'var(--radius-xs)',
        'r-sm': 'var(--radius-sm)',
        'r-md': 'var(--radius-md)',
        'r-lg': 'var(--radius-lg)',
        'r-xl': 'var(--radius-xl)',
```

Add the glass shadows to `theme.extend.boxShadow` (after `modal`):

```ts
        glass: 'var(--shadow)',
        'glass-lg': 'var(--shadow-lg)',
        pop: 'var(--shadow-pop)',
        'glow-accent': 'var(--glow-accent)',
```

Add a new `backdropBlur` key under `theme.extend` (sibling of `boxShadow`):

```ts
      backdropBlur: {
        glass: '18px',
      },
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(aurora): merge additive Aurora keys into tailwind config"
```

---

## Task 5: Mount the aurora-bg glow in AppShell

**Files:**

- Modify: `src/renderer/components/AppShell.tsx`

The `.aurora-bg` is `position: fixed; inset: 0; z-index: 0` and `pointer-events: none`. The current root div paints an opaque `bg-ink-1`, which would hide the glow — drop it (the `<body>` already paints `--bg`) and layer the real content above the glow with `relative z-10`.

- [ ] **Step 1: Edit the root container**

Replace the opening root div (line 19):

```tsx
    <div className="flex h-full bg-ink-1">
```

with the glow as the first child and the content wrapper raised above it:

```tsx
    <div className="relative flex h-full">
      <div className="aurora-bg" aria-hidden />
      <div className="relative z-10 flex h-full w-full min-w-0">
```

Then add the matching extra closing `</div>` immediately before the existing final `</div>` of the component (so the new `z-10` wrapper is closed). The `<ImportModal>` and `<CreateAccountModal>` stay inside the outermost div.

Concretely, the JSX becomes:

```tsx
return (
  <div className="relative flex h-full">
    <div className="aurora-bg" aria-hidden />
    <div className="relative z-10 flex h-full w-full min-w-0">
      <Sidebar
        onImport={() => {
          setImportOpen(true);
        }}
        netWorth={netWorth}
        monthDelta={monthDelta}
        collapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onImport={() => {
            setImportOpen(true);
          }}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-5 xl:gap-5 xl:px-7 xl:pb-8 xl:pt-6 [&>*]:shrink-0">
          <Outlet
            context={
              {
                refreshToken,
                openImport: () => {
                  setImportOpen(true);
                },
                openCreateAccount: () => {
                  setCreateAccountOpen(true);
                },
                notifyDataChanged: () => {
                  setRefreshToken((t) => t + 1);
                },
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>
    </div>
    <ImportModal
      open={importOpen}
      onClose={() => {
        setImportOpen(false);
      }}
      onImported={() => {
        setRefreshToken((t) => t + 1);
      }}
    />
    <CreateAccountModal
      open={createAccountOpen}
      onClose={() => {
        setCreateAccountOpen(false);
      }}
      onCreated={() => {
        setRefreshToken((t) => t + 1);
      }}
    />
  </div>
);
```

- [ ] **Step 2: Verify the existing AppShell test still passes**

Run: `npx vitest run tests/unit/renderer/AppShell.test.tsx`
Expected: PASS (layout change only; no behaviour change).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/AppShell.tsx
git commit -m "feat(aurora): mount aurora-bg glow behind the app"
```

---

## Task 6: New brand mark + de-serif wordmark (Sidebar)

**Files:**

- Modify: `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Replace the `BrandMark` component**

Swap the serif-ƒ SVG (lines 70-97) for the rising-line mark from `brand-mark.svg`. The mark is a filled lime tile, so it does **not** inherit `currentColor` — remove the `text-brass` wrapper styling reliance by rendering the mark's own colours:

```tsx
function BrandMark() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="var(--accent-brand)" />
      <g transform="translate(8,8)">
        <polyline
          points="3,17 9,11 13,14 21,5"
          fill="none"
          stroke="var(--accent-ink)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21" cy="5" r="2.4" fill="var(--accent-ink)" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: De-serif the "Dashboard" wordmark**

The wordmark `<span>` (currently line 220) uses `font-serif text-[15px] italic font-normal`. Replace those classes so it renders Geist:

```tsx
<span className="font-sans text-[14px] font-semibold leading-none tracking-[-0.015em] text-paper-soft">
  Dashboard
</span>
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat(aurora): rising-line brand mark + de-serif wordmark"
```

---

## Task 7: Theme toggle + de-serif title + patrimoine breadcrumb (Topbar)

**Files:**

- Modify: `src/renderer/components/Topbar.tsx`

- [ ] **Step 1: Add the missing `/patrimoine` entry to `PAGE_META`**

After the `/reports` line in `PAGE_META`:

```tsx
  '/patrimoine': { title: 'Patrimoine', breadcrumb: ['Vue', 'Patrimoine'] },
```

- [ ] **Step 2: Import the theme hook + icons**

Update the lucide import and add the hook import:

```tsx
import { Moon, PanelLeft, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
```

- [ ] **Step 3: Read the theme in the component body**

At the top of the `Topbar` function body, after the `meta`/`toggleLabel` lines:

```tsx
const { theme, toggleTheme } = useTheme();
const themeLabel = theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';
```

- [ ] **Step 4: De-serif the page title**

Replace the `<h1>` (currently line 76):

```tsx
<h1 className="truncate font-sans text-[22px] font-semibold leading-[1.05] tracking-[-0.015em] text-paper xl:text-[26px]">
  {meta.title}
</h1>
```

- [ ] **Step 5: Add the theme-toggle button before the Import button**

Replace the trailing `<span className="flex-1" />` + Import button block with a theme toggle to the left of the Import action:

```tsx
      <span className="flex-1" />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-paper-mute transition-colors hover:bg-surface-2 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              {theme === 'dark' ? (
                <Sun size={17} strokeWidth={1.7} />
              ) : (
                <Moon size={17} strokeWidth={1.7} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{themeLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button onClick={onImport} className="shrink-0">
        Importer un relevé
      </Button>
```

(The `Importer un relevé` label stays — the Import hub is PR 2.)

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Topbar.tsx
git commit -m "feat(aurora): topbar theme toggle, de-serif title, patrimoine breadcrumb"
```

---

## Task 8: De-serif the remaining figure call sites

**Files (the 6 still matching after Tasks 6-7):** `src/renderer/components/dashboard/Kpi.tsx`, `src/renderer/components/dashboard/Insight.tsx`, `src/renderer/components/NetWorthAnchor.tsx`, `src/renderer/components/reports/DonutCard.tsx`, `src/renderer/components/reports/VerdictRow.tsx`, `src/renderer/pages/ReportsPage.tsx`, `src/renderer/components/TransactionReviewTable.tsx`

Deterministic transformation: on every matched line, **remove the `italic` utility** and **replace `font-serif` with `font-sans font-semibold`**, keeping all size / tracking / leading / colour classes. (Tailwind's `serif` already aliases to Geist after Task 4, so this is about killing synthetic italic and making the weight explicit — the signature figures become bold Geist.)

- [ ] **Step 1: List every remaining call site**

Run: `grep -rn "font-serif\|italic" src/renderer/components src/renderer/pages`
Expected: a handful of lines in the files listed above. Note each file:line.

- [ ] **Step 2: Apply the transformation in each file**

For each matched line, read its surrounding JSX and edit it per the rule above. Example (a KPI figure):

```tsx
// Before
<span className="font-serif italic text-hero leading-figure tracking-figure tabular-nums">
// After
<span className="font-sans font-semibold text-hero leading-figure tracking-figure tabular-nums">
```

`Insight.tsx` quotes use serif for editorial tone — apply the same rule (they become Geist; the Aurora design drops the serif voice entirely).

- [ ] **Step 3: Verify nothing serif/italic remains in app chrome**

Run: `grep -rn "font-serif\|italic" src/renderer/components src/renderer/pages`
Expected: no output.

- [ ] **Step 4: Run the affected component tests**

Run: `npx vitest run tests/unit/renderer/VerdictRow.test.tsx tests/unit/renderer/DashboardPage.test.tsx`
Expected: PASS (class-only changes; assertions are on text/values, not on `italic`). If any test asserts on a serif/italic class, update the assertion to the new class.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components src/renderer/pages
git commit -m "feat(aurora): de-serif signature figures to bold Geist"
```

---

## Task 9: Wire the real theme toggle into Settings → Apparence

**Files:**

- Modify: `src/renderer/pages/SettingsPage.tsx` (`AppearanceSection`, ~line 95)

The section already has a "Thème" row with `<Chip active>Sombre</Chip>` + a disabled `<Chip>Clair</Chip>` + `<SoonBadge />`. Replace the stub with live chips driven by `useTheme`.

- [ ] **Step 1: Import the hook**

Add near the top of the file:

```tsx
import { useTheme } from '../components/ThemeProvider';
```

- [ ] **Step 2: Make the chips interactive**

Replace the `AppearanceSection`'s "Thème" `Row` body (the `<div className="flex items-center gap-2">…</div>` containing the two chips + `SoonBadge`) with:

```tsx
<Row label="Thème">
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}>
      <Chip active={theme === 'dark'}>Sombre</Chip>
    </button>
    <button type="button" onClick={() => setTheme('light')} aria-pressed={theme === 'light'}>
      <Chip active={theme === 'light'}>Clair</Chip>
    </button>
  </div>
</Row>
```

Add `const { theme, setTheme } = useTheme();` at the top of the `AppearanceSection` function body. Remove the now-unused `SoonBadge` usage here (and the import if it is unused elsewhere — check with `grep -n "SoonBadge" src/renderer/pages/SettingsPage.tsx`).

- [ ] **Step 3: Verify `Chip` accepts an `active` boolean expression**

Run: `grep -n "active" src/renderer/components/ui/chip.tsx`
Expected: `active?: boolean` prop exists (it is already used as `<Chip active>`). If the prop is required-truthy only, confirm `active={false}` renders the inactive variant.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/SettingsPage.tsx
git commit -m "feat(aurora): wire dark/light toggle into Settings Apparence"
```

---

## Task 10: Full verification + open PR

**Files:** none (verification only)

- [ ] **Step 1: Lint, typecheck, unit tests, build**

Run: `npm run lint && npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 2: Anti-regression guard (design primitives)**

Run: `grep -rn "fixed inset-0\|Intl.NumberFormat" src/renderer`
Expected: no new hits vs `main` (modals still use `ui/dialog`; amounts still go through `lib/euro` / `<Money>`). This PR adds none.

- [ ] **Step 3: Confirm reduced-motion + serif retirement**

Run: `grep -n "prefers-reduced-motion" src/renderer/styles/globals.css` (expect the `.anim-rise`/`[data-chart-bar]` block present) and `grep -rn "instrument-serif\|Instrument Serif" src/renderer tailwind.config.ts` (expect no output).

- [ ] **Step 4: Launch the app for maintainer validation**

Run: `npm run dev`
Validation script (maintainer, in-app):

- App renders in Aurora dark: deep canvas, lime accent, glass-ready surfaces, the aurora-bg glow visible behind content, bold-Geist figures (no serif italic anywhere).
- The new rising-line brand mark shows in the sidebar lockup.
- Topbar sun/moon toggle flips **dark ⇄ light**; the choice **persists across an app restart**.
- In **light** theme, the active sidebar nav item is clearly legible (the contrast bug is gone) — check every screen in light.
- Settings → Apparence: the Sombre/Clair chips reflect and drive the same theme as the topbar toggle.
- All 7 screens render without layout breakage (full restyle of each screen lands in later PRs; here we only confirm nothing is broken).

- [ ] **Step 5: Open the PR (self-merge gated on maintainer in-app validation)**

```bash
git push -u origin feat/aurora-global-reskin
gh pr create --title "feat(aurora): global reskin — token swap, theme toggle, glass primitives" \
  --body "$(cat <<'EOF'
Implements PR 1 of the Aurora redesign (spec: docs/superpowers/specs/2026-06-16-aurora-redesign-design.md).

- Swap the CSS token block to Aurora values (lime accent only; dropped the violet/cyan/coral variants).
- Merge additive Tailwind keys (glass surfaces, soft radii, glass shadows, backdrop blur); alias the serif family to Geist.
- Add ThemeProvider (dark/light, persisted) + topbar toggle + Settings → Apparence wiring; fix the light-theme sidebar contrast.
- Add the .tile / .aurora-bg glass primitives and the aurora-bg glow behind the app.
- New rising-line brand mark; de-serif the signature figures to bold Geist.

The whole app reskins; per-screen structure/UX lands in later PRs. Visual change → maintainer validates in-app before merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage (PR 1 scope, spec §6):** token swap (Tasks 3-4 ✓), `.tile`/`.aurora-bg` (Task 3 ✓), figures→Geist (Tasks 6-8 ✓), brand mark (Task 6 ✓), theme toggle dark/light + provider + topbar + Apparence + contrast fix (Tasks 1-2, 7, 9-10 ✓), lime-only / dropped accent variants (Task 3 ✓), reduced-motion + ResizeObserver: reduced-motion ships in the CSS (Task 3 ✓); the chart `useWidth` guard belongs to the Dashboard PR (PR 3), not here — noted, out of PR 1 scope. The `/patrimoine` breadcrumb bug fix is folded in (Task 7).

**Placeholder scan:** no TBD/TODO; every code step shows real code; the de-serif sweep (Task 8) gives the exact deterministic transformation + a concrete example + the grep that enumerates the targets (an agent reading the files applies the fixed rule — not a vague instruction).

**Type consistency:** `useTheme()` returns `{ theme, setTheme, toggleTheme }` (Task 1) and is consumed with exactly those names in Tasks 7 and 9. `ThemeProvider` import path `./components/ThemeProvider` (Task 2) matches the create path (Task 1) and the relative imports from Topbar (`./ThemeProvider`) and SettingsPage (`../components/ThemeProvider`). Storage key `theme` is consistent across provider and test.
