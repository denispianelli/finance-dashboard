import type {
  CategorizePendingResponse,
  CategorizeBatchPayload,
  CategorizeBatchResponse,
} from '@shared/types/ipc';
import { getDb } from '../../db';
import { getModel, isModelAvailable } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';
import { listUncategorized, applyCategory } from '../../categorize/pending';

/** Transactions still awaiting a category (drives the background loop). */
export function handleCategorizePending(): CategorizePendingResponse {
  return { items: listUncategorized(getDb()) };
}

/**
 * LLM tier-3, run in the background after import: classify a batch of
 * uncategorized transactions into existing categories and persist the
 * suggestions (only for rows still uncategorized — a manual pick wins). Returns
 * how many rows were written. Best-effort: the renderer loop tolerates both error
 * codes (`model_unavailable` stops the loop, `inference_failed` skips the batch).
 */
export async function handleCategorizeBatch(
  payload: CategorizeBatchPayload,
): Promise<CategorizeBatchResponse> {
  const dir = modelsDir();
  if (!isModelAvailable(dir)) return { ok: false, error: 'model_unavailable' };

  const db = getDb();
  const categories = db
    .prepare('SELECT id, name FROM categories WHERE deprecated_at IS NULL ORDER BY position')
    .all() as unknown as LlmCategory[];

  try {
    const model = await getModel(dir);
    const results = await categorizeBatch(model, categories, payload.items);
    let applied = 0;
    for (const r of results) {
      if (r.categoryId !== null && applyCategory(db, r.id, r.categoryId)) applied++;
    }
    return { ok: true, applied };
  } catch {
    return { ok: false, error: 'inference_failed' };
  }
}
