# Import Review UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the modal-based import UI (pick → review → result) wiring the existing `import:pickFile / extract / confirm` IPC channels.

**Architecture:** `useImport` hook owns all IPC calls and a discriminated state machine; `ImportModal` renders the correct view per state; `DashboardPage` hosts the trigger button and modal mount. `selectedHashes` is added to the confirm IPC payload so per-transaction deselection is wired end-to-end.

**Tech Stack:** React 19, TypeScript strict (`no-explicit-any: error`), shadcn/ui (Radix UI), Tailwind CSS, sonner (toast), Vitest 4 + Testing Library (unit), Playwright (E2E)

---

### Task 1: Install dependencies, configure renderer test environment, add shadcn primitives

**Files:**

- Modify: `package.json` (npm install)
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Create: `tests/setup/renderer.ts`
- Create: `src/renderer/components/ui/dialog.tsx`
- Create: `src/renderer/components/ui/checkbox.tsx`

- [ ] **Step 1: Install runtime and test dependencies**

```bash
cd /home/denis/finance-dashboard
npm install sonner @radix-ui/react-dialog @radix-ui/react-checkbox
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected: no errors; packages appear in `package.json`.

- [ ] **Step 2: Update `tsconfig.json` to include renderer test files and jest-dom types**

In `tsconfig.json`, change `"include"` to add `tests/**/*.tsx` and `tests/setup/*.ts`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "ignoreDeprecations": "6.0",
    "types": ["@testing-library/jest-dom"],
    "baseUrl": "./",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "tests/**/*.tsx",
    "tests/setup/*.ts",
    "playwright.config.ts"
  ],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 3: Update `vitest.config.ts` to add React plugin, jsdom env for renderer tests, and setup file**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    environmentMatchGlobs: [['tests/unit/renderer/**', 'jsdom']],
    setupFiles: ['tests/setup/renderer.ts'],
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
```

- [ ] **Step 4: Create `tests/setup/renderer.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Create `src/renderer/components/ui/dialog.tsx`**

```tsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@renderer/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
```

- [ ] **Step 6: Create `src/renderer/components/ui/checkbox.tsx`**

```tsx
import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '@renderer/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
```

- [ ] **Step 7: Verify existing tests still pass**

```bash
npm test
```

Expected: all existing unit tests pass (0 failures). New renderer test dir doesn't exist yet — that's fine.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts \
  tests/setup/renderer.ts \
  src/renderer/components/ui/dialog.tsx \
  src/renderer/components/ui/checkbox.tsx
git commit -m "feat: add renderer test env and shadcn dialog/checkbox primitives"
```

---

### Task 2: Extend IPC contract and `insertStatement` to support `selectedHashes`

The confirm IPC payload needs a `selectedHashes` field so the UI can pass only the transactions the user chose to import. The backend filters the insert loop accordingly; `selectedHashes` is optional for backward compatibility.

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/import/insertStatement.ts`
- Modify: `src/main/ipc/handlers/importConfirm.ts`
- Create: `tests/unit/import/insertStatement.selectedHashes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import/insertStatement.selectedHashes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { StatementExtraction } from '@shared/types/import';

const extractMock = vi.fn();
vi.mock('../../../src/main/import/extractStatement', () => ({
  extractStatement: (...args: unknown[]) => extractMock(...args) as unknown,
}));

const { insertStatement } = await import('../../../src/main/import/insertStatement');

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function makeTx(hash: string, isDuplicate = false) {
  return {
    date: '2026-01-01',
    label: 'Test',
    amount: -10,
    tx_hash: hash,
    fitid: null,
    isDuplicate,
  };
}

function baseExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [makeTx('h1'), makeTx('h2'), makeTx('h3')],
    arithmetic: {
      status: 'passed',
      openingBalance: 100,
      closingBalance: 70,
      computedClosing: 70,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 3,
    duplicateCount: 0,
    fileHash: 'aabbcc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

beforeEach(() => {
  extractMock.mockReset();
});

describe('insertStatement — selectedHashes', () => {
  it('inserts only selected hashes when selectedHashes is provided', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(baseExtraction());

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {
      selectedHashes: ['h1', 'h3'],
    });

    expect(result.insertedCount).toBe(2);
    const rows = db.prepare('SELECT tx_hash FROM transactions ORDER BY tx_hash').all() as {
      tx_hash: string;
    }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1', 'h3']);
  });

  it('inserts all non-duplicates when selectedHashes is omitted', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(baseExtraction());

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {});

    expect(result.insertedCount).toBe(3);
    const rows = db.prepare('SELECT tx_hash FROM transactions ORDER BY tx_hash').all() as {
      tx_hash: string;
    }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1', 'h2', 'h3']);
  });

  it('skips duplicates even when their hash is in selectedHashes', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(
      baseExtraction({ transactions: [makeTx('h1'), makeTx('h2', true)] }),
    );

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {
      selectedHashes: ['h1', 'h2'],
    });

    expect(result.insertedCount).toBe(1);
    const rows = db.prepare('SELECT tx_hash FROM transactions').all() as { tx_hash: string }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- insertStatement.selectedHashes
```

Expected: FAIL — `selectedHashes` is not supported yet.

- [ ] **Step 3: Add `selectedHashes` to `ConfirmPayload` in `src/shared/types/ipc.ts`**

Change:

```ts
export interface ConfirmPayload {
  path: string;
  accountId: string;
  acknowledgedCannotVerify?: boolean;
}
```

To:

```ts
export interface ConfirmPayload {
  path: string;
  accountId: string;
  selectedHashes?: string[];
  acknowledgedCannotVerify?: boolean;
}
```

- [ ] **Step 4: Update `insertStatement` in `src/main/import/insertStatement.ts` to filter by `selectedHashes`**

Change the function signature and insert loop:

```ts
export async function insertStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
  opts: { acknowledgedCannotVerify?: boolean; selectedHashes?: string[] } = {},
): Promise<InsertResult> {
  const extraction = await extractStatement(db, accountId, content);

  if (extraction.alreadyImported) throw new ImportError('already_imported');
  if (extraction.arithmetic.status === 'failed') throw new ImportError('arithmetic_failed');
  if (extraction.arithmetic.status === 'cannot_verify' && opts.acknowledgedCannotVerify !== true) {
    throw new ImportError('cannot_verify_unacknowledged');
  }

  const importId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO imports
         (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
       VALUES (?, ?, ?, ?, ?, ?, 'validated')`,
    ).run(
      importId,
      accountId,
      extraction.fileHash,
      extraction.sourceType,
      extraction.dateRangeStart,
      extraction.dateRangeEnd,
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id, confidence,
          is_internal_transfer, user_modified, fitid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?)`,
    );
    let insertedCount = 0;
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      if (opts.selectedHashes !== undefined && !opts.selectedHashes.includes(tx.tx_hash)) continue;
      insertTx.run(
        randomUUID(),
        accountId,
        importId,
        tx.tx_hash,
        tx.date,
        tx.amount,
        tx.label,
        normalizeLabel(tx.label),
        tx.fitid,
      );
      insertedCount++;
    }
    db.exec('COMMIT');
    return { importId, insertedCount, skippedCount: extraction.duplicateCount };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
```

- [ ] **Step 5: Pass `selectedHashes` in `src/main/ipc/handlers/importConfirm.ts`**

```ts
import { readFileSync } from 'node:fs';
import type { ConfirmPayload, ConfirmResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { insertStatement } from '../../import/insertStatement';
import { ImportError } from '../../import/importError';

export async function handleImportConfirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  try {
    const content = readFileSync(payload.path);
    const result = await insertStatement(getDb(), payload.accountId, content, {
      acknowledgedCannotVerify: payload.acknowledgedCannotVerify,
      selectedHashes: payload.selectedHashes,
    });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof ImportError) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
```

- [ ] **Step 6: Run all tests to verify passing**

```bash
npm test
```

Expected: all pass including the 3 new selectedHashes tests.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ipc.ts \
  src/main/import/insertStatement.ts \
  src/main/ipc/handlers/importConfirm.ts \
  tests/unit/import/insertStatement.selectedHashes.test.ts
git commit -m "feat: add selectedHashes to confirm IPC payload for per-transaction filtering"
```

---

### Task 3: `useImport` hook (TDD)

**Files:**

- Create: `tests/unit/renderer/useImport.test.ts`
- Create: `src/renderer/hooks/useImport.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/renderer/useImport.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));

import { ipc } from '@renderer/ipc/client';
import { useImport } from '@renderer/hooks/useImport';
import type { StatementExtraction } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function makeExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        date: '2026-01-01',
        label: 'Alpha',
        amount: -10,
        fitid: 'F1',
        isDuplicate: false,
      },
      {
        tx_hash: 'h2',
        date: '2026-01-02',
        label: 'Beta',
        amount: -5,
        fitid: 'F2',
        isDuplicate: true,
      },
    ],
    arithmetic: {
      status: 'cannot_verify',
      openingBalance: null,
      closingBalance: null,
      computedClosing: null,
      delta: null,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 1,
    fileHash: 'abc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

function pickOk(path = '/tmp/test.ofx', type: 'ofx' | 'pdf' = 'ofx') {
  return { cancelled: false as const, path, type, hash: 'abc', size: 100, alreadyImported: false };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('useImport', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useImport());
    expect(result.current.state.step).toBe('idle');
  });

  it('pick cancellation returns to idle', async () => {
    mockInvoke.mockResolvedValueOnce({ cancelled: true });
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    expect(result.current.state.step).toBe('idle');
  });

  it('happy path: transitions to review with only non-duplicate hashes pre-selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });

    expect(result.current.state.step).toBe('review');
    if (result.current.state.step === 'review') {
      expect(result.current.state.selected).toEqual(new Set(['h1']));
      expect(result.current.state.acknowledgedCannotVerify).toBe(false);
    }
  });

  it('extract error transitions to error with translated message', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.xyz'))
      .mockResolvedValueOnce({ ok: false, error: 'unsupported_format' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });

    expect(result.current.state.step).toBe('error');
    if (result.current.state.step === 'error') {
      expect(result.current.state.message).toBe(
        'Format non reconnu. Utilisez un fichier OFX ou PDF.',
      );
    }
  });

  it('toggleTx deselects a selected hash', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.toggleTx('h1');
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.has('h1')).toBe(false);
    }
  });

  it('toggleTx re-selects a deselected hash', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.toggleTx('h1');
    }); // deselect
    act(() => {
      result.current.toggleTx('h1');
    }); // re-select

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.has('h1')).toBe(true);
    }
  });

  it('toggleAll deselects all when all non-duplicates are selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.toggleAll();
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.size).toBe(0);
    }
  });

  it('toggleAll selects all non-duplicates when none are selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.toggleAll();
    }); // deselect all
    act(() => {
      result.current.toggleAll();
    }); // select all

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected).toEqual(new Set(['h1']));
    }
  });

  it('setAcknowledgedCannotVerify updates the flag', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.setAcknowledgedCannotVerify(true);
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.acknowledgedCannotVerify).toBe(true);
    }
  });

  it('confirm success transitions to done with insertedCount', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 1 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('done');
    if (result.current.state.step === 'done') {
      expect(result.current.state.insertedCount).toBe(1);
    }
  });

  it('OFX confirm auto-passes acknowledgedCannotVerify: true', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.ofx', 'ofx'))
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction({ sourceType: 'ofx' }) })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ acknowledgedCannotVerify: true });
    }
  });

  it('PDF confirm uses the user-set acknowledgedCannotVerify', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.pdf', 'pdf'))
      .mockResolvedValueOnce({
        ok: true,
        extraction: makeExtraction({
          sourceType: 'pdf',
          arithmetic: {
            status: 'cannot_verify',
            openingBalance: null,
            closingBalance: null,
            computedClosing: null,
            delta: null,
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.setAcknowledgedCannotVerify(true);
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ acknowledgedCannotVerify: true });
    }
  });

  it('confirm passes only selected hashes', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ selectedHashes: ['h1'] });
    }
  });

  it('confirm error transitions to error state', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: false, error: 'already_imported' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('error');
    if (result.current.state.step === 'error') {
      expect(result.current.state.message).toBe('Ce fichier a déjà été importé.');
    }
  });

  it('reset returns to idle from any state', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract();
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.step).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- useImport
```

Expected: FAIL — `@renderer/hooks/useImport` does not exist yet.

- [ ] **Step 3: Implement `src/renderer/hooks/useImport.ts`**

```ts
import { useState } from 'react';
import type { StatementExtraction } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

export type ImportState =
  | { step: 'idle' }
  | { step: 'picking' }
  | { step: 'extracting' }
  | {
      step: 'review';
      extraction: StatementExtraction;
      filePath: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
    }
  | { step: 'confirming' }
  | { step: 'done'; insertedCount: number }
  | { step: 'error'; message: string };

export interface UseImport {
  state: ImportState;
  pickAndExtract: () => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  setAcknowledgedCannotVerify: (value: boolean) => void;
  confirm: () => Promise<void>;
  reset: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  unsupported_format: 'Format non reconnu. Utilisez un fichier OFX ou PDF.',
  malformed_ofx: 'Fichier OFX invalide ou corrompu.',
  not_pdf: 'Le fichier ne semble pas être un PDF valide.',
  no_text: 'Ce PDF ne contient pas de texte extractible (scan image ?).',
  unknown_bank: 'Banque non reconnue. Seuls les relevés LCL sont supportés.',
  arithmetic_failed: 'Le solde ne correspond pas aux transactions. Import bloqué.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  already_imported: 'Ce fichier a déjà été importé.',
};

export function useImport(): UseImport {
  const [state, setState] = useState<ImportState>({ step: 'idle' });

  async function pickAndExtract() {
    setState({ step: 'picking' });
    const pickRes = await ipc.invoke('import:pickFile', {});
    if (pickRes.cancelled) {
      setState({ step: 'idle' });
      return;
    }

    setState({ step: 'extracting' });
    const extractRes = await ipc.invoke('import:extract', {
      path: pickRes.path,
      accountId: 'acc-lcl-default',
    });

    if (!extractRes.ok) {
      setState({
        step: 'error',
        message: ERROR_MESSAGES[extractRes.error] ?? extractRes.error,
      });
      return;
    }

    const { extraction } = extractRes;
    const selected = new Set(
      extraction.transactions.filter((tx) => !tx.isDuplicate).map((tx) => tx.tx_hash),
    );
    setState({
      step: 'review',
      extraction,
      filePath: pickRes.path,
      selected,
      acknowledgedCannotVerify: false,
    });
  }

  function toggleTx(txHash: string) {
    setState((prev) => {
      if (prev.step !== 'review') return prev;
      const next = new Set(prev.selected);
      if (next.has(txHash)) {
        next.delete(txHash);
      } else {
        next.add(txHash);
      }
      return { ...prev, selected: next };
    });
  }

  function toggleAll() {
    setState((prev) => {
      if (prev.step !== 'review') return prev;
      const nonDuplicateHashes = prev.extraction.transactions
        .filter((tx) => !tx.isDuplicate)
        .map((tx) => tx.tx_hash);
      const allSelected = nonDuplicateHashes.every((h) => prev.selected.has(h));
      return { ...prev, selected: allSelected ? new Set<string>() : new Set(nonDuplicateHashes) };
    });
  }

  function setAcknowledgedCannotVerify(value: boolean) {
    setState((prev) => {
      if (prev.step !== 'review') return prev;
      return { ...prev, acknowledgedCannotVerify: value };
    });
  }

  async function confirm() {
    if (state.step !== 'review') return;
    const { extraction, filePath, selected, acknowledgedCannotVerify } = state;

    setState({ step: 'confirming' });

    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await ipc.invoke('import:confirm', {
      path: filePath,
      accountId: 'acc-lcl-default',
      selectedHashes: [...selected],
      acknowledgedCannotVerify: ack,
    });

    if (res.ok) {
      setState({ step: 'done', insertedCount: res.insertedCount });
    } else {
      setState({ step: 'error', message: ERROR_MESSAGES[res.error] ?? res.error });
    }
  }

  function reset() {
    setState({ step: 'idle' });
  }

  return {
    state,
    pickAndExtract,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- useImport
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useImport.ts tests/unit/renderer/useImport.test.ts
git commit -m "feat: add useImport hook with full IPC state machine"
```

---

### Task 4: `TransactionReviewTable` component (TDD)

**Files:**

- Create: `tests/unit/renderer/TransactionReviewTable.test.tsx`
- Create: `src/renderer/components/TransactionReviewTable.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/renderer/TransactionReviewTable.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TransactionReviewTable } from '@renderer/components/TransactionReviewTable';
import type { ReviewTransaction } from '@shared/types/import';

function makeTx(hash: string, isDuplicate = false): ReviewTransaction {
  return {
    tx_hash: hash,
    date: '2026-01-15',
    label: `Libellé ${hash}`,
    amount: -42.5,
    fitid: null,
    isDuplicate,
  };
}

const newTx = makeTx('h1');
const dupTx = makeTx('h2', true);

describe('TransactionReviewTable', () => {
  it('renders all transactions', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx, dupTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Libellé h1')).toBeInTheDocument();
    expect(screen.getByText('Libellé h2')).toBeInTheDocument();
  });

  it('new transaction row is checked', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /h1/i });
    expect(checkbox).toBeChecked();
  });

  it('duplicate transaction row is unchecked and disabled', () => {
    render(
      <TransactionReviewTable
        transactions={[dupTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /h2/i });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  it('duplicate row has muted style', () => {
    render(
      <TransactionReviewTable
        transactions={[dupTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const row = screen.getByRole('row', { name: /h2/i });
    expect(row).toHaveClass('opacity-40');
  });

  it('clicking a non-duplicate row checkbox calls onToggleTx', async () => {
    const onToggleTx = vi.fn();
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={onToggleTx}
        onToggleAll={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /h1/i }));
    expect(onToggleTx).toHaveBeenCalledWith('h1');
  });

  it('select-all header checkbox calls onToggleAll', async () => {
    const onToggleAll = vi.fn();
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={onToggleAll}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /tout sélectionner/i }));
    expect(onToggleAll).toHaveBeenCalled();
  });

  it('select-all is checked when all non-duplicate rows are selected', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx, dupTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).toBeChecked();
  });

  it('select-all is unchecked when no non-duplicate rows are selected', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).not.toBeChecked();
  });

  it('displays formatted amount', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/-42[,.]50/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- TransactionReviewTable
```

Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement `src/renderer/components/TransactionReviewTable.tsx`**

```tsx
import type { ReviewTransaction } from '@shared/types/import';
import { Checkbox } from './ui/checkbox';

interface TransactionReviewTableProps {
  transactions: ReviewTransaction[];
  selected: Set<string>;
  onToggleTx: (txHash: string) => void;
  onToggleAll: () => void;
}

export function TransactionReviewTable({
  transactions,
  selected,
  onToggleTx,
  onToggleAll,
}: TransactionReviewTableProps) {
  const nonDuplicates = transactions.filter((tx) => !tx.isDuplicate);
  const allSelected =
    nonDuplicates.length > 0 && nonDuplicates.every((tx) => selected.has(tx.tx_hash));

  return (
    <div className="max-h-96 overflow-y-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80">
          <tr>
            <th className="w-10 px-3 py-2 text-left">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Tout sélectionner"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Libellé</th>
            <th className="px-3 py-2 text-right font-medium">Montant</th>
            <th className="px-3 py-2 text-center font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={tx.tx_hash}
              aria-label={tx.tx_hash}
              className={tx.isDuplicate ? 'opacity-40 italic' : ''}
            >
              <td className="px-3 py-2">
                <Checkbox
                  checked={selected.has(tx.tx_hash)}
                  onCheckedChange={() => {
                    onToggleTx(tx.tx_hash);
                  }}
                  disabled={tx.isDuplicate}
                  aria-label={tx.tx_hash}
                />
              </td>
              <td className="px-3 py-2 tabular-nums">{tx.date}</td>
              <td className="px-3 py-2">{tx.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {tx.amount.toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-3 py-2 text-center">{tx.isDuplicate ? 'Doublon' : '🆕'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- TransactionReviewTable
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TransactionReviewTable.tsx \
  tests/unit/renderer/TransactionReviewTable.test.tsx
git commit -m "feat: add TransactionReviewTable with per-row checkboxes"
```

---

### Task 5: `ImportModal` component (TDD)

**Files:**

- Create: `tests/unit/renderer/ImportModal.test.tsx`
- Create: `src/renderer/components/ImportModal.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/renderer/ImportModal.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@renderer/hooks/useImport');
vi.mock('sonner', () => ({ toast: vi.fn() }));

import { useImport } from '@renderer/hooks/useImport';
import { toast } from 'sonner';
import { ImportModal } from '@renderer/components/ImportModal';
import type { UseImport, ImportState } from '@renderer/hooks/useImport';
import type { StatementExtraction } from '@shared/types/import';

const mockUseImport = vi.mocked(useImport);
const mockToast = vi.mocked(toast);

function makeHook(state: ImportState, overrides: Partial<UseImport> = {}): UseImport {
  return {
    state,
    pickAndExtract: vi.fn(),
    toggleTx: vi.fn(),
    toggleAll: vi.fn(),
    setAcknowledgedCannotVerify: vi.fn(),
    confirm: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function makeReviewExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        date: '2026-01-01',
        label: 'Alpha',
        amount: -10,
        fitid: null,
        isDuplicate: false,
      },
    ],
    arithmetic: {
      status: 'passed',
      openingBalance: 100,
      closingBalance: 90,
      computedClosing: 90,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 0,
    fileHash: 'abc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

beforeEach(() => {
  mockUseImport.mockReset();
  mockToast.mockReset();
});

describe('ImportModal — pick state', () => {
  it('renders Parcourir button when idle', () => {
    mockUseImport.mockReturnValue(makeHook({ step: 'idle' }));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /parcourir/i })).toBeInTheDocument();
    expect(screen.getByText(/OFX recommandé/i)).toBeInTheDocument();
  });

  it('shows loading state while picking', () => {
    mockUseImport.mockReturnValue(makeHook({ step: 'picking' }));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /chargement/i })).toBeDisabled();
  });

  it('calls pickAndExtract when Parcourir is clicked', async () => {
    const hook = makeHook({ step: 'idle' });
    mockUseImport.mockReturnValue(hook);
    render(<ImportModal open={true} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /parcourir/i }));
    expect(hook.pickAndExtract).toHaveBeenCalled();
  });
});

describe('ImportModal — review state', () => {
  it('shows passed arithmetic badge in green', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        arithmetic: {
          status: 'passed',
          openingBalance: 100,
          closingBalance: 90,
          computedClosing: 90,
          delta: 0,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/solde vérifié/i)).toBeInTheDocument();
  });

  it('shows PDF cannot_verify badge with acknowledgement checkbox', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/non vérifiable/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /confirme l'import/i })).toBeInTheDocument();
  });

  it('does not show cannot_verify badge for OFX (auto-handled)', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'ofx',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.queryByText(/non vérifiable/i)).not.toBeInTheDocument();
  });

  it('shows failed arithmetic badge and disables confirm', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        arithmetic: {
          status: 'failed',
          openingBalance: 100,
          closingBalance: 90,
          computedClosing: 85,
          delta: -5,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/écart/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('disables confirm when 0 transactions selected', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction(),
      filePath: '/tmp/test.ofx',
      selected: new Set(),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('disables confirm for PDF cannot_verify when not acknowledged', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('enables confirm for PDF cannot_verify after acknowledgement', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: true,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).not.toBeDisabled();
  });

  it('shows period overlap banner when hasOverlap is true', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        periodOverlap: {
          hasOverlap: true,
          overlappingImports: [
            {
              id: 'imp-1',
              date_range_start: '2026-01-01',
              date_range_end: '2026-01-31',
              status: 'validated',
            },
          ],
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/chevauche/i)).toBeInTheDocument();
  });

  it('calls confirm when Importer is clicked', async () => {
    const hook = makeHook({
      step: 'review',
      extraction: makeReviewExtraction(),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    });
    mockUseImport.mockReturnValue(hook);
    render(<ImportModal open={true} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /importer/i }));
    expect(hook.confirm).toHaveBeenCalled();
  });
});

describe('ImportModal — done state', () => {
  it('calls toast and onClose when done', () => {
    const onClose = vi.fn();
    const reset = vi.fn();
    mockUseImport.mockReturnValue(makeHook({ step: 'done', insertedCount: 3 }, { reset }));
    render(<ImportModal open={true} onClose={onClose} />);
    expect(mockToast).toHaveBeenCalledWith('3 transactions importées', expect.any(Object));
    expect(onClose).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});

describe('ImportModal — error state', () => {
  it('renders the error message with a Fermer button', () => {
    mockUseImport.mockReturnValue(
      makeHook({ step: 'error', message: 'Fichier OFX invalide ou corrompu.' }),
    );
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Fichier OFX invalide ou corrompu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fermer/i })).toBeInTheDocument();
  });

  it('Fermer button calls reset and onClose', async () => {
    const onClose = vi.fn();
    const reset = vi.fn();
    mockUseImport.mockReturnValue(makeHook({ step: 'error', message: 'Erreur.' }, { reset }));
    render(<ImportModal open={true} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- ImportModal
```

Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement `src/renderer/components/ImportModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useImport } from '../hooks/useImport';
import { TransactionReviewTable } from './TransactionReviewTable';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const {
    state,
    pickAndExtract,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  } = useImport();
  const [overlapDismissed, setOverlapDismissed] = useState(false);

  useEffect(() => {
    if (state.step === 'done') {
      const n = state.insertedCount;
      toast(`${n} transaction${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`, { duration: 3000 });
      reset();
      onClose();
    }
    // onClose identity is stable across renders from DashboardPage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  function handleClose() {
    reset();
    setOverlapDismissed(false);
    onClose();
  }

  function canConfirm(): boolean {
    if (state.step !== 'review') return false;
    if (state.selected.size === 0) return false;
    if (state.extraction.arithmetic.status === 'failed') return false;
    if (
      state.extraction.sourceType === 'pdf' &&
      state.extraction.arithmetic.status === 'cannot_verify' &&
      !state.acknowledgedCannotVerify
    ) {
      return false;
    }
    return true;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer un relevé</DialogTitle>
        </DialogHeader>

        {state.step === 'error' && <ErrorView message={state.message} onClose={handleClose} />}

        {(state.step === 'review' || state.step === 'confirming') && (
          <ReviewView
            state={state}
            overlapDismissed={overlapDismissed}
            onDismissOverlap={() => {
              setOverlapDismissed(true);
            }}
            onToggleTx={toggleTx}
            onToggleAll={toggleAll}
            onAcknowledge={setAcknowledgedCannotVerify}
            onCancel={handleClose}
            onConfirm={() => {
              void confirm();
            }}
            confirmDisabled={!canConfirm() || state.step === 'confirming'}
          />
        )}

        {(state.step === 'idle' || state.step === 'picking' || state.step === 'extracting') && (
          <PickView
            onPick={() => {
              void pickAndExtract();
            }}
            loading={state.step === 'picking' || state.step === 'extracting'}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickView({ onPick, loading }: { onPick: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-muted-foreground">OFX recommandé · PDF pour les archives</p>
      <Button onClick={onPick} disabled={loading}>
        {loading ? 'Chargement…' : 'Parcourir…'}
      </Button>
    </div>
  );
}

function ErrorView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-destructive">{message}</p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      </DialogFooter>
    </div>
  );
}

interface ReviewViewProps {
  state: Extract<import('../hooks/useImport').ImportState, { step: 'review' | 'confirming' }>;
  overlapDismissed: boolean;
  onDismissOverlap: () => void;
  onToggleTx: (hash: string) => void;
  onToggleAll: () => void;
  onAcknowledge: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}

function ReviewView({
  state,
  overlapDismissed,
  onDismissOverlap,
  onToggleTx,
  onToggleAll,
  onAcknowledge,
  onCancel,
  onConfirm,
  confirmDisabled,
}: ReviewViewProps) {
  const { extraction } = state;
  const selectedCount = state.step === 'review' ? state.selected.size : 0;
  const selected = state.step === 'review' ? state.selected : new Set<string>();
  const acknowledgedCannotVerify = state.step === 'review' ? state.acknowledgedCannotVerify : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">
        {extraction.dateRangeStart} → {extraction.dateRangeEnd} · {extraction.transactions.length}{' '}
        transaction{extraction.transactions.length > 1 ? 's' : ''}
      </div>

      <ArithmeticBadge
        extraction={extraction}
        acknowledgedCannotVerify={acknowledgedCannotVerify}
        onAcknowledge={onAcknowledge}
      />

      {extraction.periodOverlap.hasOverlap && !overlapDismissed && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <span>
              Ce relevé chevauche un import existant (
              {extraction.periodOverlap.overlappingImports[0]?.date_range_start} →{' '}
              {extraction.periodOverlap.overlappingImports[0]?.date_range_end}). Vérifiez les
              doublons ci-dessous.
            </span>
            <button
              className="shrink-0 text-amber-600 hover:text-amber-900"
              onClick={onDismissOverlap}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <TransactionReviewTable
        transactions={extraction.transactions}
        selected={selected}
        onToggleTx={onToggleTx}
        onToggleAll={onToggleAll}
      />

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={onConfirm} disabled={confirmDisabled}>
          Importer {selectedCount} transaction{selectedCount > 1 ? 's' : ''} →
        </Button>
      </DialogFooter>
    </div>
  );
}

function ArithmeticBadge({
  extraction,
  acknowledgedCannotVerify,
  onAcknowledge,
}: {
  extraction: import('@shared/types/import').StatementExtraction;
  acknowledgedCannotVerify: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const { arithmetic, sourceType } = extraction;

  if (arithmetic.status === 'passed') {
    return (
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
        ✅ Solde vérifié —{' '}
        {arithmetic.closingBalance?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
      </div>
    );
  }

  if (arithmetic.status === 'failed') {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        ❌ Écart de {arithmetic.delta?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
      </div>
    );
  }

  // cannot_verify: only show UI prompt for PDF — OFX is silently auto-acknowledged
  if (arithmetic.status === 'cannot_verify' && sourceType === 'pdf') {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <span>⚠️ Solde non vérifiable</span>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={acknowledgedCannotVerify}
            onCheckedChange={(v) => {
              onAcknowledge(v === true);
            }}
            aria-label="Je confirme l'import sans vérification du solde"
          />
          <span>Je confirme l'import sans vérification du solde</span>
        </label>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- ImportModal
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ImportModal.tsx \
  tests/unit/renderer/ImportModal.test.tsx
git commit -m "feat: add ImportModal with pick, review, and error views"
```

---

### Task 6: Wire `DashboardPage` trigger button and `Sonner` Toaster (TDD)

**Files:**

- Create: `tests/unit/renderer/DashboardPage.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/DashboardPage.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/renderer/DashboardPage.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@renderer/components/ImportModal', () => ({
  ImportModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="ImportModal" /> : null,
}));

import { DashboardPage } from '@renderer/pages/DashboardPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('renders the Importer button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /importer un relevé/i })).toBeInTheDocument();
  });

  it('modal is initially closed', () => {
    renderPage();
    expect(screen.queryByRole('dialog', { name: 'ImportModal' })).not.toBeInTheDocument();
  });

  it('opens modal when Importer button is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /importer un relevé/i }));
    expect(screen.getByRole('dialog', { name: 'ImportModal' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- DashboardPage
```

Expected: FAIL — button does not exist yet.

- [ ] **Step 3: Add `Toaster` to `src/renderer/App.tsx`**

```tsx
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <HashRouter>
      <Toaster richColors />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
```

- [ ] **Step 4: Update `src/renderer/pages/DashboardPage.tsx` with trigger button and modal**

```tsx
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ImportModal } from '../components/ImportModal';

export function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button
          onClick={() => {
            setModalOpen(true);
          }}
        >
          Importer un relevé
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Le tableau de bord arrivera en Phase 2. Pour l'instant, c'est juste le shell.
        </CardContent>
      </Card>
      <ImportModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass including the 3 new DashboardPage tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx \
  src/renderer/pages/DashboardPage.tsx \
  tests/unit/renderer/DashboardPage.test.tsx
git commit -m "feat: wire ImportModal trigger button and Sonner Toaster in DashboardPage"
```

---

### Task 7: E2E smoke test

The spec requires a smoke test that opens the modal and verifies the pick state renders without a real file.

**Files:**

- Modify: `tests/e2e/app-launch.test.ts`

- [ ] **Step 1: Extend the E2E test**

Full file after change:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

async function launchApp() {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js')] });
  const window = await app.firstWindow();
  return { app, window };
}

test('app launches and renders dashboard', async () => {
  const { app, window } = await launchApp();
  try {
    await expect(window.locator('h1')).toContainText('Dashboard');
  } finally {
    await app.close();
  }
});

test('import modal opens and shows pick state', async () => {
  const { app, window } = await launchApp();
  try {
    await window.getByRole('button', { name: /importer un relevé/i }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await expect(window.getByRole('button', { name: /parcourir/i })).toBeVisible();
    await expect(window.getByText(/OFX recommandé/i)).toBeVisible();
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Build the app and run E2E tests**

```bash
npm run build && npm run test:e2e
```

Expected: both E2E tests pass.

- [ ] **Step 3: Run all unit tests one final time**

```bash
npm test
```

Expected: all unit tests pass (0 failures).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app-launch.test.ts
git commit -m "test: add E2E smoke test for import modal pick state"
```

---

## Self-Review

### Spec coverage

| Spec requirement                                             | Task                                             |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `ImportModal` with 3 sequential states                       | Task 5                                           |
| `TransactionReviewTable` with per-row checkboxes             | Task 4                                           |
| `useImport` hook with all IPC calls and state machine        | Task 3                                           |
| Trigger button on `DashboardPage`                            | Task 6                                           |
| Toast notification on success                                | Task 5 (done state useEffect) + Task 6 (Toaster) |
| Inline error display                                         | Task 5 (error state)                             |
| OFX `cannot_verify` auto-acknowledgement                     | Task 3 (hook) + Task 5 (no badge for OFX)        |
| PDF `cannot_verify` explicit checkbox                        | Task 5 (ArithmeticBadge)                         |
| Arithmetic badge: passed / cannot_verify / failed            | Task 5 (ArithmeticBadge)                         |
| Period overlap amber banner (dismissible)                    | Task 5 (ReviewView)                              |
| Confirm disabled: 0 selected / arithmetic failed / PDF unack | Task 5 (canConfirm)                              |
| Select-all checkbox                                          | Task 4                                           |
| Duplicate rows unchecked + non-interactive                   | Task 4                                           |
| `selectedHashes` passed to backend                           | Tasks 2 + 3                                      |
| E2E smoke test                                               | Task 7                                           |

### Placeholder scan

None found — all steps have complete code.

### Type consistency

- `ImportState.step === 'review'` shape used consistently in hook, tests, and modal
- `UseImport` interface defined in hook, referenced via import in modal tests
- `StatementExtraction.sourceType` (`'ofx' | 'pdf' | 'csv'`) used correctly in all arithmetic badge logic
- `ConfirmPayload.selectedHashes?: string[]` used consistently in ipc.ts, insertStatement, handler, and hook
