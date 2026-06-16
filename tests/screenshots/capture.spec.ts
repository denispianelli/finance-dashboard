import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Screenshot harness (NOT a test — no assertions). Launches the real packaged
 * Electron app, seeds a representative dataset through the typed IPC bridge +
 * the real import flow, then captures every route in BOTH themes to
 * `.screenshots/` (gitignored). Lets the agent see its own rendered output and
 * diff it against the Aurora handoff reference. Run via `npm run screenshots`.
 */

const OUT_DIR = join(process.cwd(), '.screenshots');
const FIXTURE = fileURLToPath(new URL('../e2e/fixtures/statement.ofx', import.meta.url));

const VIEWPORT = { width: 1440, height: 900 };

const ROUTES: { hash: string; title: RegExp; name: string }[] = [
  { hash: '#/', title: /tableau de bord/i, name: '01-dashboard' },
  { hash: '#/transactions', title: /transactions/i, name: '02-transactions' },
  { hash: '#/accounts', title: /comptes/i, name: '03-comptes' },
  { hash: '#/categories', title: /catégories/i, name: '04-categories' },
  { hash: '#/reports', title: /rapports/i, name: '05-rapports' },
  { hash: '#/patrimoine', title: /patrimoine/i, name: '06-patrimoine' },
  { hash: '#/settings', title: /paramètres/i, name: '07-parametres' },
];

const LOAN = {
  name: 'Prêt immobilier',
  share: 0.5,
  parsed: {
    name: 'Prêt immobilier',
    loanNumber: null,
    principal: 180000,
    nominalRate: 1.62,
    termMonths: 3,
    startDate: '2024-01-01',
    totals: { capital: 180000, interest: 0, insurance: 0 },
    installments: [
      {
        seq: 1,
        dueDate: '2024-01-01',
        capital: 600,
        interest: 200,
        insurance: 12,
        fees: 0,
        payment: 812,
        balanceAfter: 131912,
      },
      {
        seq: 2,
        dueDate: '2099-01-01',
        capital: 131912,
        interest: 0,
        insurance: 0,
        fees: 0,
        payment: 131912,
        balanceAfter: 0,
      },
    ],
  },
};

const ASSET = {
  name: 'Résidence principale',
  kind: 'property',
  declaredValue: 300000,
  share: 0.5,
  valuedAt: '2026-06-14',
};

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

/** Stub the OS file picker so the real import flow reads a deterministic file. */
async function stubFilePicker(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, filePath);
}

/** Drive the real import modal once to seed transactions (best-effort). */
async function seedTransactions(app: ElectronApplication, page: Page): Promise<void> {
  try {
    await stubFilePicker(app, FIXTURE);
    await page.getByRole('button', { name: /importer un relevé/i }).click();
    await page.getByRole('button', { name: /parcourir/i }).click();
    await page.getByRole('button', { name: /continuer/i }).click({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /importer \d+ transaction/i })
      .click({ timeout: 10_000 });
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 });
  } catch {
    // Best-effort: if the import flow changes, captures still proceed (the
    // transaction-backed screens just show their empty state).
  }
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

test('capture every route in dark and light', async () => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-shots-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const page = await app.firstWindow();

  try {
    await page.setViewportSize(VIEWPORT);

    // Seed a representative dataset covering every screen.
    await seedTransactions(app, page);
    await ipcInvoke(page, 'patrimoine:createLoan', LOAN);
    await ipcInvoke(page, 'patrimoine:upsertAsset', ASSET);
    const { wrapper } = await ipcInvoke<{ wrapper: { id: string } }>(
      page,
      'investment:createWrapper',
      { name: 'PEA', type: 'pea' },
    );
    const { support } = await ipcInvoke<{ support: { id: string } }>(
      page,
      'investment:createSupport',
      { wrapperId: wrapper.id, name: 'Amundi MSCI World', isin: null, classId: null },
    );
    await ipcInvoke(page, 'investment:updateSupport', {
      supportId: support.id,
      asOf: '2025-06-01',
      value: 5000,
      flow: 5000,
    });
    await ipcInvoke(page, 'investment:updateSupport', {
      supportId: support.id,
      asOf: '2026-06-01',
      value: 5600,
      flow: 0,
    });

    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      for (const route of ROUTES) {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, route.hash);
        // Wait for the topbar title to confirm the route mounted, then settle.
        await page
          .getByRole('heading', { level: 1, name: route.title })
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => {
            /* capture anyway even if the heading probe misses */
          });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: join(OUT_DIR, `${theme}-${route.name}.png`),
          fullPage: true,
        });
      }
    }
  } finally {
    await app.close();
  }
});
