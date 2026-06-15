// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

const {
  handleInvestmentListWrappers,
  handleInvestmentCreateWrapper,
  handleInvestmentCreateSupport,
  handleInvestmentUpdateSupport,
} = await import('../../../src/main/ipc/handlers/investment');

beforeEach(() => {
  db.exec(
    'DELETE FROM support_flows; DELETE FROM support_valuations; DELETE FROM investment_supports; DELETE FROM investment_wrappers;',
  );
});

describe('investment IPC', () => {
  it('empty: no wrappers', () => {
    expect(handleInvestmentListWrappers().wrappers).toEqual([]);
  });

  it('create wrapper + support + update → listWrappers shows currentValue and a perf object', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'PEA', type: 'pea' });
    const { support } = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'ETF',
      isin: null,
      classId: null,
    });
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2024-01-01',
      value: 1000,
      flow: 1000,
    });
    const { wrappers } = handleInvestmentListWrappers();
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]?.supports[0]?.currentValue).toBe(1000);
    expect(wrappers[0]?.supports[0]?.perf).toBeDefined();
  });
});
