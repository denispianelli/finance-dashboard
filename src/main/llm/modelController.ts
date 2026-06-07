import { createDownloadController } from './downloadController';
import { modelsDir } from './modelsDir';

/** App-wide single instance; the renderer drives it through the model IPC handlers. */
export const modelController = createDownloadController(modelsDir);
