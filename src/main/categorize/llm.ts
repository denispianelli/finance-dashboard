import type { LlamaModel } from 'node-llama-cpp';
import type { CategorizeItem, CategorizeResult } from '@shared/types/import';
import { runPrompt } from '../llm/llm';

export type { CategorizeItem, CategorizeResult };

/** An existing category the LLM may assign a transaction to. */
export interface LlmCategory {
  id: string;
  name: string;
}

const MAX_LABEL = 120;

/**
 * Category-name normalizer: NFD strip + lowercase + trim. This is the
 * `normalizeKey` style from `inferColumns.ts` — NOT `normalizeLabel` (which
 * uppercases tx labels for `label_clean`). The two normalize different things.
 */
function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function buildCategorizationPrompt(
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): string {
  const categoryList = categories.map((c) => `- ${c.name}`).join('\n');
  const itemList = items
    .map((it, i) => `${String(i + 1)}. ${it.label.slice(0, MAX_LABEL)}`)
    .join('\n');

  return (
    `Tu es un assistant qui classe des opérations bancaires dans des catégories existantes.\n` +
    `Voici les catégories disponibles (utilise le nom EXACT) :\n${categoryList}\n\n` +
    `Voici les libellés d'opérations à classer :\n${itemList}\n\n` +
    `Pour chaque numéro, choisis une seule catégorie parmi la liste ci-dessus, ` +
    `en utilisant son nom exact, ou "AUCUNE" si aucune ne convient. ` +
    `Réponds UNIQUEMENT en JSON strict, sans explication, en associant chaque numéro à un nom. ` +
    `Exemple : {"1":"Alimentation","2":"AUCUNE"}`
  );
}

/**
 * Parse the model's JSON into one result per item. Pure. Tolerant: extracts the
 * JSON object from surrounding prose, parses in a try/catch (malformed → every
 * item null), maps each returned category NAME to its id via `normName`.
 * `"AUCUNE"` / unknown / missing key → null. Always returns exactly one result
 * per input item, in input order, and never an id absent from `categories`.
 */
export function parseCategorization(
  response: string,
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): CategorizeResult[] {
  const nameToId = new Map<string, string>();
  for (const c of categories) {
    nameToId.set(normName(c.name), c.id);
  }

  const parsed = parseResponseObject(response);

  return items.map((item, i) => {
    const value = parsed?.[String(i + 1)];
    let categoryId: string | null = null;
    if (typeof value === 'string') {
      const id = nameToId.get(normName(value));
      if (id !== undefined) categoryId = id;
    }
    return { tx_hash: item.tx_hash, categoryId };
  });
}

/** Tolerant JSON object extraction + parse; null on any failure. */
function parseResponseObject(response: string): Record<string, unknown> | null {
  const json = extractJsonObject(response);
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/** One LLM call for a batch. Returns a result per item (categoryId null = residual). */
export async function categorizeBatch(
  model: LlamaModel,
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): Promise<CategorizeResult[]> {
  return parseCategorization(
    await runPrompt(model, buildCategorizationPrompt(categories, items)),
    categories,
    items,
  );
}
