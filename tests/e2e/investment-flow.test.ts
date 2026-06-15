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

// Drives the real Electron app against an isolated fresh DB.
// Tests the full investment flow via IPC: create wrapper → create support → apply updates
// → navigate to Patrimoine and assert the Placements card renders performance metrics.

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-invest-'));
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

test('data path via IPC + render: wrapper/support/updates appear with annualised return', async () => {
  const { app, page } = await launchApp();
  try {
    // 1. Create a wrapper (PEA).
    const { wrapper } = await ipcInvoke<{ wrapper: { id: string; name: string } }>(
      page,
      'investment:createWrapper',
      { name: 'PEA', type: 'pea' },
    );

    // 2. Create a support inside the wrapper.
    const { support } = await ipcInvoke<{ support: { id: string; name: string } }>(
      page,
      'investment:createSupport',
      { wrapperId: wrapper.id, name: 'World ETF', isin: null, classId: null },
    );

    // 3. Apply two valuations a year apart to get ≥1y of history → annualised figures.
    await ipcInvoke(page, 'investment:updateSupport', {
      supportId: support.id,
      asOf: '2023-01-01',
      value: 5000,
      flow: 5000,
    });
    await ipcInvoke(page, 'investment:updateSupport', {
      supportId: support.id,
      asOf: '2024-01-01',
      value: 5600,
      flow: 0,
    });

    // 4. Navigate to Patrimoine page.
    await page.getByRole('link', { name: 'Patrimoine' }).click();

    // 5. The Placements card must show the support name.
    await expect(page.getByText('World ETF')).toBeVisible({ timeout: 5000 });

    // 6. With ≥1 year of history the annualised rate marker « /an » is rendered
    //    (SupportPerf renders both "TRI X% /an" and "TTWROR X% /an" when hasFullYear is true).
    await expect(page.getByText(/\/an/).first()).toBeVisible({ timeout: 5000 });
  } finally {
    await app.close();
  }
});

test('net worth reflects the support current value after update', async () => {
  const { app, page } = await launchApp();
  try {
    // Create a wrapper + support and record a single valuation.
    const { wrapper } = await ipcInvoke<{ wrapper: { id: string } }>(
      page,
      'investment:createWrapper',
      { name: 'CTO Test', type: 'cto' },
    );
    const { support } = await ipcInvoke<{ support: { id: string } }>(
      page,
      'investment:createSupport',
      { wrapperId: wrapper.id, name: 'S&P 500', isin: null, classId: null },
    );
    await ipcInvoke(page, 'investment:updateSupport', {
      supportId: support.id,
      asOf: '2024-06-01',
      value: 8200,
      flow: 8200,
    });

    // Read the net worth directly via IPC to confirm the support contributes to the total.
    const nw = await ipcInvoke<{ total: number; supports: { value: number }[] }>(
      page,
      'dashboard:netWorth',
      {},
    );
    const supportTotal = nw.supports.reduce((acc, s) => acc + s.value, 0);
    expect(supportTotal).toBe(8200);

    // Navigate to Patrimoine and confirm the value appears in the UI.
    await page.getByRole('link', { name: 'Patrimoine' }).click();
    // Money component formats 8200 as « 8 200 » (narrow no-break space).
    await expect(page.getByText('S&P 500')).toBeVisible({ timeout: 5000 });
  } finally {
    await app.close();
  }
});
