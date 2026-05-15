import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error — pdfjs-dist legacy ESM
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MODELS = [
  { name: 'Qwen2.5 3B Instruct Q4_K_M', file: 'qwen2.5-3b-instruct-q4_k_m.gguf' },
  { name: 'Phi-3.5 Mini Q4_K_M', file: 'phi-3.5-mini-instruct-q4_k_m.gguf' },
  { name: 'Llama 3.2 3B Q4_K_M', file: 'llama-3.2-3b-instruct-q4_k_m.gguf' },
];

const FIXTURES = [
  {
    path: 'spike-fixtures/COMPTEDEDEPOTS_08992009022_20251202.pdf',
    bank: 'LCL Compte courant',
    expectedTx: 0,
  },
  {
    path: 'spike-fixtures/COMPTEDEDEPOTSJOINT_08992007490_20251202.pdf',
    bank: 'LCL Compte joint',
    expectedTx: 0,
  },
];

const PROMPT =
  `Voici le texte d'un relevé bancaire. Identifie les colonnes ` +
  `(Date, Libellé, Débit, Crédit, Solde) en donnant pour chacune son numéro d'ordre ` +
  `d'apparition (1 = première colonne à gauche). ` +
  `Réponds UNIQUEMENT en JSON strict, sans explication. Exemple : ` +
  `{"date":1,"label":2,"debit":3,"credit":4,"balance":5}`;

async function pdfToText(path: string): Promise<string> {
  const data = new Uint8Array(readFileSync(resolve(path)));
  const doc = await (pdfjs as typeof pdfjs).getDocument({ data }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += (content.items as Array<{ str: string }>).map((it) => it.str).join(' ') + '\n';
  }
  return out;
}

async function benchModel(
  modelPath: string,
  fixtures: { name: string; text: string }[],
): Promise<{ loadMs: number; results: { fixture: string; ms: number; response: string }[] }> {
  const llama = await getLlama();
  const t0 = performance.now();
  const model = await llama.loadModel({ modelPath });
  const loadMs = performance.now() - t0;
  const results = [];

  for (const f of fixtures) {
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    const ti = performance.now();
    const response = await session.prompt(`${PROMPT}\n\n---\n${f.text.slice(0, 8000)}`);
    const ms = performance.now() - ti;
    results.push({ fixture: f.name, ms, response: response.trim() });
    await context.dispose();
  }

  await model.dispose();
  return { loadMs, results };
}

async function main(): Promise<void> {
  const availableFixtures: { name: string; text: string }[] = [];
  for (const f of FIXTURES) {
    if (!existsSync(f.path)) {
      console.warn(`⚠ Fixture not found, skipping: ${f.path}`);
      continue;
    }
    console.log(`📄 Parsing ${f.bank}...`);
    availableFixtures.push({ name: f.bank, text: await pdfToText(f.path) });
  }

  if (availableFixtures.length === 0) {
    console.error(
      'No fixtures found. Add PDFs to spike-fixtures/ and update FIXTURES in this script.',
    );
    process.exit(1);
  }

  for (const m of MODELS) {
    const modelPath = resolve('models', m.file);
    if (!existsSync(modelPath)) {
      console.log(`\n⏭  ${m.name} — model file not found, skipping (${modelPath})`);
      continue;
    }
    console.log(`\n=== ${m.name} ===`);
    try {
      const r = await benchModel(modelPath, availableFixtures);
      console.log(`  load : ${r.loadMs.toFixed(0)}ms`);
      for (const item of r.results) {
        console.log(`  ${item.fixture} : ${item.ms.toFixed(0)}ms`);
        console.log(`    response : ${item.response}`);
      }
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }
}

void main();
