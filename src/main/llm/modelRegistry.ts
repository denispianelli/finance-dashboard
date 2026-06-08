/** A downloadable model + the VRAM it needs. MODELS is ordered best-first so
 *  "the best present / best the hardware can run" is a simple find(). */
export interface ModelSpec {
  id: string;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  label: string;
  minVramBytes: number;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'qwen2.5-7b',
    fileName: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sha256: '65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423',
    sizeBytes: 4683074240,
    label: 'Qwen2.5 7B',
    minVramBytes: 6 * 1024 ** 3,
  },
  {
    id: 'llama-3.2-3b',
    fileName: 'llama-3.2-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    sizeBytes: 2019377696,
    label: 'Llama 3.2 3B',
    minVramBytes: 0,
  },
];

/** The universal fallback (minVramBytes 0) — the last, lowest tier. */
const FALLBACK: ModelSpec = (() => {
  const last = MODELS[MODELS.length - 1];
  if (last === undefined) throw new Error('MODELS must contain at least one entry');
  return last;
})();

/** The universal fallback spec (the lowest tier). Exported so other modules need
 *  no non-null assertions to reference it. */
export function fallbackModel(): ModelSpec {
  return FALLBACK;
}

/**
 * Pick the model the hardware can run: CPU/no-GPU → fallback (3B); otherwise the
 * highest-tier spec whose minVramBytes fits the total VRAM (MODELS is best-first).
 * Decision uses TOTAL VRAM (stable capability), not free (fluctuates).
 */
export function selectModelSpec(gpu: string | false, vramTotalBytes: number): ModelSpec {
  if (gpu === false) return FALLBACK;
  return MODELS.find((m) => m.minVramBytes <= vramTotalBytes) ?? FALLBACK;
}

/**
 * E2E-only: when FD_MODEL_URL is set, point the download at the stub server instead
 * of HuggingFace (mirrors the old MODEL_MANIFEST env hooks). Never set in production.
 */
export function withDownloadOverrides(spec: ModelSpec): ModelSpec {
  if (process.env.FD_MODEL_URL === undefined) return spec;
  return {
    ...spec,
    url: process.env.FD_MODEL_URL,
    sha256: process.env.FD_MODEL_SHA256 ?? spec.sha256,
    sizeBytes:
      process.env.FD_MODEL_SIZE !== undefined ? Number(process.env.FD_MODEL_SIZE) : spec.sizeBytes,
  };
}
