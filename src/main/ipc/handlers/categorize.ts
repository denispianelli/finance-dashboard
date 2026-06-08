import type {
  CategorizePendingResponse,
  CategorizeBatchPayload,
  CategorizeBatchResponse,
} from '@shared/types/ipc';
import { getDb } from '../../db';
import { getModel, isModelAvailable } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';
import { listPendingGroups, applyCategoryToKey } from '../../categorize/pending';

/** Distinct pending labels (drives the background loop — one call per label). */
export function handleCategorizePending(): CategorizePendingResponse {
  return { groups: listPendingGroups(getDb()) };
}

/**
 * Classify ONE distinct label (no batch anchoring) and apply the result to every
 * transaction sharing its key. Best-effort: the renderer loop tolerates both error
 * codes (`model_unavailable` stops the pass, `inference_failed` skips this label).
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
    const results = await categorizeBatch(model, categories, [
      { id: payload.key, label: payload.label },
    ]);
    const categoryId = results[0]?.categoryId ?? null;
    const applied = categoryId === null ? 0 : applyCategoryToKey(db, payload.key, categoryId);
    return { ok: true, applied };
  } catch {
    return { ok: false, error: 'inference_failed' };
  }
}
