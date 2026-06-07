import { MODEL_FILE } from './llm';

/**
 * Pinned download source for the ADR-004 model (Llama 3.2 3B Instruct Q4_K_M GGUF).
 * sha256 + sizeBytes were computed from the maintainer's working copy; the runtime
 * verifies sha256 after download, so any mirror set as `url` MUST serve a
 * byte-identical file.
 */
export const MODEL_MANIFEST = {
  fileName: MODEL_FILE,
  url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
  sizeBytes: 2019377696,
} as const;
