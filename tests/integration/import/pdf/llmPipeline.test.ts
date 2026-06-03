import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../../src/main/import/pdf/extract';
import { inferColumnOrder } from '../../../../src/main/import/pdf/inferColumns';
import { deriveColumnMapping } from '../../../../src/main/import/pdf/deriveMapping';
import { extractTransactions } from '../../../../src/main/import/pdf/extractTransactions';
import { getModel, isModelAvailable } from '../../../../src/main/llm/llm';

// Gated end-to-end validation of the LLM PDF pipeline on a real (anonymized)
// Société Générale specimen + the real model. Opt-in via RUN_LLM_E2E=1 so it
// never runs in the normal suite / pre-push (a real inference takes minutes and
// needs the 1.9 GB model). Run manually:
//   RUN_LLM_E2E=1 npx vitest run tests/integration/import/pdf/llmPipeline.test.ts
const MODELS_DIR = resolve('models');
const SG = resolve('spike-fixtures/SG_SPECIMEN.pdf');
const runnable =
  process.env.RUN_LLM_E2E === '1' && isModelAvailable(MODELS_DIR) && existsSync(SG);

describe('LLM PDF pipeline (real model + SG specimen, gated)', () => {
  it.skipIf(!runnable)(
    'infers SG columns and extracts transactions end-to-end',
    async () => {
      const { pages } = await extractPdfText(readFileSync(SG));
      const text = pages.flatMap((p) => p.items.map((i) => i.str)).join(' ');

      const model = await getModel(MODELS_DIR);
      const order = await inferColumnOrder(model, text);
      expect(order).not.toBeNull();
      if (order === null) return;

      const mapping = deriveColumnMapping(order, pages.flatMap((p) => p.items));
      expect(mapping).not.toBeNull();
      if (mapping === null) return;

      const result = extractTransactions(pages, mapping);
      console.log('order:', JSON.stringify(order));
      console.log('mapping:', JSON.stringify(mapping));
      console.log('transactions:', result.transactions.length);
      console.log(JSON.stringify(result.transactions.slice(0, 6), null, 2));

      expect(result.transactions.length).toBeGreaterThan(0);
      for (const t of result.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isFinite(t.amount)).toBe(true);
        expect(t.amount).not.toBe(0);
      }
    },
    300_000,
  );
});
