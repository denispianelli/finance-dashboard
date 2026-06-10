import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { listAttemptedKeys, recordAttempt } from '../../../src/main/categorize/attempts';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('llm attempts', () => {
  it('records an attempt and lists it for the same model', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    expect(listAttemptedKeys(db, 'llama-3.2-3b')).toEqual(new Set(['MYSTERY']));
  });

  it('scopes attempts by model id — a stronger model retries past failures', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    expect(listAttemptedKeys(db, 'qwen2.5-7b')).toEqual(new Set());
  });

  it('re-records the same key under a new model without a PK conflict', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    recordAttempt(db, 'MYSTERY', 'qwen2.5-7b');
    expect(listAttemptedKeys(db, 'qwen2.5-7b')).toEqual(new Set(['MYSTERY']));
    expect(listAttemptedKeys(db, 'llama-3.2-3b')).toEqual(new Set());
  });
});
