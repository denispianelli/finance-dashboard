import { getDb } from '../db';

const KEYS = {
  enabled: 'quotes.enabled',
  lastRefreshAt: 'quotes.lastRefreshAt',
} as const;

function read(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function write(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function getQuotesEnabled(): boolean {
  return read(KEYS.enabled) === '1';
}

export function setQuotesEnabled(enabled: boolean): void {
  write(KEYS.enabled, enabled ? '1' : '0');
}

export function getLastQuoteRefreshAt(): string | null {
  return read(KEYS.lastRefreshAt);
}

export function setLastQuoteRefreshAt(iso: string): void {
  write(KEYS.lastRefreshAt, iso);
}
