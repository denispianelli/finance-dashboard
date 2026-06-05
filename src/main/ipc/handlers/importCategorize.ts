import type { CategorizePayload, CategorizeResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { getModel, isModelAvailable } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';

/**
 * LLM tier-3: classify a batch of residual transactions into existing categories.
 * Best-effort — the renderer loop tolerates both error codes (model_unavailable
 * stops the loop, inference_failed skips the batch). Never throws to the renderer.
 */
export async function handleImportCategorize(
  payload: CategorizePayload,
): Promise<CategorizeResponse> {
  const dir = modelsDir();
  if (!isModelAvailable(dir)) return { ok: false, error: 'model_unavailable' };

  const categories = getDb()
    .prepare('SELECT id, name FROM categories WHERE deprecated_at IS NULL ORDER BY position')
    .all() as unknown as LlmCategory[];

  try {
    const model = await getModel(dir);
    const results = await categorizeBatch(model, categories, payload.items);
    return { ok: true, results };
  } catch {
    return { ok: false, error: 'inference_failed' };
  }
}
