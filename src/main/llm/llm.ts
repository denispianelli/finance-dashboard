import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LlamaModel } from 'node-llama-cpp';

/** The model selected in ADR-004 (Llama 3.2 3B Instruct, Q4_K_M GGUF). */
export const MODEL_FILE = 'llama-3.2-3b-instruct-q4_k_m.gguf';

export function resolveModelPath(modelsDir: string): string {
  return join(modelsDir, MODEL_FILE);
}

/** Whether the GGUF model file is present (it is downloaded once, ~1.9 GB). */
export function isModelAvailable(modelsDir: string): boolean {
  return existsSync(resolveModelPath(modelsDir));
}

let modelPromise: Promise<LlamaModel> | null = null;

/**
 * Load the model once and cache it. node-llama-cpp is imported dynamically so the
 * native addon is only loaded when the LLM is actually used (column mapping /
 * categorization run in the background, never on the hot path).
 */
export async function getModel(modelsDir: string): Promise<LlamaModel> {
  // ??= so a failed load (which resets modelPromise to null in the catch) can retry.
  modelPromise ??= loadModel(modelsDir).catch((e: unknown) => {
    modelPromise = null;
    throw e;
  });
  return modelPromise;
}

async function loadModel(modelsDir: string): Promise<LlamaModel> {
  const path = resolveModelPath(modelsDir);
  if (!existsSync(path)) {
    throw new Error(`LLM model not found at ${path} — download it first`);
  }
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  return llama.loadModel({ modelPath: path });
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
