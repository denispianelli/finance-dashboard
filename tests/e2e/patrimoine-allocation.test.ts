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
// Tests the full allocation UI flow: create a class via the dialog, assign the
// default seeded account ("Compte LCL") to it, close the dialog, and assert the
// Allocation card renders the new class name.

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-alloc-'));
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

// The default seeded account in every fresh DB (migration 003).
const DEFAULT_ACCOUNT_NAME = 'Compte LCL';

test('allocation dialog: create a class, assign the default account, see the slice rendered', async () => {
  const { app, page } = await launchApp();
  try {
    // Navigate to the Patrimoine page.
    await page.getByRole('link', { name: 'Patrimoine' }).click();

    // The Allocation card starts empty — no classes yet.
    await expect(page.getByText('Aucune classe')).toBeVisible();

    // Open the class manager dialog.
    await page.getByRole('button', { name: /gérer les classes/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /classes d'actifs/i })).toBeVisible();

    // Add a new class (initially named "Nouvelle classe").
    await page.getByRole('button', { name: /ajouter une classe/i }).click();

    // There should now be exactly one class row. Find its name input and rename it.
    // Use the first visible textbox inside the dialog (the Classes section).
    const dialogEl = page.getByRole('dialog');
    const firstNameInput = dialogEl.getByRole('textbox').first();
    await firstNameInput.fill('Cash');
    await firstNameInput.press('Enter');

    // Set the target to 100 %.
    // The target input is a number input (type=number) with placeholder "—".
    const targetInput = dialogEl.locator('input[type="number"]').first();
    await targetInput.fill('100');
    await targetInput.press('Enter');

    // In the Affectation section, find the row for the default account and select "Cash".
    // Find the row containing the account name, then its select.
    const accountRow = dialogEl.locator('div').filter({ hasText: DEFAULT_ACCOUNT_NAME }).last();
    const select = accountRow.locator('select');

    // Wait for the "Cash" option to appear (the dialog re-renders after upsertClass).
    await expect(select.locator('option', { hasText: 'Cash' })).toHaveCount(1, {
      timeout: 5000,
    });

    await select.selectOption({ label: 'Cash' });

    // Close the dialog.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // The Allocation card should now show the "Cash" class name as a slice label.
    // Wait for the UI to re-render after assignClass IPC resolves.
    await expect(page.getByText('Cash')).toBeVisible({ timeout: 5000 });

    // Also assert the "Aucune classe" empty state is gone.
    await expect(page.getByText('Aucune classe')).not.toBeVisible();
  } finally {
    await app.close();
  }
});

test('allocation: class created via IPC appears in the card without a balance', async () => {
  const { app, page } = await launchApp();
  try {
    // Create a class and assign the default account directly via IPC — this verifies
    // the full data path (repo → IPC → getAllocation) independently of dialog interaction.
    const { class: cls } = await ipcInvoke<{ class: { id: string; name: string } }>(
      page,
      'patrimoine:upsertClass',
      { name: 'Obligations', color: '#6E8FA6', targetPct: 0.4 },
    );

    await ipcInvoke(page, 'patrimoine:assignClass', {
      kind: 'account',
      id: 'acc-lcl-default',
      classId: cls.id,
    });

    // Navigate to the Patrimoine page and assert the slice label is visible.
    await page.getByRole('link', { name: 'Patrimoine' }).click();

    // The page loads allocation on mount; with a fresh DB the account balance is 0
    // but the class slice still renders (value 0 € is shown, pct 0 %).
    await expect(page.getByText('Obligations')).toBeVisible({ timeout: 5000 });
  } finally {
    await app.close();
  }
});
