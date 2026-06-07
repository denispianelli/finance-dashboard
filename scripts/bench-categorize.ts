import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildCategorizationPrompt,
  parseCategorization,
  type LlmCategory,
} from '../src/main/categorize/llm';

// Perf bench for LLM categorization. Reuses the app's real prompt + parser.
// Usage:
//   npx tsx scripts/bench-categorize.ts                       # auto backend
//   FORCE_GPU=cuda LD_LIBRARY_PATH="$PWD/.cuda-libs" npx tsx scripts/bench-categorize.ts
// Prints the active backend, load time, inference time, and the parsed mapping.

const MODEL = resolve('models', 'llama-3.2-3b-instruct-q4_k_m.gguf');

const CATEGORIES: LlmCategory[] = [
  { id: 'c1', name: 'Alimentation' },
  { id: 'c2', name: 'Restaurants' },
  { id: 'c3', name: 'Transport' },
  { id: 'c4', name: 'Logement' },
  { id: 'c5', name: 'Énergie' },
  { id: 'c6', name: 'Santé' },
  { id: 'c7', name: 'Loisirs' },
  { id: 'c8', name: 'Abonnements' },
  { id: 'c9', name: 'Shopping' },
  { id: 'c10', name: 'Salaire' },
  { id: 'c11', name: 'Impôts' },
  { id: 'c12', name: 'Assurance' },
];

const LABELS = [
  'CB CARREFOUR MARKET 12/03/25',
  'PRLV SEPA EDF CLIENTS',
  'CB UBER EATS PARIS',
  'VIR SALAIRE ACME SAS',
  'CB TOTALENERGIES STATION',
  'PRLV NETFLIX.COM',
  'CB PHARMACIE DU CENTRE',
  'CB FNAC PARIS 14/04/25',
  'PRLV SEPA FREE MOBILE',
  'CB SNCF CONNECT',
  'CB MCDONALDS LYON',
  'PRLV ASSURANCE MAAF',
];

async function main(): Promise<void> {
  const force = process.env.FORCE_GPU;
  const llama =
    force === undefined || force === 'auto'
      ? await getLlama()
      : await getLlama({ gpu: force as 'cuda' | 'vulkan' | 'metal' });
  console.log(`backend: ${JSON.stringify(llama.gpu)}`);

  const t0 = performance.now();
  const model = await llama.loadModel({ modelPath: MODEL });
  console.log(`load: ${(performance.now() - t0).toFixed(0)}ms`);

  const items = LABELS.map((label, i) => ({ id: `t${String(i)}`, label }));
  const prompt = buildCategorizationPrompt(CATEGORIES, items);

  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  const ti = performance.now();
  const raw = await session.prompt(prompt, { temperature: 0 });
  const ms = performance.now() - ti;
  await context.dispose();
  await model.dispose();

  console.log(
    `inference: ${ms.toFixed(0)}ms (${(ms / LABELS.length).toFixed(0)}ms/label) for ${String(LABELS.length)} labels`,
  );
  const parsed = parseCategorization(raw, CATEGORIES, items);
  for (const r of parsed) {
    const idx = items.findIndex((it) => it.id === r.id);
    const cat = CATEGORIES.find((c) => c.id === r.categoryId)?.name ?? 'AUCUNE';
    console.log(`  ${LABELS[idx] ?? '?'} -> ${cat}`);
  }
}

void main();
