import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { MODEL_FILE } from './llm';

/** Where the GGUF model lives: the repo's models/ in dev, else userData/models. */
export function modelsDir(): string {
  const devDir = join(process.cwd(), 'models');
  if (existsSync(join(devDir, MODEL_FILE))) return devDir;
  return join(app.getPath('userData'), 'models');
}
