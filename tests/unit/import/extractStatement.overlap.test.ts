import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { NormalizedStatement } from '../../../src/shared/types/import';

// Holder for the statement the mocked PDF extractor returns, so each test can
// drive a different declared header period vs. transaction span.
const h = vi.hoisted(() => ({ stmt: null as NormalizedStatement | null }));

vi.mock('../../../src/main/import/detectType', () => ({ detectType: () => 'pdf' as const }));
vi.mock('../../../src/main/import/extractPdf', () => ({ extractPdf: () => h.stmt }));

import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';

// A prior April import, declared 02/04 → 30/04 (its header opens on March's
// closing date, as LCL statements do).
function seedAprilImport(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO imports (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
     VALUES ('imp-apr', 'acc-lcl-default', 'h-apr', 'pdf', '2026-04-02', '2026-04-30', 'validated')`,
  ).run();
}

describe('extractStatement — period overlap uses real transaction dates', () => {
  it('does not flag overlap when only the declared header period touches a prior import', async () => {
    // A May statement whose header opens on 30/04 (April's closing date) — the
    // boundary bleed. Every transaction is in May, so nothing actually overlaps
    // the April import; the banner must stay silent.
    h.stmt = {
      transactions: [
        { date: '2026-05-03', label: 'SALAIRE', amount: 1000, fitid: null },
        { date: '2026-05-28', label: 'LOYER', amount: -700, fitid: null },
      ],
      openingBalance: 0,
      closingBalance: 300,
      openingDate: '2026-04-30',
      closingDate: '2026-05-31',
      bankId: 'LCL',
    };
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    seedAprilImport(db);

    const r = await extractStatement(db, 'acc-lcl-default', Buffer.from('%PDF-1.4 fake'));

    expect(r.periodOverlap.hasOverlap).toBe(false);
    // The reported period is the transaction span, not the bleeding header.
    expect(r.dateRangeStart).toBe('2026-05-03');
    expect(r.dateRangeEnd).toBe('2026-05-28');
    db.close();
  });

  it('still flags overlap when a transaction genuinely falls in a covered period', async () => {
    h.stmt = {
      transactions: [{ date: '2026-04-15', label: 'X', amount: -10, fitid: null }],
      openingBalance: 0,
      closingBalance: -10,
      openingDate: '2026-04-02',
      closingDate: '2026-04-30',
      bankId: 'LCL',
    };
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    seedAprilImport(db);

    const r = await extractStatement(db, 'acc-lcl-default', Buffer.from('%PDF-1.4 fake'));

    expect(r.periodOverlap.hasOverlap).toBe(true);
    db.close();
  });
});
