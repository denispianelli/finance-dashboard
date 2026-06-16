// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import {
  getQuotesEnabled,
  setQuotesEnabled,
  getLastQuoteRefreshAt,
  setLastQuoteRefreshAt,
} from '../../../src/main/investment/quoteState';

beforeEach(() => {
  runMigrations(db);
  db.exec("DELETE FROM app_settings WHERE key LIKE 'quotes.%'");
});

describe('quoteState', () => {
  it('defaults to disabled with no timestamp', () => {
    expect(getQuotesEnabled()).toBe(false);
    expect(getLastQuoteRefreshAt()).toBeNull();
  });

  it('round-trips the enabled flag and timestamp', () => {
    setQuotesEnabled(true);
    expect(getQuotesEnabled()).toBe(true);
    setLastQuoteRefreshAt('2026-06-15T10:00:00.000Z');
    expect(getLastQuoteRefreshAt()).toBe('2026-06-15T10:00:00.000Z');
    setQuotesEnabled(false);
    expect(getQuotesEnabled()).toBe(false);
  });
});
