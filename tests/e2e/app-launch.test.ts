import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Launch against an isolated, empty userData dir so each run starts from a fresh
// DB (migrations seed the default categories + account, no transactions). Keeps
// assertions deterministic now that the dashboard reads real data, not mocks.
async function launchApp() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const window = await app.firstWindow();
  return { app, window };
}

test('app launches and renders the dashboard with an empty state', async () => {
  const { app, window } = await launchApp();
  try {
    // Page title now lives in the Topbar as an <h1>, in French per the
    // design system copy rules ("Tableau de bord", not "Dashboard").
    await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible();
    await expect(window.getByText('Dernières transactions')).toBeVisible();
    // Fresh DB → no transactions yet → the import-prompt empty state.
    await expect(window.getByText(/Aucune transaction/i)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('import modal opens and shows pick state', async () => {
  const { app, window } = await launchApp();
  try {
    await window.getByRole('banner').getByRole('button', { name: 'Importer' }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await expect(window.getByRole('button', { name: /parcourir/i })).toBeVisible();
    await expect(window.getByText(/OFX recommandé/i)).toBeVisible();
  } finally {
    await app.close();
  }
});
