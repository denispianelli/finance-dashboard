import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { MODEL_FILE } from './llm';

/**
 * Where the GGUF model lives: the repo's models/ in dev, else userData/models.
 *
 * E2E testing only: FD_MODELS_DIR overrides both paths so the test suite can
 * point the app at a fresh temp directory where no model exists yet.
 * Never set it in production.
 */
export function modelsDir(): string {
  if (process.env.FD_MODELS_DIR !== undefined) return process.env.FD_MODELS_DIR;
  const devDir = join(process.cwd(), 'models');
  if (existsSync(join(devDir, MODEL_FILE))) return devDir;
  return join(app.getPath('userData'), 'models');
}
