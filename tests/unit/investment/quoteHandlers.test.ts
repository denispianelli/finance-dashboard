// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

// Use vi.hoisted so the spy reference is available inside the vi.mock factory (which is hoisted).
const { refreshSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(() =>
    Promise.resolve({ refreshed: 1, skipped: 0, failed: 0, lastRefreshAt: 'x' }),
  ),
}));

// Spy on the orchestrator to assert it is NOT called when the feed is disabled.
vi.mock('../../../src/main/investment/refreshQuotes', () => ({ refreshAllQuotes: refreshSpy }));

vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

import {
  handleInvestmentGetQuoteSettings,
  handleInvestmentSetQuotesEnabled,
  handleInvestmentRefreshQuotes,
} from '../../../src/main/ipc/handlers/investment';

beforeEach(() => {
  runMigrations(db);
  db.exec("DELETE FROM app_settings WHERE key LIKE 'quotes.%'");
  refreshSpy.mockClear();
});

describe('quote IPC handlers', () => {
  it('defaults to disabled and does NOT call the network when refreshing while off', async () => {
    expect(handleInvestmentGetQuoteSettings()).toEqual({ enabled: false, lastRefreshAt: null });
    const r = await handleInvestmentRefreshQuotes();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(r.result).toEqual({ refreshed: 0, skipped: 0, failed: 0, lastRefreshAt: null });
  });

  it('calls the orchestrator when enabled', async () => {
    handleInvestmentSetQuotesEnabled({ enabled: true });
    expect(handleInvestmentGetQuoteSettings().enabled).toBe(true);
    await handleInvestmentRefreshQuotes();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
