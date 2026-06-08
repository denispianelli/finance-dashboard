import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LlamaModel } from 'node-llama-cpp';
import { MODELS, selectModelSpec, fallbackModel, type ModelSpec } from './modelRegistry';

export function resolveModelPath(modelsDir: string, spec: ModelSpec): string {
  return join(modelsDir, spec.fileName);
}

/**
 * The highest-tier registry model whose file is present (MODELS is best-first), or
 * null. This is what we actually load — no VRAM detection needed to use what's on
 * disk (a downloaded Qwen-7B is used even on a machine we'd never pick it for).
 */
export function findBestPresentModel(modelsDir: string): ModelSpec | null {
  return MODELS.find((m) => existsSync(join(modelsDir, m.fileName))) ?? null;
}

/** Whether any model is downloaded (drives the categorize guard + status). */
export function isModelAvailable(modelsDir: string): boolean {
  return findBestPresentModel(modelsDir) !== null;
}

let selectionPromise: Promise<ModelSpec> | null = null;

/**
 * The model the hardware can run (download target). Lazy: loads the node-llama-cpp
 * backend once to read VRAM (never the multi-GB model), then caches. Any detection
 * failure falls back to the 3B — never throws.
 */
export async function getActiveSelection(): Promise<ModelSpec> {
  selectionPromise ??= detectSelection().catch(() => fallbackModel());
  return selectionPromise;
}

async function detectSelection(): Promise<ModelSpec> {
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  const vram = await llama.getVramState();
  const spec = selectModelSpec(llama.gpu, vram.total);
  console.log(
    `[llm] hardware: gpu=${JSON.stringify(llama.gpu)} vramTotal=${String(vram.total)} → ${spec.id}`,
  );
  return spec;
}

let modelPromise: Promise<LlamaModel> | null = null;

/** Load the best-present model once and cache it (node-llama-cpp imported dynamically
 *  so the native addon stays off the launch path). Throws if no model is downloaded. */
export async function getModel(modelsDir: string): Promise<LlamaModel> {
  modelPromise ??= loadModel(modelsDir).catch((e: unknown) => {
    modelPromise = null;
    throw e;
  });
  return modelPromise;
}

async function loadModel(modelsDir: string): Promise<LlamaModel> {
  const spec = findBestPresentModel(modelsDir);
  if (spec === null) {
    throw new Error(`No LLM model present in ${modelsDir} — download one first`);
  }
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  console.log(`[llm] loading ${spec.id}; inference backend: ${JSON.stringify(llama.gpu)}`);
  return llama.loadModel({ modelPath: join(modelsDir, spec.fileName) });
}

/**
 * Run a single deterministic prompt (temperature 0) and return the trimmed text.
 * A fresh context per call keeps prompts independent (no shared chat history).
 */
export async function runPrompt(model: LlamaModel, text: string): Promise<string> {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await model.createContext();
  try {
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    const out = await session.prompt(text, { temperature: 0 });
    return out.trim();
  } finally {
    await context.dispose();
  }
}
