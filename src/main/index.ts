import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAllHandlers } from './ipc/register';
import { getDb, closeDb } from './db';
import { syncController } from './sync/controller';
import { detectTransfers } from './transfers/detect';
import { modelController } from './llm/modelController';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Finance Dashboard',
    backgroundColor: '#0B0D12', // --ink-1, avoids a wrong-colour flash before render
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hardening (ADR-002 defence in depth). The renderer is a single-page app
  // loaded from file:// (or the dev server); it never opens external windows,
  // navigates the top frame (routing is hash-based), or needs OS permissions.
  // Deny all three so a hypothetical renderer compromise cannot open arbitrary
  // URLs/apps, exfiltrate data via a top-frame navigation (which CSP
  // connect-src does NOT cover), or be granted camera/geolocation/etc.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // Push every model-status change to the renderer (progress bar, banner, settings).
  const unsubscribeModelStatus = modelController.subscribe((status) => {
    if (!win.isDestroyed()) win.webContents.send('model:progress', status);
  });
  win.once('closed', unsubscribeModelStatus);

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  getDb();
  // Re-pair internal transfers on startup (ADR-016) so already-imported data is
  // corrected without needing a fresh import. Idempotent; respects user locks.
  try {
    detectTransfers(getDb());
  } catch (e) {
    // best-effort — never block startup on this; log so a persistent failure
    // (e.g. a SQL regression) leaves a trail instead of silently stale flags.
    console.error('startup: transfer detection failed', e);
  }
  registerAllHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Write a final snapshot when quitting with unsynced changes. preventDefault +
// async flush + re-quit is the standard Electron pattern; the guard makes the
// second pass fall through to closeDb.
let quitFlushStarted = false;
app.on('will-quit', (event) => {
  if (!quitFlushStarted && syncController.needsQuitFlush()) {
    quitFlushStarted = true;
    event.preventDefault();
    const QUIT_FLUSH_TIMEOUT_MS = 10_000;
    void Promise.race([
      syncController.flushOnQuit(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('sync: quit flush timed out'));
        }, QUIT_FLUSH_TIMEOUT_MS).unref();
      }),
    ])
      .catch((e: unknown) => {
        console.error('sync: quit flush failed', e);
      })
      .finally(() => {
        closeDb();
        app.quit();
      });
    return;
  }
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
