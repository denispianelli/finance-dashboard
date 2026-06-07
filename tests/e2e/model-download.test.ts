import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A tiny buffer — large enough for a real sha256 round-trip, small enough to
// transfer instantly. The stub server advertises its exact byte count so the
// disk-space check in downloadModel passes without needing real free space.
const FIXTURE = Buffer.from('fake-gguf-bytes-for-e2e-model-download-test');
const SHA = createHash('sha256').update(FIXTURE).digest('hex');

async function launchApp(
  port: number,
  userDataDir: string,
  modelsTempDir: string,
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      FD_MODEL_URL: `http://127.0.0.1:${String(port)}/model.gguf`,
      FD_MODEL_SHA256: SHA,
      FD_MODEL_SIZE: String(FIXTURE.length),
      // Override the models dir so the app does not detect the real dev model
      // at process.cwd()/models and report state='ready' before download.
      FD_MODELS_DIR: modelsTempDir,
    },
  });
  const window = await app.firstWindow();
  return { app, window };
}

test('downloads the model (stubbed) and reflects it in Settings', async () => {
  // 1. Start a stub HTTP server that serves the fixture with correct content-length.
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(FIXTURE.length),
    });
    res.end(FIXTURE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  // 2. Isolated userData and models dirs — fresh app state, no pre-existing model.
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-model-'));
  const modelsTempDir = join(userDataDir, 'models');
  mkdirSync(modelsTempDir, { recursive: true });

  const { app, window } = await launchApp(port, userDataDir, modelsTempDir);
  try {
    // 3. Navigate to Settings via the sidebar link (path /settings, label "Paramètres").
    //    The sidebar NavLink uses aria-label when collapsed, or visible text when expanded.
    //    Click by the link href to be robust to collapsed/expanded state.
    await window.getByRole('link', { name: /paramètres/i }).click();
    await expect(window.getByRole('heading', { name: /paramètres/i })).toBeVisible();

    // 4. The model section should show the download button (state=absent).
    const downloadBtn = window.getByRole('button', { name: /télécharger le modèle/i });
    await expect(downloadBtn).toBeVisible();

    // 5. Click download — the stub server responds immediately so the download
    //    completes quickly. The controller flips to state=ready, which re-renders
    //    the button as "Supprimer le modèle".
    await downloadBtn.click();

    // 6. Assert the model is now ready: the "Supprimer le modèle" button appears.
    await expect(window.getByRole('button', { name: /supprimer le modèle/i })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await app.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});
