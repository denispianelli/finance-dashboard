// @vitest-environment node
//
// Integration tests for the investment flow end-to-end: they drive the real IPC
// handlers (the same entry points the UI calls) against a real in-memory DB, so
// repo + performance math + handler wiring + the wrapper aggregate are all exercised
// together — and the net-worth contribution is checked through getNetWorth.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

const {
  handleInvestmentCreateWrapper,
  handleInvestmentCreateSupport,
  handleInvestmentUpdateSupport,
  handleInvestmentListWrappers,
  handleInvestmentDeleteWrapper,
} = await import('../../../src/main/ipc/handlers/investment');

beforeEach(() => {
  db.exec(
    'DELETE FROM support_flows; DELETE FROM support_valuations; DELETE FROM investment_supports; DELETE FROM investment_wrappers; DELETE FROM accounts;',
  );
});

describe('investment flow (integration)', () => {
  it('create → first update (value+flow same day) → second update gives correct perf', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'PEA', type: 'pea' });
    const { support } = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'World ETF',
      isin: null,
      classId: null,
    });
    // First monthly update: "it's worth 5000, of which I contributed 5000" (same-day flow).
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2023-01-01',
      value: 5000,
      flow: 5000,
    });
    // A year later, +6%, no contribution.
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2024-01-01',
      value: 5300,
      flow: 0,
    });

    const { wrappers } = handleInvestmentListWrappers();
    const perf = wrappers[0]?.supports[0]?.perf;
    expect(perf).toBeDefined();
    expect(perf?.currentValue).toBeCloseTo(5300, 2);
    expect(perf?.netInvested).toBeCloseTo(5000, 2); // NOT 10000 — opening-day flow not double-counted
    expect(perf?.absoluteGain).toBeCloseTo(300, 2); // NOT -4700
    expect(perf?.hasFullYear).toBe(true);
    expect(perf?.triAnnual).toBeCloseTo(0.06, 2); // NOT -0.44
    expect(perf?.ttworrAnnual).toBeCloseTo(0.06, 2);

    // The support's value flows into net worth.
    expect(getNetWorth(db).total).toBeCloseTo(5300, 2);
  });

  it('a mid-period DCA contribution counts toward invested capital and the returns', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'PEA', type: 'pea' });
    const { support } = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'World ETF',
      isin: null,
      classId: null,
    });
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2023-01-01',
      value: 1000,
      flow: 1000,
    });
    // A genuine mid-year contribution (no valuation that day — only a flow).
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2023-07-01',
      value: 1500,
      flow: 500,
    });
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2024-01-01',
      value: 1600,
      flow: 0,
    });

    const { wrappers } = handleInvestmentListWrappers();
    const perf = wrappers[0]?.supports[0]?.perf;
    expect(perf?.netInvested).toBeCloseTo(1500, 2); // 1000 opening + 500 mid-year
    expect(perf?.absoluteGain).toBeCloseTo(100, 2);
    expect(perf?.triAnnual).not.toBeNull();
    expect(perf?.triAnnual ?? 0).toBeGreaterThan(0); // genuinely positive
  });

  it('wrapper aggregate sums its supports (current value, invested, gain)', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'AV', type: 'av' });
    const fonds = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'Fonds €',
      isin: null,
      classId: null,
    }).support;
    const uc = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'UC World',
      isin: null,
      classId: null,
    }).support;
    // Fonds €: 2000 → 2060 (+3%). UC: 3000 → 3300 (+10%). Both opened with a same-day flow.
    handleInvestmentUpdateSupport({
      supportId: fonds.id,
      asOf: '2023-01-01',
      value: 2000,
      flow: 2000,
    });
    handleInvestmentUpdateSupport({
      supportId: fonds.id,
      asOf: '2024-01-01',
      value: 2060,
      flow: 0,
    });
    handleInvestmentUpdateSupport({
      supportId: uc.id,
      asOf: '2023-01-01',
      value: 3000,
      flow: 3000,
    });
    handleInvestmentUpdateSupport({ supportId: uc.id, asOf: '2024-01-01', value: 3300, flow: 0 });

    const { wrappers } = handleInvestmentListWrappers();
    const agg = wrappers[0]?.perf;
    expect(agg?.currentValue).toBeCloseTo(5360, 2); // 2060 + 3300
    expect(agg?.netInvested).toBeCloseTo(5000, 2); // 2000 + 3000, opening-day flows not doubled
    expect(agg?.absoluteGain).toBeCloseTo(360, 2);
    expect(agg?.ttworrAnnual).toBeCloseTo(0.072, 2); // 5360 / 5000 − 1
    expect(getNetWorth(db).total).toBeCloseTo(5360, 2);
  });

  it('deleting a wrapper removes its supports + history and its net-worth contribution', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'CTO', type: 'cto' });
    const { support } = handleInvestmentCreateSupport({
      wrapperId: wrapper.id,
      name: 'S&P 500',
      isin: null,
      classId: null,
    });
    handleInvestmentUpdateSupport({
      supportId: support.id,
      asOf: '2024-01-01',
      value: 8200,
      flow: 8200,
    });
    expect(getNetWorth(db).total).toBeCloseTo(8200, 2);

    handleInvestmentDeleteWrapper({ id: wrapper.id });
    expect(handleInvestmentListWrappers().wrappers).toEqual([]);
    expect(getNetWorth(db).total).toBeCloseTo(0, 2);
  });
});
