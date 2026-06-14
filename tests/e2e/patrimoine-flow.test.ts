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

// This drives the REAL Electron app. It injects a loan and an asset through the
// real typed IPC (patrimoine:createLoan / upsertAsset) rather than a PDF + native
// file dialog — PDF parsing is covered to the cent by the unit tests
// (parseLclAmortization + the guarded real-PDF test). What this proves that units
// can't: the migration, IPC wiring, net-worth computation and the Patrimoine page
// all work together inside the packaged main+renderer.

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-'));
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

// CRD today is 800 for any realistic run date: the second installment is dated far
// in the future, so the lookup lands on the first row (balanceAfter 800). This
// keeps the test free of a date-bomb.
const LOAN = {
  name: 'Prêt E2E',
  share: 0.5,
  parsed: {
    name: 'Prêt E2E',
    loanNumber: null,
    principal: 1000,
    nominalRate: 1,
    termMonths: 2,
    startDate: '2000-01-01',
    totals: { capital: 1000, interest: 0, insurance: 0 },
    installments: [
      {
        seq: 1,
        dueDate: '2000-01-01',
        capital: 200,
        interest: 0,
        insurance: 0,
        fees: 0,
        payment: 200,
        balanceAfter: 800,
      },
      {
        seq: 2,
        dueDate: '2099-01-01',
        capital: 800,
        interest: 0,
        insurance: 0,
        fees: 0,
        payment: 800,
        balanceAfter: 0,
      },
    ],
  },
};

const ASSET = {
  name: 'Résidence E2E',
  kind: 'property',
  declaredValue: 300000,
  share: 0.5,
  valuedAt: '2026-06-14',
};

test('a loan and declared asset fold into net worth and render on the Patrimoine page', async () => {
  const { app, page } = await launchApp();
  try {
    await ipcInvoke(page, 'patrimoine:createLoan', LOAN);
    await ipcInvoke(page, 'patrimoine:upsertAsset', ASSET);

    // Net worth in the real app: 300000×0.5 − 800×0.5 = 149600 (no account balances
    // in a fresh DB).
    const netWorth = await ipcInvoke<{ total: number }>(page, 'dashboard:netWorth', {});
    expect(netWorth.total).toBe(149600);

    // The Patrimoine page renders the loan card (CRD) and the property card.
    await page.getByRole('link', { name: 'Patrimoine' }).click();
    await expect(page.getByText('Prêt E2E')).toBeVisible();
    await expect(page.getByText('Capital restant dû')).toBeVisible();
    await expect(page.getByText('Bien immobilier')).toBeVisible();
  } finally {
    await app.close();
  }
});
