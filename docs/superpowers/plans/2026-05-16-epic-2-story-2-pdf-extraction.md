# Epic 2 · Story 2 — PDF text extraction (pdfjs, deterministic) : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a structured token stream (text + x/y coordinates) from a PDF buffer in the main process using pdfjs-dist. Detect scanned (no-text) PDFs and flag them for the OCR story.

**Architecture:** Pure async function `extractPdfText(buffer: Buffer): Promise<PdfExtractResult>` in `src/main/import/pdf/extract.ts`. Uses `pdfjs-dist/legacy/build/pdf.mjs` via dynamic `import()` (ESM in CJS context). No web worker — runs fully synchronous/in-process in the Electron main process. Scanned detection is a pure derived property (`hasText`). Unit-tested with a real LCL fixture (skipped in CI if fixture absent) and a minimal synthetic no-text PDF.

**Tech Stack:** `pdfjs-dist@^5.7.284` (already installed) · `node:fs` · Vitest

**Spec reference:** Design Spec §4 (steps 3, 7) · ADR-003

**GitHub:** Story #25 · Epic #23

---

## File Structure

- Create `src/main/import/pdf/extract.ts` — extraction function + types
- Create `tests/unit/import/pdf/extract.test.ts` — TDD unit tests

---

## Task 1: TDD — `extractPdfText` implementation

**Files:**

- Create: `tests/unit/import/pdf/extract.test.ts`
- Create: `src/main/import/pdf/extract.ts`

---

### Step 1: Write the failing tests

Create `tests/unit/import/pdf/extract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText, computeHasText } from '../../../../src/main/import/pdf/extract';
import type { PdfPage } from '../../../../src/main/import/pdf/extract';

const FIXTURE_PATH = resolve('spike-fixtures/COMPTEDEDEPOTS_08992009022_20251202.pdf');

describe('extractPdfText', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts text items with coordinates from a real LCL PDF',
    async () => {
      const buffer = readFileSync(FIXTURE_PATH);
      const result = await extractPdfText(buffer);

      expect(result.hasText).toBe(true);
      expect(result.pages.length).toBeGreaterThan(0);

      const firstPage = result.pages[0]!;
      expect(firstPage.pageNumber).toBe(1);
      expect(firstPage.items.length).toBeGreaterThan(0);

      const firstItem = firstPage.items[0]!;
      expect(typeof firstItem.str).toBe('string');
      expect(typeof firstItem.x).toBe('number');
      expect(typeof firstItem.y).toBe('number');
      expect(typeof firstItem.width).toBe('number');
    },
  );
});

describe('computeHasText', () => {
  it('returns false when all pages have no items', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, items: [] }];
    expect(computeHasText(pages)).toBe(false);
  });

  it('returns false when all items are whitespace-only', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, items: [{ str: '   ', x: 0, y: 0, width: 0 }] }];
    expect(computeHasText(pages)).toBe(false);
  });

  it('returns true when at least one item has non-empty text', () => {
    const pages: PdfPage[] = [
      { pageNumber: 1, items: [{ str: 'Solde', x: 10, y: 20, width: 30 }] },
    ];
    expect(computeHasText(pages)).toBe(true);
  });
});
```

---

### Step 2: Run tests to confirm they fail

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/pdf/extract.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

---

### Step 3: Create the implementation

Create `src/main/import/pdf/extract.ts`:

```typescript
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfPage {
  pageNumber: number;
  items: PdfTextItem[];
}

export interface PdfExtractResult {
  pages: PdfPage[];
  hasText: boolean;
}

export function computeHasText(pages: PdfPage[]): boolean {
  return pages.some((p) => p.items.some((item) => item.str.trim().length > 0));
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  // Dynamic import: pdfjs-dist is ESM-only; main process is compiled CJS
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: PdfPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const items: PdfTextItem[] = content.items
      .filter(
        (item): item is typeof item & { str: string; transform: number[]; width: number } =>
          'str' in item,
      )
      .map((item) => ({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        width: item.width,
      }));

    pages.push({ pageNumber: i, items });
  }

  return { pages, hasText: computeHasText(pages) };
}
```

---

### Step 4: Run tests to confirm they pass

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/pdf/extract.test.ts 2>&1 | tail -20
```

Expected: PASS.

- If the LCL fixture is present: 4 tests pass (1 fixture test + 3 `computeHasText` tests)
- If the fixture is absent: 3 tests pass (fixture test skipped, 3 `computeHasText` tests pass)

---

### Step 5: Run the full suite to confirm no regressions

```bash
cd /home/denis/finance-dashboard && npm test 2>&1 | tail -10
```

Expected: all existing 15 tests + new tests pass.

---

### Step 6: Commit

```bash
cd /home/denis/finance-dashboard && git add src/main/import/pdf/extract.ts tests/unit/import/pdf/extract.test.ts docs/superpowers/plans/2026-05-16-epic-2-story-2-pdf-extraction.md && git commit -m "feat(import): add PDF text extraction with pdfjs and coordinate tokens"
```

---

## Task 2: Typecheck + lint + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Typecheck and lint**

```bash
cd /home/denis/finance-dashboard && npm run typecheck && npm run lint 2>&1 | tail -10
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Push branch**

```bash
cd /home/denis/finance-dashboard && git push -u origin feat/25-pdf-extraction
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat(import): PDF text extraction with pdfjs and coordinate tokens (#25)" \
  --body "$(cat <<'EOF'
Closes #25

## Summary
- Adds \`extractPdfText(buffer: Buffer): Promise<PdfExtractResult>\` in \`src/main/import/pdf/extract.ts\`
- Returns structured token stream: \`{ pages: [{ pageNumber, items: [{ str, x, y, width }] }], hasText }\`
- Detects scanned (no-text) PDFs via \`hasText: false\` — downstream stories use this flag to route to OCR (Story #10)
- Uses \`pdfjs-dist/legacy/build/pdf.mjs\` via dynamic \`import()\` (ESM in CJS main process)
- No web worker — runs fully in-process in Electron main

## Test Plan
- [ ] \`npm test\` — all tests pass (fixture test skipped in CI if PDF absent; 2 synthetic tests always run)
- [ ] \`npm run typecheck && npm run lint\` — zero errors
- [ ] Manual: call \`extractPdfText\` on an LCL PDF fixture, verify items have str/x/y/width and \`hasText: true\`
EOF
)"
```

---

## Self-Review

- **Spec coverage:** pdfjs extraction in main process ✓; text items with x/y per page ✓; selectable-text → token stream ✓; no-text → hasText: false ✓; unit test on real LCL fixture (skip-if-absent) ✓.
- **ADR-003:** deterministic extraction, no LLM involved ✓.
- **Types exported:** `PdfTextItem`, `PdfPage`, `PdfExtractResult` — usable by the bank-detection story.
- **No placeholders:** full implementation and test code included.
- **Commit includes plan file:** `git add ... docs/superpowers/plans/2026-05-16-epic-2-story-2-pdf-extraction.md` ✓.
