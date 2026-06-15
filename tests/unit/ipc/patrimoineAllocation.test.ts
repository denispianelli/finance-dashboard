// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));
// Mock electron so the real binary is never loaded (macOS CI flake prevention).
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

const {
  handlePatrimoineGetAllocation,
  handlePatrimoineUpsertClass,
  handlePatrimoineListClasses,
  handlePatrimoineDeleteClass,
  handlePatrimoineListHoldings,
} = await import('../../../src/main/ipc/handlers/patrimoine');

beforeEach(() => {
  db.exec('DELETE FROM asset_classes;');
});

describe('patrimoine allocation IPC handlers', () => {
  it('returns an empty allocation on an empty DB', () => {
    const res = handlePatrimoineGetAllocation();
    expect(res.allocation.slices).toEqual([]);
    expect(typeof res.allocation.total).toBe('number');
  });

  it('upsertClass then listClasses round-trips', () => {
    const created = handlePatrimoineUpsertClass({ name: 'Cash', color: '#888', targetPct: null });
    expect(created.class.name).toBe('Cash');
    expect(handlePatrimoineListClasses().classes.map((c) => c.name)).toContain('Cash');
  });

  it('deleteClass removes the class', () => {
    const created = handlePatrimoineUpsertClass({ name: 'Actions', color: '#0f0', targetPct: 0.6 });
    handlePatrimoineDeleteClass({ id: created.class.id });
    expect(handlePatrimoineListClasses().classes.map((c) => c.id)).not.toContain(created.class.id);
  });

  it('listHoldings returns an array', () => {
    const res = handlePatrimoineListHoldings();
    expect(Array.isArray(res.holdings)).toBe(true);
  });
});
