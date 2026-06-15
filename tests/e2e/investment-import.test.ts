import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Drives the real Electron app against a fresh isolated DB.
// Tests the Fortuneo bourse CSV import flow end-to-end via IPC:
//   createWrapper → importBourseCsv → navigate to Patrimoine → assert support visible.

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-csv-import-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const page = await app.firstWindow();
  return { app, page };
}

/** Call a typed IPC channel from the renderer (the preload-exposed bridge). */
function ipcInvoke<T>(page: Page, channel: string, payload: unknown): Promise<T> {
  return page.evaluate(
    (args) => {
      const api = (
        window as unknown as {
          electronAPI: { invoke: (c: string, p: unknown) => Promise<unknown> };
        }
      ).electronAPI;
      return api.invoke(args.channel, args.payload);
    },
    { channel, payload },
  ) as Promise<T>;
}

/** Write a synthetic Fortuneo bourse CSV (ISO-8859-1) to a temp file and return its path. */
function writeSyntheticCsv(): string {
  // Fortuneo's real format: semicolon-delimited, latin1, trailing semicolon on data rows.
  // Columns: libellé;Opération;Place;Date;Qté;Prix d'éxé;Montant brut;Courtage/Prélèvement;Montant net;Devise;
  const csvContent = [
    "libellé;Opération;Place;Date;Qté;Prix d'éxé;Montant brut;Courtage/Prélèvement;Montant net;Devise;",
    'WORLD ETF;Achat Comptant;Euronext Paris;01/01/2025;100;5;-500;-2;-502;EUR;',
    'WORLD ETF;Vente comptant;Euronext Paris;01/06/2025;100;6;600;-2;598;EUR;',
  ].join('\n');

  const dir = mkdtempSync(join(tmpdir(), 'fd-csv-'));
  const path = join(dir, 'fortuneo-test.csv');
  writeFileSync(path, csvContent, { encoding: 'latin1' });
  return path;
}

test('Fortuneo CSV import populates wrapper with operations and surfaces support in Placements card', async () => {
  const { app, page } = await launchApp();
  try {
    // 1. Write the synthetic CSV to a temp path.
    const csvPath = writeSyntheticCsv();

    // 2. Create a PEA wrapper.
    const { wrapper } = await ipcInvoke<{ wrapper: { id: string; name: string } }>(
      page,
      'investment:createWrapper',
      { name: 'PEA', type: 'pea' },
    );

    // 3. Import the CSV into the wrapper and verify the import result.
    const { result } = await ipcInvoke<{
      result: {
        operationsImported: number;
        alreadyPresent: number;
        skippedRows: number;
        createdSupports: { id: string; name: string }[];
        supportsTouched: number;
      };
    }>(page, 'investment:importBourseCsv', { path: csvPath, wrapperId: wrapper.id });

    expect(result.operationsImported).toBe(2);
    expect(result.createdSupports.length).toBe(1);
    expect(result.createdSupports[0]?.name).toBe('WORLD ETF');

    // 4. Navigate to the Patrimoine page and assert the support appears in the Placements card.
    await page.getByRole('link', { name: 'Patrimoine' }).click();
    await expect(page.getByText('WORLD ETF')).toBeVisible({ timeout: 5000 });

    // 5. (Optional) confirm that listOperations returns the 2 imported operations.
    const supportId = result.createdSupports[0]?.id ?? '';
    const { operations } = await ipcInvoke<{
      operations: { id: string; kind: string }[];
    }>(page, 'investment:listOperations', { supportId });

    expect(operations.length).toBe(2);
  } finally {
    await app.close();
  }
});

test('idempotent re-import: second CSV import adds 0 operations', async () => {
  const { app, page } = await launchApp();
  try {
    const csvPath = writeSyntheticCsv();

    const { wrapper } = await ipcInvoke<{ wrapper: { id: string } }>(
      page,
      'investment:createWrapper',
      { name: 'CTO', type: 'cto' },
    );

    // First import.
    await ipcInvoke(page, 'investment:importBourseCsv', { path: csvPath, wrapperId: wrapper.id });

    // Second import of the same file: all rows already present, none added.
    const { result } = await ipcInvoke<{
      result: { operationsImported: number; alreadyPresent: number };
    }>(page, 'investment:importBourseCsv', { path: csvPath, wrapperId: wrapper.id });

    expect(result.operationsImported).toBe(0);
    expect(result.alreadyPresent).toBe(2);
  } finally {
    await app.close();
  }
});
