import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Absolute path to the synthetic OFX fixture (3 transactions, balances to
// 1 650,00 €). Derived from this file's location so it resolves regardless of
// the process cwd. It is committed — never a spike-fixtures/ file (real data).
const FIXTURE = fileURLToPath(new URL('./fixtures/statement.ofx', import.meta.url));

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const window = await app.firstWindow();
  return { app, window };
}

// Stub the native file picker in the main process so the real "Parcourir…"
// button drives a deterministic file. Only the OS chrome is mocked — pickFile,
// extract, confirm, insert and the dashboard refresh all run for real.
async function stubFilePicker(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, filePath);
}

test('imports an OFX statement end to end and surfaces it on the dashboard', async () => {
  const { app, window } = await launchApp();
  try {
    await stubFilePicker(app, FIXTURE);

    // Fresh DB → the dashboard starts on the import-prompt empty state.
    await expect(window.getByText(/Aucune transaction/i)).toBeVisible();

    // Open the import modal and pick the (stubbed) file into the default account.
    await window.getByRole('button', { name: /importer un relevé/i }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await window.getByRole('button', { name: /parcourir/i }).click();

    // Review step: the three fixture transactions are parsed and listed.
    await expect(window.getByText('statement.ofx')).toBeVisible();
    await expect(window.getByText('SALAIRE')).toBeVisible();
    await expect(window.getByText('LOYER')).toBeVisible();
    await expect(window.getByText('COURSES')).toBeVisible();

    // Confirm the import (OFX needs no balance acknowledgement).
    await window.getByRole('button', { name: /importer 3 transactions/i }).click();

    // Modal closes and the dashboard re-renders with the persisted data: the
    // empty state is gone, the transaction shows in the table, and the KPIs now
    // resolve May 2026 as the latest month with data.
    await expect(window.getByRole('dialog')).toBeHidden();
    await expect(window.getByText(/Aucune transaction/i)).toBeHidden();
    await expect(window.getByText('SALAIRE').first()).toBeVisible();
    await expect(window.getByText(/Revenus.*mai/i)).toBeVisible();
  } finally {
    await app.close();
  }
});
