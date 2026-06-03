import type { LlamaModel } from 'node-llama-cpp';
import { runPrompt } from '../../llm/llm';

/** Column order (1 = leftmost) as identified by the LLM. null = column absent. */
export interface ColumnOrder {
  date: number;
  valeur: number | null;
  label: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

// Accent-stripped, lowercased aliases → canonical key. Covers the model's French
// drift (it may answer "libellé"/"solde" instead of "label"/"balance").
const KEY_ALIASES: Record<string, keyof ColumnOrder> = {
  date: 'date',
  valeur: 'valeur',
  value: 'valeur',
  label: 'label',
  libelle: 'label',
  nature: 'label',
  debit: 'debit',
  credit: 'credit',
  balance: 'balance',
  solde: 'balance',
};

function normalizeKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function buildColumnPrompt(statementText: string): string {
  return (
    `Voici le texte d'un relevé bancaire. Identifie les colonnes du tableau d'opérations ` +
    `en donnant pour chacune son numéro d'ordre d'apparition de gauche à droite (1 = première). ` +
    `Si une colonne est absente, mets null. Utilise EXACTEMENT ces clés : ` +
    `date, valeur, label, debit, credit, balance. ` +
    `Réponds UNIQUEMENT en JSON strict, sans explication. ` +
    `Exemple : {"date":1,"valeur":2,"label":3,"debit":4,"credit":5,"balance":6}` +
    `\n\n---\n${statementText.slice(0, 8000)}`
  );
}

/**
 * Parse the LLM response into a ColumnOrder. Tolerant: extracts the JSON object
 * from surrounding text, normalizes key aliases, accepts numeric strings.
 * Returns null if the essentials (a date, a label, and at least one amount
 * column) are missing — the caller then treats the bank as unmapped.
 */
export function parseColumnOrder(response: string): ColumnOrder | null {
  const json = extractJsonObject(response);
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const out: Partial<Record<keyof ColumnOrder, number | null>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const canon = KEY_ALIASES[normalizeKey(k)];
    if (canon === undefined) continue;
    if (v === null) out[canon] = null;
    else if (typeof v === 'number' && Number.isFinite(v)) out[canon] = v;
    else if (typeof v === 'string' && /^\d+$/.test(v.trim())) out[canon] = parseInt(v, 10);
  }

  if (typeof out.date !== 'number' || typeof out.label !== 'number') return null;
  if (typeof out.debit !== 'number' && typeof out.credit !== 'number') return null;

  return {
    date: out.date,
    valeur: out.valeur ?? null,
    label: out.label,
    debit: out.debit ?? null,
    credit: out.credit ?? null,
    balance: out.balance ?? null,
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/** Ask the model for the column order of a statement (one LLM call). */
export async function inferColumnOrder(
  model: LlamaModel,
  statementText: string,
): Promise<ColumnOrder | null> {
  return parseColumnOrder(await runPrompt(model, buildColumnPrompt(statementText)));
}
