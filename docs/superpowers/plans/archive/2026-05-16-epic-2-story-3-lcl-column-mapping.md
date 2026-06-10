# Epic 2 · Story 3 — LCL column mapping seeded manually : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed `banks` and `bank_column_mappings` for LCL via a new migration so the extraction pipeline can reference column positions without depending on the LLM mapping story.

**Architecture:** New SQL migration `002_seed_lcl.sql` with INSERT statements for the LCL bank row and its column mapping. Registered in `migrate.ts` as version 2. Column x-positions derived from real LCL PDF fixture analysis (see below). No new TypeScript files — pure data migration.

**Column positions derived from fixture `LCL_STATEMENT_FIXTURE.pdf`:**

- Header row: DATE x=42, LIBELLE x=197, VALEUR x=365, DEBIT x=433, CREDIT x=504
- Data rows: date at x≈42, label (main) at x=75, label (continuation) at x=81, debit amounts right-aligned in [433–490], credit amounts right-aligned in [504–570]
- Balance rows (`ANCIEN SOLDE`, `SOLDE EN EUROS`) identified by label text, amount in credit area (x≈523) — no dedicated balance column
- `date_col=42`, `label_col=75`, `debit_col=433`, `credit_col=504`, `balance_col=NULL`

**Tech Stack:** `node:sqlite` · Vitest · SQL

**Spec reference:** Design Spec §4 (step 6), §11 schema · Epic #23 Story 3

**GitHub:** Story #26 · Epic #23

---

## File Structure

- Create: `src/main/db/migrations/002_seed_lcl.sql` — INSERT for `banks` + `bank_column_mappings`
- Modify: `src/main/db/migrate.ts` — register migration version 2
- Create: `tests/unit/db/seed_lcl.test.ts` — verify seed data after running migrations

---

## Task 1: TDD — migration seed + tests

**Files:**

- Create: `tests/unit/db/seed_lcl.test.ts`
- Create: `src/main/db/migrations/002_seed_lcl.sql`
- Modify: `src/main/db/migrate.ts`

---

### Step 1: Write the failing tests

Create `tests/unit/db/seed_lcl.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('LCL seed (migration 002)', () => {
  it('inserts the LCL bank row', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM banks WHERE id = ?').get('lcl') as
      | { id: string; name: string; detected_signature: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe('lcl');
    expect(row?.name).toBe('Crédit Lyonnais');
    expect(row?.detected_signature).toBe('CREDIT LYONNAIS');
    db.close();
  });

  it('inserts the LCL column mapping', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM bank_column_mappings WHERE bank_id = ?').get('lcl') as
      | {
          bank_id: string;
          format_version: string;
          date_col: number;
          label_col: number;
          debit_col: number;
          credit_col: number;
          balance_col: number | null;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.format_version).toBe('v1');
    expect(row?.date_col).toBe(42);
    expect(row?.label_col).toBe(75);
    expect(row?.debit_col).toBe(433);
    expect(row?.credit_col).toBe(504);
    expect(row?.balance_col).toBeNull();
    db.close();
  });

  it('records version 2 in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(2);
    db.close();
  });
});
```

---

### Step 2: Run tests to confirm they fail

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/db/seed_lcl.test.ts 2>&1 | tail -20
```

Expected: FAIL — version 2 not found / rows not seeded.

---

### Step 3: Create the migration SQL

Create `src/main/db/migrations/002_seed_lcl.sql`:

```sql
INSERT INTO banks (id, name, detected_signature) VALUES
  ('lcl', 'Crédit Lyonnais', 'CREDIT LYONNAIS');

INSERT INTO bank_column_mappings
  (bank_id, format_version, date_col, label_col, debit_col, credit_col, balance_col)
VALUES
  ('lcl', 'v1', 42, 75, 433, 504, NULL);
```

---

### Step 4: Register migration in migrate.ts

Modify `src/main/db/migrate.ts` — add the import and register version 2:

```typescript
import { DatabaseSync } from 'node:sqlite';
import sql001 from './migrations/001_initial.sql?raw';
import sql002 from './migrations/002_seed_lcl.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const applied = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations').all() as {
        version: number;
      }[]
    ).map((r) => r.version),
  );
  const insertVersion = db.prepare('INSERT INTO schema_migrations(version) VALUES (?)');
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insertVersion.run(migration.version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
```

---

### Step 5: Run tests to confirm they pass

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/db/seed_lcl.test.ts 2>&1 | tail -20
```

Expected: PASS — 3 tests pass.

---

### Step 6: Run the full suite to confirm no regressions

```bash
cd /home/denis/finance-dashboard && npm test 2>&1 | tail -10
```

Expected: all existing tests + 3 new tests pass.

---

### Step 7: Commit

```bash
cd /home/denis/finance-dashboard && git add \
  src/main/db/migrations/002_seed_lcl.sql \
  src/main/db/migrate.ts \
  tests/unit/db/seed_lcl.test.ts \
  docs/superpowers/plans/2026-05-16-epic-2-story-3-lcl-column-mapping.md \
  && git commit -m "feat(db): seed LCL bank and column mapping via migration 002"
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
cd /home/denis/finance-dashboard && git push -u origin feat/26-lcl-column-mapping
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat(db): seed LCL bank and column mapping via migration 002 (#26)" \
  --body "$(cat <<'EOF'
Closes #26

## Summary
- Adds migration `002_seed_lcl.sql` that seeds `banks` and `bank_column_mappings` for LCL
- Column positions derived from real fixture analysis: `date_col=42`, `label_col=75`, `debit_col=433`, `credit_col=504`, `balance_col=NULL`
- Registers migration as version 2 in `migrate.ts`
- No balance column: LCL balance rows (`ANCIEN SOLDE`, `SOLDE EN EUROS`) are identified by label text, not a dedicated column

## Test Plan
- [ ] `npm test` — all tests pass (3 new seed tests + existing 19 tests)
- [ ] `npm run typecheck && npm run lint` — zero errors
EOF
)"
```

---

## Self-Review

- **Spec coverage:** `banks` row seeded ✓; `bank_column_mappings` row seeded ✓; column positions derived from real fixture ✓; migration runner updated ✓; read by extraction step (Story #27) via `bank_column_mappings` query ✓.
- **No placeholders:** full SQL and TypeScript shown.
- **Idempotency:** migration runner skips already-applied versions — re-running is safe ✓.
- **Commit includes plan file:** `git add ... docs/superpowers/plans/2026-05-16-epic-2-story-3-lcl-column-mapping.md` ✓.
