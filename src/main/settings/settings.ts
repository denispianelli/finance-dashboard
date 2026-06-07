import { getDb } from '../db';

const OPT_OUT_KEY = 'categorize.optOut';

function read(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function write(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function getCategorizeOptOut(): boolean {
  return read(OPT_OUT_KEY) === '1';
}

export function setCategorizeOptOut(value: boolean): void {
  write(OPT_OUT_KEY, value ? '1' : '0');
}
