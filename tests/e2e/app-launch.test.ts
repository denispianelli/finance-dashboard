import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

async function launchApp() {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js')] });
  const window = await app.firstWindow();
  return { app, window };
}

test('app launches and renders dashboard', async () => {
  const { app, window } = await launchApp();
  try {
    // Page title now lives in the Topbar as an <h1>, in French per the
    // design system copy rules ("Tableau de bord", not "Dashboard").
    await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('import modal opens and shows pick state', async () => {
  const { app, window } = await launchApp();
  try {
    await window.getByRole('button', { name: /importer un relevé/i }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await expect(window.getByRole('button', { name: /parcourir/i })).toBeVisible();
    await expect(window.getByText(/OFX recommandé/i)).toBeVisible();
  } finally {
    await app.close();
  }
});
