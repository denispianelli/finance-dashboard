import type { DatabaseSync } from 'node:sqlite';

/** Label keys the given model already answered "AUCUNE" for (never re-asked). */
export function listAttemptedKeys(db: DatabaseSync, modelId: string): Set<string> {
  const rows = db
    .prepare('SELECT label_key FROM llm_attempts WHERE model_id = ?')
    .all(modelId) as unknown as { label_key: string }[];
  return new Set(rows.map((r) => r.label_key));
}

/** Record a no-answer attempt; an existing key is re-scoped to the new model. */
export function recordAttempt(db: DatabaseSync, labelKey: string, modelId: string): void {
  db.prepare(
    `INSERT INTO llm_attempts (label_key, model_id) VALUES (?, ?)
     ON CONFLICT(label_key) DO UPDATE
       SET model_id = excluded.model_id, attempted_at = datetime('now')`,
  ).run(labelKey, modelId);
}
