# Manual Bank Mapping Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LLM column-order inference for unknown banks with a deterministic header suggestion + a manual confirmation UI, and remove the learn-flow's LLM plumbing (model-required step, forced download dialog, auto-resume).

**Architecture:** The `ColumnOrder` type moves to `src/shared/types/bank.ts` (the renderer now composes it). A new `suggestColumns.ts` in main scans the PDF text lines for the canonical French header keywords and pre-fills the order; `inferColumns.ts` (prompt + LLM parsing) is deleted. `banks:prepareMapping` (new IPC) feeds the assistant; `banks:learn` now receives the user-confirmed order and derives/persists deterministically. The renderer's `unknownBank` step becomes the assistant (six column selects, pre-filled); the `modelRequired` step and `PdfModelRequiredDialog` are removed.

**Tech Stack:** Electron main (pdfjs-dist text items, node:sqlite), React renderer (typed IPC), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-11-mapping-assistant-design.md`

**Branch / worktree:** `feat/mapping-assistant` in `/home/denis/finance-dashboard/.claude/worktrees/mapping-assistant` (run everything from there).

**Conventions that bite:**

- TS strict; `no-explicit-any`/`no-unsafe-*`/`no-non-null-assertion` are errors; `noUncheckedIndexedAccess` on (array indexing returns `T | undefined` — narrow with a guard, never `!`).
- Renderer tests: `// @vitest-environment jsdom` line 1 + explicit `afterEach(() => { cleanup(); })`.
- Husky pre-commit reformats staged files — if a commit fails, re-add and retry.

---

### Task 1: shared `ColumnOrder` + deterministic header suggester

**Files:**

- Modify: `src/shared/types/bank.ts` (add ColumnOrder)
- Create: `src/main/import/pdf/suggestColumns.ts`
- Test: `tests/unit/import/pdf/suggestColumns.test.ts`

- [ ] **Step 1: Add the shared type**

In `src/shared/types/bank.ts`, add at the top of the file:

```ts
/** Column order of a statement's table (1 = leftmost). null = column absent. */
export interface ColumnOrder {
  date: number;
  valeur: number | null;
  label: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}
```

(The same shape currently lives in `src/main/import/pdf/inferColumns.ts`; it moves here because the renderer will compose one. Task 2 rewires main-side imports.)

- [ ] **Step 2: Write the failing test**

Create `tests/unit/import/pdf/suggestColumns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  suggestColumnOrder,
  validateColumnOrder,
} from '../../../../src/main/import/pdf/suggestColumns';
import type { PdfPage, PdfTextItem } from '../../../../src/main/import/pdf/extract';

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: 0 };
}

function page(items: PdfTextItem[]): PdfPage[] {
  return [{ pageNumber: 1, items }];
}

describe('suggestColumnOrder', () => {
  it('finds the header line and orders the columns by x', () => {
    const pages = page([
      item('Relevé de compte', 40, 700),
      // header line (same y)
      item('Date', 40, 650),
      item('Valeur', 90, 650),
      item('Libellé', 140, 650),
      item('Débit', 420, 650),
      item('Crédit', 480, 650),
      item('Solde', 540, 650),
      // a transaction row
      item('10/06/26', 40, 630),
    ]);

    expect(suggestColumnOrder(pages)).toEqual({
      order: { date: 1, valeur: 2, label: 3, debit: 4, credit: 5, balance: 6 },
      headerTokens: ['Date', 'Valeur', 'Libellé', 'Débit', 'Crédit', 'Solde'],
    });
  });

  it('matches aliases accent-insensitively and tolerates a partial header', () => {
    const pages = page([
      item('DATE', 40, 650),
      item('NATURE', 120, 650.8), // y within tolerance; NATURE → label
      item('DEBIT', 420, 649.5),
    ]);

    expect(suggestColumnOrder(pages)).toEqual({
      order: { date: 1, valeur: null, label: 2, debit: 3, credit: null, balance: null },
      headerTokens: ['DATE', 'NATURE', 'DEBIT'],
    });
  });

  it('ignores decoy lines with fewer than 3 distinct keywords', () => {
    const pages = page([
      item('Date du relevé : 02/07/2025', 40, 700),
      item('Solde précédent', 40, 680),
      item('10/06/26', 40, 630),
    ]);

    expect(suggestColumnOrder(pages)).toBeNull();
  });

  it('counts DISTINCT keys: duplicated aliases on one line do not qualify', () => {
    const pages = page([item('Date', 40, 650), item('date', 90, 650), item('valeur', 140, 650)]);

    expect(suggestColumnOrder(pages)).toBeNull();
  });
});

describe('validateColumnOrder', () => {
  it('accepts a minimal valid order', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 2,
        debit: 3,
        credit: null,
        balance: null,
      }),
    ).toBe(true);
  });

  it('rejects a missing amount column', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 2,
        debit: null,
        credit: null,
        balance: null,
      }),
    ).toBe(false);
  });

  it('rejects duplicate positions', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 1,
        debit: 2,
        credit: null,
        balance: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/import/pdf/suggestColumns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/main/import/pdf/suggestColumns.ts`:

```ts
import type { ColumnOrder } from '@shared/types/bank';
import type { PdfPage, PdfTextItem } from './extract';

export type { ColumnOrder };

// Accent-stripped, lowercased header words → canonical key. Same vocabulary the
// LLM prompt used to tolerate; now it powers the deterministic suggestion.
const KEY_ALIASES: Record<string, keyof ColumnOrder> = {
  date: 'date',
  valeur: 'valeur',
  value: 'valeur',
  label: 'label',
  libelle: 'label',
  nature: 'label',
  debit: 'debit',
  credit: 'credit',
  balance: 'balance',
  solde: 'balance',
};

function normalizeKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Same-line grouping tolerance: pdfjs y jitters by fractions of a point. */
const Y_TOLERANCE = 2;

export interface ColumnSuggestion {
  readonly order: ColumnOrder;
  readonly headerTokens: string[];
}

/**
 * Deterministic replacement for the LLM column inference: nearly every French
 * statement has a header line naming its columns. Group items into lines by y,
 * take the first line carrying ≥ 3 DISTINCT canonical keys, and number the
 * matches left-to-right. Null when no line qualifies — the assistant then lets
 * the user compose the order manually.
 */
export function suggestColumnOrder(pages: readonly PdfPage[]): ColumnSuggestion | null {
  for (const p of pages) {
    const lines = groupByLine(p.items);
    for (const line of lines) {
      const matches: { key: keyof ColumnOrder; token: PdfTextItem }[] = [];
      for (const token of line) {
        const key = KEY_ALIASES[normalizeKey(token.str)];
        if (key !== undefined && !matches.some((m) => m.key === key)) {
          matches.push({ key, token });
        }
      }
      if (matches.length < 3) continue;

      matches.sort((a, b) => a.token.x - b.token.x);
      const order: ColumnOrder = {
        date: 0,
        valeur: null,
        label: 0,
        debit: null,
        credit: null,
        balance: null,
      };
      matches.forEach((m, i) => {
        order[m.key] = i + 1;
      });
      if (!validateColumnOrder(order)) continue;
      return { order, headerTokens: matches.map((m) => m.token.str) };
    }
  }
  return null;
}

/** Lines = items sharing a y within tolerance, top-to-bottom, left-to-right. */
function groupByLine(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;
  for (const it of sorted) {
    if (currentY === null || Math.abs(it.y - currentY) <= Y_TOLERANCE) {
      current.push(it);
      currentY ??= it.y;
    } else {
      lines.push(current);
      current = [it];
      currentY = it.y;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * A usable order: date + label present, at least one amount column, and no two
 * present columns sharing a position. Shared rule for the assistant (client) and
 * the banks:learn handler (server).
 */
export function validateColumnOrder(order: ColumnOrder): boolean {
  if (order.date < 1 || order.label < 1) return false;
  if (order.debit === null && order.credit === null) return false;
  const positions = [
    order.date,
    order.valeur,
    order.label,
    order.debit,
    order.credit,
    order.balance,
  ].filter((n): n is number => n !== null);
  if (positions.some((n) => n < 1 || !Number.isInteger(n))) return false;
  return new Set(positions).size === positions.length;
}
```

Note for the date:0/label:0 initialization: `matches.forEach` always assigns every matched key; `validateColumnOrder` rejects the order when date or label was NOT matched (0 < 1), which makes a `null` return for e.g. a valeur/debit/credit-only line. That is intended.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/import/pdf/suggestColumns.test.ts && npx tsc --noEmit`
Expected: 7 PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/bank.ts src/main/import/pdf/suggestColumns.ts tests/unit/import/pdf/suggestColumns.test.ts
git commit -m "feat(import): suggest a statement's column order from its header line"
```

---

### Task 2: rewire `learnBank`/`deriveMapping` to the shared type, delete `inferColumns`

**Files:**

- Modify: `src/main/import/pdf/learnBank.ts`
- Modify: `src/main/import/pdf/deriveMapping.ts:1-2` (ColumnOrder import)
- Delete: `src/main/import/pdf/inferColumns.ts`
- Delete: `tests/unit/import/pdf/inferColumns.test.ts`
- Test: `tests/unit/import/pdf/learnBank.test.ts` (update imports + drop the injection)

- [ ] **Step 1: Update the tests first**

In `tests/unit/import/pdf/learnBank.test.ts`:

- Replace the import `import type { ColumnOrder } from '../../../../src/main/import/pdf/inferColumns';` with `import type { ColumnOrder } from '@shared/types/bank';`
- `learnBankMapping` becomes synchronous and takes the order directly. Update its tests: replace every call shaped `await learnBankMapping(pages, () => Promise.resolve(order))` with `learnBankMapping(pages, order)` (and drop `await`/`async` where no longer needed). A test injecting a failing inference (`() => Promise.resolve(null)`), if present, is deleted — that path no longer exists.

- [ ] **Step 2: Implement the rewire**

In `src/main/import/pdf/deriveMapping.ts`, replace `import type { ColumnOrder } from './inferColumns';` with `import type { ColumnOrder } from '@shared/types/bank';`.

In `src/main/import/pdf/learnBank.ts`:

- Replace `import type { ColumnOrder } from './inferColumns';` with `import type { ColumnOrder } from '@shared/types/bank';`
- Replace `learnBankMapping` with the direct version:

```ts
/**
 * Derive a bank's x-threshold mapping from a sample statement and the
 * user-confirmed column order (deterministic — the LLM inference is gone,
 * ADR-019 phase 1b). Returns null if the columns can't be located in the
 * table region (the caller surfaces that as invalid_mapping).
 */
export function learnBankMapping(
  pages: readonly PdfPage[],
  order: ColumnOrder,
): ColumnMapping | null {
  // Derive thresholds from the table region only (excludes header/footer noise).
  return deriveColumnMapping(order, tableRegionItems(pages));
}
```

Delete `src/main/import/pdf/inferColumns.ts` and `tests/unit/import/pdf/inferColumns.test.ts` (`git rm`).

Note: `src/main/ipc/handlers/learnBank.ts` still imports `inferColumnOrder` at this point — Task 3 rewrites that handler. To keep this task compiling, do Tasks 2 and 3 in sequence WITHOUT running `tsc` between them, or (cleaner) temporarily leave the handler as is and accept the one tsc error until Task 3; the per-task test commands below scope to the pdf tests only. If you prefer strictly green commits, fold the handler rewrite of Task 3 Step 3 into this commit — the task split here is for review clarity, not compile isolation.

- [ ] **Step 3: Run the scoped tests**

Run: `npx vitest run tests/unit/import/pdf/`
Expected: all PASS (suggestColumns + learnBank + extract/derive suites; inferColumns suite gone).

- [ ] **Step 4: Commit (squashed with Task 3 if you chose strictly-green commits)**

```bash
git add -A src/main/import/pdf tests/unit/import/pdf
git commit -m "refactor(import): take the user-confirmed column order in learnBankMapping"
```

---

### Task 3: IPC — `banks:prepareMapping` + LLM-free `banks:learn`

**Files:**

- Modify: `src/shared/types/bank.ts` (payload/response types)
- Modify: `src/shared/types/ipc.ts` (contract entries)
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/ipc/handlers/learnBank.ts`
- Test: `tests/unit/ipc/learnBank.test.ts` (create if no handler test exists — check `tests/unit/ipc/` first; `confirmLearnsRoute.test.ts` and `confirmRouteLearnResilience.test.ts` exercise neighboring flows and may need mock updates if they stub `banks:learn` types)

- [ ] **Step 1: Shared types**

In `src/shared/types/bank.ts`:

```ts
export interface LearnBankInput {
  readonly path: string;
  readonly bankName: string;
  readonly order: ColumnOrder;
}

export type LearnBankResponse =
  | { readonly ok: true; readonly bankId: string }
  | { readonly ok: false; readonly error: 'not_pdf' | 'no_text' | 'invalid_mapping' };

export interface PrepareMappingInput {
  readonly path: string;
}

export type PrepareMappingResponse =
  | {
      readonly ok: true;
      readonly suggested: ColumnOrder | null;
      readonly headerTokens: string[];
    }
  | { readonly ok: false; readonly error: 'not_pdf' | 'no_text' };
```

In `src/shared/types/ipc.ts`, next to the existing `banks:learn` entry, add the import of the new types (mirroring the file's import style) and:

```ts
  'banks:prepareMapping': { payload: PrepareMappingInput; response: PrepareMappingResponse };
```

In `src/main/ipc/channels.ts`:

```ts
  banksPrepareMapping: 'banks:prepareMapping',
```

- [ ] **Step 2: Write the failing handler tests**

Create `tests/unit/ipc/learnBank.test.ts` (if a handler test already exists under another name, extend it instead — check first):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

// The handler reads the file and extracts PDF text; both are mocked so the test
// drives pure logic with synthetic pages.
vi.mock('../../../src/main/import/readImportFile', () => ({
  readImportFile: vi.fn(() => Buffer.from('%PDF-1.4 fake')),
}));
const extractMock = vi.fn();
vi.mock('../../../src/main/import/pdf/extract', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../src/main/import/pdf/extract')>();
  return { ...orig, extractPdfText: (...a: unknown[]) => extractMock(...a) as unknown };
});

import {
  handleBanksLearn,
  handleBanksPrepareMapping,
} from '../../../src/main/ipc/handlers/learnBank';

function headerPages(): PdfPage[] {
  return [
    {
      pageNumber: 1,
      items: [
        { str: 'Date', x: 40, y: 650, width: 0 },
        { str: 'Libellé', x: 140, y: 650, width: 0 },
        { str: 'Débit', x: 420, y: 650, width: 0 },
        { str: 'Crédit', x: 480, y: 650, width: 0 },
        { str: '10/06/26', x: 40, y: 630, width: 0 },
        { str: 'VIR RECU', x: 140, y: 630, width: 0 },
        { str: '109,43', x: 480, y: 630, width: 0 },
        { str: '30,65', x: 420, y: 610, width: 0 },
      ],
    },
  ];
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
  extractMock.mockResolvedValue({ hasText: true, pages: headerPages() });
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('handleBanksPrepareMapping', () => {
  it('returns the deterministic suggestion with the header tokens', async () => {
    const res = await handleBanksPrepareMapping({ path: '/x/releve.pdf' });
    expect(res).toEqual({
      ok: true,
      suggested: { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null },
      headerTokens: ['Date', 'Libellé', 'Débit', 'Crédit'],
    });
  });

  it('returns no_text when the PDF has no extractible text', async () => {
    extractMock.mockResolvedValue({ hasText: false, pages: [] });
    expect(await handleBanksPrepareMapping({ path: '/x/releve.pdf' })).toEqual({
      ok: false,
      error: 'no_text',
    });
  });
});

describe('handleBanksLearn', () => {
  it('persists the bank from a user-confirmed order without any model', async () => {
    const res = await handleBanksLearn({
      path: '/x/releve.pdf',
      bankName: 'Société Générale',
      order: { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null },
    });
    expect(res).toEqual({ ok: true, bankId: 'societe-generale' });
    expect(
      dbHolder.db
        ?.prepare('SELECT date_col FROM bank_column_mappings WHERE bank_id = ?')
        .get('societe-generale'),
    ).toBeDefined();
  });

  it('rejects an invalid order with invalid_mapping and persists nothing', async () => {
    const res = await handleBanksLearn({
      path: '/x/releve.pdf',
      bankName: 'Bad Bank',
      order: { date: 1, valeur: null, label: 1, debit: 2, credit: null, balance: null },
    });
    expect(res).toEqual({ ok: false, error: 'invalid_mapping' });
    expect(
      dbHolder.db?.prepare('SELECT 1 FROM banks WHERE id = ?').get('bad-bank'),
    ).toBeUndefined();
  });
});
```

(Adjust the mocking shape to reality: if `extractPdfText` is imported as a named import in the handler, the partial-module mock above works; check how `tests/unit/import/` files mock it if any do.)

- [ ] **Step 3: Rewrite the handler**

Replace the content of `src/main/ipc/handlers/learnBank.ts`:

```ts
import type {
  LearnBankInput,
  LearnBankResponse,
  PrepareMappingInput,
  PrepareMappingResponse,
} from '@shared/types/bank';
import { getDb } from '../../db';
import { extractPdfText } from '../../import/pdf/extract';
import type { PdfPage } from '../../import/pdf/extract';
import { suggestColumnOrder, validateColumnOrder } from '../../import/pdf/suggestColumns';
import { learnBankMapping, persistLearnedBank, slugifyBank } from '../../import/pdf/learnBank';
import { readImportFile } from '../../import/readImportFile';

const PDF_MAGIC = Buffer.from('%PDF-');

type PdfGuardResult = { ok: true; pages: PdfPage[] } | { ok: false; error: 'not_pdf' | 'no_text' };

/** Shared file guards: allowlisted path, %PDF magic, extractible text. */
async function loadPdfPages(path: string): Promise<PdfGuardResult> {
  let buffer: Buffer;
  try {
    buffer = readImportFile(path);
  } catch {
    return { ok: false, error: 'not_pdf' };
  }
  if (buffer.length < PDF_MAGIC.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return { ok: false, error: 'not_pdf' };
  }
  try {
    const res = await extractPdfText(buffer);
    if (!res.hasText) return { ok: false, error: 'no_text' };
    return { ok: true, pages: res.pages };
  } catch {
    return { ok: false, error: 'not_pdf' };
  }
}

/** Deterministic pre-fill for the mapping assistant (ADR-019 1b — no LLM). */
export async function handleBanksPrepareMapping(
  payload: PrepareMappingInput,
): Promise<PrepareMappingResponse> {
  const guard = await loadPdfPages(payload.path);
  if (!guard.ok) return guard;
  const suggestion = suggestColumnOrder(guard.pages);
  return {
    ok: true,
    suggested: suggestion?.order ?? null,
    headerTokens: suggestion?.headerTokens ?? [],
  };
}

/**
 * Persist an unknown bank from the user-confirmed column order. Fully
 * deterministic; subsequent imports of that bank are recognized via the stored
 * mapping. A wrong-but-derivable order is caught downstream by the arithmetic
 * check on the review screen.
 */
export async function handleBanksLearn(payload: LearnBankInput): Promise<LearnBankResponse> {
  const guard = await loadPdfPages(payload.path);
  if (!guard.ok) return guard;

  if (!validateColumnOrder(payload.order)) return { ok: false, error: 'invalid_mapping' };
  const mapping = learnBankMapping(guard.pages, payload.order);
  if (mapping === null) return { ok: false, error: 'invalid_mapping' };

  const bankId = slugifyBank(payload.bankName);
  persistLearnedBank(getDb(), {
    bankId,
    name: payload.bankName,
    signature: payload.bankName,
    mapping,
  });
  return { ok: true, bankId };
}
```

In `src/main/ipc/register.ts`: extend the existing learnBank import to `import { handleBanksLearn, handleBanksPrepareMapping } from './handlers/learnBank';` and add:

```ts
register(CHANNELS.banksPrepareMapping, handleBanksPrepareMapping);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/ipc/ tests/unit/import/ && npx tsc --noEmit`
Expected: all PASS, tsc clean (renderer still compiles because Task 4 hasn't changed its call yet — it WILL be red on `banks:learn` payload: the renderer's `ipc.invoke('banks:learn', { path, bankName })` now misses `order`. If tsc flags `useImport.ts`, proceed to Task 4 before the gate, or stage the renderer change minimally here by passing a placeholder — do NOT: instead run Tasks 3 and 4 back-to-back and gate after Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types src/main/ipc tests/unit/ipc
git commit -m "feat(import): expose the deterministic mapping suggestion and take the user order over IPC"
```

---

### Task 4: `useImport` state machine — assistant data in, modelRequired out

**Files:**

- Modify: `src/renderer/hooks/useImport.ts`
- Test: `tests/unit/renderer/useImportQueue.test.ts`

- [ ] **Step 1: Update the state machine**

In `src/renderer/hooks/useImport.ts`:

1. Imports: add `import type { ColumnOrder } from '@shared/types/bank';`
2. Sub-state changes:
   - `unknownBank` becomes:
     ```ts
     | {
         step: 'unknownBank';
         accountId: string;
         suggested: ColumnOrder | null;
         headerTokens: string[];
         mappingError: boolean;
       }
     ```
   - Delete the `modelRequired` sub-state line entirely.
3. Wherever the hook transitions TO `unknownBank` (the `unknown_bank` extract-error branch, ~line 190), call `banks:prepareMapping` first:
   ```ts
   if (res.error === 'unknown_bank') {
     const file = files[index];
     const prep =
       file === undefined
         ? null
         : await safeInvoke(ipc.invoke('banks:prepareMapping', { path: file.path }));
     if (prep === null || !prep.ok) {
       // Unreadable as a PDF here means it will not be learnable either:
       // surface the standard file error and move on.
       const message =
         prep === null ? UNEXPECTED_ERROR : (ERROR_MESSAGES[prep.error] ?? prep.error);
       setS({ step: 'queue', files, index, results, sub: { step: 'fileError', message } });
       return;
     }
     setS({
       step: 'queue',
       files,
       index,
       results,
       sub: {
         step: 'unknownBank',
         accountId,
         suggested: prep.suggested,
         headerTokens: prep.headerTokens,
         mappingError: false,
       },
     });
     return;
   }
   ```
   (Match the surrounding code's exact shape — read the branch before editing; the key changes are the prepare call and the enriched sub-state.)
4. `learnBank` signature becomes `(bankName: string, order: ColumnOrder) => Promise<void>` (update the `UseImport` interface too). New body — note the `invalid_mapping` path returns to the assistant with the inline-error flag instead of failing the file:
   ```ts
   async function learnBank(bankName: string, order: ColumnOrder): Promise<void> {
     const cur = stateRef.current;
     if (cur.step !== 'queue' || cur.sub.step !== 'unknownBank') return;
     const { accountId, suggested, headerTokens } = cur.sub;
     const file = cur.files[cur.index];
     if (file === undefined) return;
     setS({ ...cur, sub: { step: 'learning', accountId } });
     const res = await safeInvoke(ipc.invoke('banks:learn', { path: file.path, bankName, order }));
     if (res?.ok) {
       await runExtract(cur.files, cur.index, cur.results, accountId, false);
     } else if (res === null) {
       await advance(cur.files, cur.index, [
         ...cur.results,
         { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
       ]);
     } else if (res.error === 'invalid_mapping') {
       setS({
         ...cur,
         sub: { step: 'unknownBank', accountId, suggested, headerTokens, mappingError: true },
       });
     } else {
       await advance(cur.files, cur.index, [
         ...cur.results,
         {
           fileName: file.fileName,
           status: 'failed',
           error: ERROR_MESSAGES[res.error] ?? res.error,
         },
       ]);
     }
   }
   ```
5. Delete from `ERROR_MESSAGES`: the `model_unavailable` and `inference_failed` entries (now dead — verify with grep that nothing else reads them; the categorization pass has its own messages elsewhere). Add: `invalid_mapping: 'Colonnes introuvables avec ce mapping — vérifie l'ordre.',` — used inline by the assistant, and harmless in the map.

- [ ] **Step 2: Update the hook tests**

In `tests/unit/renderer/useImportQueue.test.ts`:

- The test `'transitions to modelRequired (not failure) when banks:learn returns model_unavailable'` (~line 254) is replaced by:

```ts
it('returns to the assistant with mappingError when banks:learn rejects the mapping', async () => {
  mockInvoke
    .mockResolvedValueOnce({ accounts: [ACCOUNT] }) // dashboard:getAccounts
    .mockResolvedValueOnce({ ok: false, error: 'unknown_bank' }) // import:extract
    .mockResolvedValueOnce({ ok: true, suggested: null, headerTokens: [] }) // banks:prepareMapping
    .mockResolvedValueOnce({ ok: false, error: 'invalid_mapping' }); // banks:learn

  // …drive the queue to unknownBank the same way the surrounding tests do
  // (start from paths, resolve account, reach unknownBank), then:
  await act(async () => {
    await result.current.learnBank('Crédit Agricole', {
      date: 1,
      valeur: null,
      label: 2,
      debit: 3,
      credit: null,
      balance: null,
    });
  });

  expect(stateOf(result).sub).toMatchObject({ step: 'unknownBank', mappingError: true });
});
```

(Adapt the scaffolding — mock-call order, `stateOf` helper or direct `result.current.state` access — to the file's existing idioms; read the original test before replacing it. Other tests in the file that drive the unknown-bank path must add the `banks:prepareMapping` mock resolution in sequence.)

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/unit/renderer/useImportQueue.test.ts && npx tsc --noEmit`
Expected: hook tests PASS; tsc still red ONLY in `ImportModal.tsx` (LearnBankView call signature) — fixed by Task 5. Run Tasks 4 and 5 back-to-back before gating.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useImport.ts tests/unit/renderer/useImportQueue.test.ts
git commit -m "feat(import): drive the mapping assistant state from prepareMapping"
```

---

### Task 5: the assistant UI — `MappingAssistantView`, modelRequired removal

**Files:**

- Modify: `src/renderer/components/ImportModal.tsx`
- Delete: `src/renderer/components/model/PdfModelRequiredDialog.tsx`
- Delete: `tests/unit/renderer/PdfModelRequiredDialog.test.tsx`
- Test: `tests/unit/renderer/MappingAssistant.test.tsx` (new)

- [ ] **Step 1: Write the failing view test**

Create `tests/unit/renderer/MappingAssistant.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { MappingAssistantView } from '@renderer/components/ImportModal';

afterEach(() => {
  cleanup();
});

const SUGGESTED = { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null };

describe('MappingAssistantView', () => {
  it('pre-fills the column slots from the suggestion and shows the header line', () => {
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError={false}
        onLearn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Date · Libellé · Débit · Crédit/)).toBeTruthy();
    expect(screen.getByLabelText('Colonne 1')).toHaveProperty('value', 'date');
    expect(screen.getByLabelText('Colonne 2')).toHaveProperty('value', 'label');
    expect(screen.getByLabelText('Colonne 3')).toHaveProperty('value', 'debit');
    expect(screen.getByLabelText('Colonne 4')).toHaveProperty('value', 'credit');
    expect(screen.getByLabelText('Colonne 5')).toHaveProperty('value', '');
  });

  it('submits the composed order with the bank name', async () => {
    const onLearn = vi.fn();
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError={false}
        onLearn={onLearn}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Nom de la banque/), 'Société Générale');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer cette banque' }));

    expect(onLearn).toHaveBeenCalledWith('Société Générale', {
      date: 1,
      valeur: null,
      label: 2,
      debit: 3,
      credit: 4,
      balance: null,
    });
  });

  it('blocks submit and explains when the composition is invalid', async () => {
    const onLearn = vi.fn();
    render(
      <MappingAssistantView
        suggested={null}
        headerTokens={[]}
        mappingError={false}
        onLearn={onLearn}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Nom de la banque/), 'X Bank');
    await userEvent.selectOptions(screen.getByLabelText('Colonne 1'), 'date');
    // no label, no amount yet
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer cette banque' }));

    expect(onLearn).not.toHaveBeenCalled();
    expect(screen.getByText(/libellé et au moins un montant/i)).toBeTruthy();
  });

  it('shows the backend rejection inline', () => {
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError
        onLearn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Colonnes introuvables/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/MappingAssistant.test.tsx`
Expected: FAIL — `MappingAssistantView` is not exported.

- [ ] **Step 3: Implement the view + removals**

In `src/renderer/components/ImportModal.tsx`:

1. Replace `LearnBankView` (and its call site) with `MappingAssistantView` — exported so the test can import it:

```tsx
const COLUMN_LABELS: { value: keyof ColumnOrder; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'valeur', label: 'Date valeur' },
  { value: 'label', label: 'Libellé' },
  { value: 'debit', label: 'Débit' },
  { value: 'credit', label: 'Crédit' },
  { value: 'balance', label: 'Solde' },
];

/** Slot values: '' = absent, otherwise a canonical column key. */
type SlotValue = '' | keyof ColumnOrder;

function slotsFromOrder(order: ColumnOrder | null): SlotValue[] {
  const slots: SlotValue[] = ['', '', '', '', '', ''];
  if (order === null) return slots;
  for (const { value } of COLUMN_LABELS) {
    const pos = order[value];
    if (pos !== null && pos >= 1 && pos <= 6) slots[pos - 1] = value;
  }
  return slots;
}

function orderFromSlots(slots: SlotValue[]): ColumnOrder | null {
  const order: ColumnOrder = {
    date: 0,
    valeur: null,
    label: 0,
    debit: null,
    credit: null,
    balance: null,
  };
  slots.forEach((v, i) => {
    if (v !== '') {
      if (order[v] !== null && order[v] !== 0) return; // duplicate → leave; validated below
      order[v] = i + 1;
    }
  });
  const dup = slots.filter((v) => v !== '');
  if (new Set(dup).size !== dup.length) return null;
  if (order.date < 1 || order.label < 1) return null;
  if (order.debit === null && order.credit === null) return null;
  return order;
}

/**
 * ADR-019 1b: the manual mapping assistant. The deterministic header suggestion
 * pre-fills the slots; the user confirms or composes, no model involved. The
 * review screen's arithmetic check remains the real validation of the mapping.
 */
export function MappingAssistantView({
  suggested,
  headerTokens,
  mappingError,
  onLearn,
  onCancel,
}: {
  suggested: ColumnOrder | null;
  headerTokens: string[];
  mappingError: boolean;
  onLearn: (bankName: string, order: ColumnOrder) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<SlotValue[]>(() => slotsFromOrder(suggested));
  const [localError, setLocalError] = useState(false);

  const submit = (): void => {
    const order = orderFromSlots(slots);
    if (order === null) {
      setLocalError(true);
      return;
    }
    onLearn(name.trim(), order);
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="rounded-md border border-line-2 bg-ink-2/60 p-3 text-sm text-paper-soft">
        Banque non reconnue. Indique l'ordre des colonnes de ce relevé — une seule fois ; les
        imports suivants de cette banque seront automatiques.
        {headerTokens.length > 0 && (
          <p className="mt-2 font-mono text-[11px] text-paper-mute">
            En-tête détecté : {headerTokens.join(' · ')}
          </p>
        )}
      </div>
      <input
        autoFocus
        value={name}
        placeholder="Nom de la banque (ex. Société Générale)"
        onChange={(e) => {
          setName(e.target.value);
        }}
        className={FIELD}
      />
      <div className="grid grid-cols-3 gap-2">
        {slots.map((slot, i) => (
          <label
            key={`col-${String(i)}`}
            className="flex flex-col gap-1 text-[11px] text-paper-mute"
          >
            Colonne {i + 1}
            <select
              aria-label={`Colonne ${String(i + 1)}`}
              className={FIELD}
              value={slot}
              onChange={(e) => {
                setSlots((prev) =>
                  prev.map((s, j) => (j === i ? (e.target.value as SlotValue) : s)),
                );
                setLocalError(false);
              }}
            >
              <option value="">—</option>
              {COLUMN_LABELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {localError && (
        <p className="text-[12px] text-flag">
          Il faut au minimum une date, un libellé et au moins un montant (débit ou crédit), sans
          doublon.
        </p>
      )}
      {mappingError && (
        <p className="text-[12px] text-flag">
          Colonnes introuvables avec ce mapping — vérifie l'ordre et réessaie.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer ce fichier
        </Button>
        <Button disabled={name.trim() === ''} onClick={submit}>
          Enregistrer cette banque
        </Button>
      </DialogFooter>
    </div>
  );
}
```

2. The call site (`sub?.step === 'unknownBank'`) becomes:

```tsx
{
  sub?.step === 'unknownBank' && (
    <MappingAssistantView
      suggested={sub.suggested}
      headerTokens={sub.headerTokens}
      mappingError={sub.mappingError}
      onLearn={(name, order) => {
        void learnBank(name, order);
      }}
      onCancel={skipFile}
    />
  );
}
```

3. Removals in the same file:
   - The `<PdfModelRequiredDialog …>` element and its import; the main `<Dialog open={open && sub?.step !== 'modelRequired'}>` simplifies to `open={open}`.
   - The auto-resume effect (« Auto-resume: when the model becomes ready… ») and the lazy-hardware-detection effect (`pdfModelRequired`).
   - The `learning` step copy becomes: `<p className="text-sm text-paper">Enregistrement de la banque…</p>` (drop the « ~1 min, IA » subtext).
   - `useModelStatus` / `formatModelSize` imports IF nothing else in the file uses them (grep within the file first — `modelStatus` may serve other steps; remove only what is now unused; eslint will confirm).
   - Add `import type { ColumnOrder } from '@shared/types/bank';` and keep `Sparkles` only if still used elsewhere in the file.

4. Delete `src/renderer/components/model/PdfModelRequiredDialog.tsx` and `tests/unit/renderer/PdfModelRequiredDialog.test.tsx` (`git rm`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/renderer/ && npx tsc --noEmit && npx eslint src tests`
Expected: all PASS (ImportModal review/summary suites unaffected; any test stubbing `useImport` must add the new `learnBank` arity if it asserts on it), tsc + eslint clean across the whole repo — this is the first fully-green point since Task 3.

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer tests/unit/renderer
git commit -m "feat(import): manual mapping assistant replaces the LLM bank learning"
```

---

### Task 6: full gate, SocGen fixture check, PR

- [ ] **Step 1: Full verification (Definition of done)**

```bash
npx eslint src tests && npx tsc --noEmit && npx vitest run tests/unit && npm run build
```

Expected: all clean/green.

- [ ] **Step 2: Local fixture check (not CI — spike-fixtures is local-only)**

Verify the deterministic suggestion against the real Société Générale sample:

```bash
npx tsx -e "
import { readFileSync, readdirSync } from 'node:fs';
import { extractPdfText } from './src/main/import/pdf/extract';
import { suggestColumnOrder } from './src/main/import/pdf/suggestColumns';
const dir = 'spike-fixtures';
const pdfs = readdirSync(dir).filter((f) => /societe|sg|generale/i.test(f) && f.endsWith('.pdf'));
for (const f of pdfs) {
  const res = await extractPdfText(readFileSync(dir + '/' + f));
  console.log(f, JSON.stringify(suggestColumnOrder(res.pages)));
}
"
```

Expected: a non-null suggestion whose order matches the statement's visible header (open the PDF if unsure). If the fixture's header uses a vocabulary the alias table misses, extend `KEY_ALIASES` (and add a unit test for the new alias) rather than special-casing. Report the outcome in the PR description.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/mapping-assistant
gh pr create --title "feat(import): manual bank mapping assistant (ADR-019 phase 1b)" --body "$(cat <<'EOF'
## Summary
ADR-019 phase 1b — the last deterministic replacement before the LLM removal:
- Unknown-bank PDF imports no longer touch the model: a deterministic scan finds the statement's header line (date/valeur/libellé/débit/crédit/solde aliases) and pre-fills the column order; the user confirms or composes it in a new mapping assistant (six slots), once per bank.
- `banks:prepareMapping` (new IPC) feeds the assistant; `banks:learn` takes the user-confirmed order and derives/persists exactly as before (x-thresholds, arithmetic check downstream unchanged).
- Learn-flow LLM plumbing removed: `inferColumns.ts` (prompt+parsing), the `modelRequired` step, the forced-download `PdfModelRequiredDialog`, the auto-resume effect.
- Local check: deterministic suggestion validated against the real Société Générale fixture (see below).

Spec: `docs/superpowers/specs/2026-06-11-mapping-assistant-design.md`
Plan: `docs/superpowers/plans/2026-06-11-mapping-assistant.md`

Fixture check result: <PASTE the Step 2 output here>

## Test plan
- [ ] CI green (lint, typecheck, unit, build)
- [ ] Maintainer in-app validation: import the SocGen sample → assistant pre-filled from the header → save → review screen with arithmetic check → re-import recognized automatically

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Stop — maintainer validation gate**

UI-flow PR: per the maintainer's standing instruction, **do not self-merge**. Report the PR URL and wait for in-app validation.
