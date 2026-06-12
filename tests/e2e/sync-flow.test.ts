import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launchApp(userDataDir: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const window = await app.firstWindow();
  return { app, window };
}

async function stubFolderPicker(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, pickedFolder) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [pickedFolder], bookmarks: [] });
  }, folder);
}

// safeStorage needs an OS keyring; headless CI Linux may lack one. Detect at
// runtime and skip rather than fail — Windows/macOS legs cover the flow.

test('sync round-trip: machine 1 writes, machine 2 restores', async () => {
  const syncFolder = mkdtempSync(join(tmpdir(), 'fd-sync-'));
  const userData1 = mkdtempSync(join(tmpdir(), 'fd-e2e-m1-'));
  const userData2 = mkdtempSync(join(tmpdir(), 'fd-e2e-m2-'));

  // ── Machine 1 ────────────────────────────────────────────────────────────
  {
    const { app, window } = await launchApp(userData1);
    try {
      await stubFolderPicker(app, syncFolder);

      // Wait for dashboard to load
      await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible();

      // Navigate to the Accounts page (sidebar nav link "Comptes")
      await window.getByRole('link', { name: /comptes/i }).click();
      await expect(window.getByRole('button', { name: /nouveau compte/i })).toBeVisible();

      // Open the "add account" inline form
      await window.getByRole('button', { name: /nouveau compte/i }).click();

      // Fill in account name and submit (the form has a "Nom du compte" placeholder)
      await window.getByPlaceholder('Nom du compte').fill('Compte Sync E2E');
      await window.getByRole('button', { name: /créer le compte/i }).click();

      // Verify the account was created (exact match to avoid matching the toast notification)
      await expect(window.getByText('Compte Sync E2E', { exact: true }).first()).toBeVisible();

      // Navigate to Settings ("Paramètres" in sidebar)
      await window.getByRole('link', { name: /paramètres/i }).click();
      // CardTitle is a <div>, not a heading — use getByText
      await expect(window.getByText('Synchronisation', { exact: true })).toBeVisible();

      // Open the setup dialog
      await window.getByRole('button', { name: /configurer/i }).click();
      await expect(window.getByText('Configurer la synchronisation')).toBeVisible();

      // Pick a folder (stubbed to return syncFolder)
      await window.getByRole('button', { name: /choisir un dossier/i }).click();
      // After picking, the folder path should appear
      await expect(window.getByText(syncFolder)).toBeVisible();

      // Fill passphrase fields
      await window.getByPlaceholder('Passphrase', { exact: true }).fill('passphrase-e2e');
      await window
        .getByPlaceholder('Confirmer la passphrase', { exact: true })
        .fill('passphrase-e2e');

      // Click "Activer"
      await window.getByRole('button', { name: /^activer$/i }).click();

      // Race: success toast vs. safeStorage error toast
      const successToast = window.getByText(/synchronisation activée/i);
      const keystoreErrorToast = window.getByText(
        /le trousseau système est indisponible sur cette machine/i,
      );

      const result = await Promise.race([
        successToast.waitFor({ timeout: 30_000 }).then(() => 'success' as const),
        keystoreErrorToast.waitFor({ timeout: 30_000 }).then(() => 'keystore_error' as const),
      ]);

      if (result === 'keystore_error') {
        test.skip(true, 'safeStorage unavailable on this environment');
        return;
      }

      // Setup dialog should have closed, sync is now enabled
      await expect(
        window.getByRole('dialog', { name: /configurer la synchronisation/i }),
      ).toBeHidden();

      // The settings section should now show sync controls: "Synchroniser maintenant"
      await expect(window.getByRole('button', { name: /synchroniser maintenant/i })).toBeVisible({
        timeout: 15_000,
      });

      // Click "Synchroniser maintenant"
      await window.getByRole('button', { name: /synchroniser maintenant/i }).click();

      // Expect success toast "Snapshot écrit."
      await expect(window.getByText(/snapshot écrit/i)).toBeVisible({ timeout: 30_000 });

      // Assert the snapshot file exists
      expect(existsSync(join(syncFolder, 'finance.fbk'))).toBe(true);
    } finally {
      await app.close();
    }
  }

  // ── Machine 2 ────────────────────────────────────────────────────────────
  {
    const { app, window } = await launchApp(userData2);
    try {
      await stubFolderPicker(app, syncFolder);

      // Wait for dashboard to load
      await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible();

      // Navigate to Settings
      await window.getByRole('link', { name: /paramètres/i }).click();
      // CardTitle is a <div>, not a heading — use getByText
      await expect(window.getByText('Synchronisation', { exact: true })).toBeVisible();

      // Open setup dialog
      await window.getByRole('button', { name: /configurer/i }).click();
      await expect(window.getByText('Configurer la synchronisation')).toBeVisible();

      // Pick the same sync folder
      await window.getByRole('button', { name: /choisir un dossier/i }).click();
      await expect(window.getByText(syncFolder)).toBeVisible();

      // Fill passphrase fields with the same passphrase
      await window.getByPlaceholder('Passphrase', { exact: true }).fill('passphrase-e2e');
      await window
        .getByPlaceholder('Confirmer la passphrase', { exact: true })
        .fill('passphrase-e2e');

      // Click "Activer"
      await window.getByRole('button', { name: /^activer$/i }).click();

      // Race success vs. keystore error (same skip guard)
      const successToast2 = window.getByText(/synchronisation activée/i);
      const keystoreErrorToast2 = window.getByText(
        /le trousseau système est indisponible sur cette machine/i,
      );

      const result2 = await Promise.race([
        successToast2.waitFor({ timeout: 30_000 }).then(() => 'success' as const),
        keystoreErrorToast2.waitFor({ timeout: 30_000 }).then(() => 'keystore_error' as const),
      ]);

      if (result2 === 'keystore_error') {
        test.skip(true, 'safeStorage unavailable on this environment');
        return;
      }

      // After enabling sync, the recheck fires via 'sync:recheck' event.
      // The gate dialog "Données plus récentes trouvées" should appear
      // (DialogTitle is a <h2> via shadcn — check by text content).
      await expect(window.getByText('Données plus récentes trouvées')).toBeVisible({
        timeout: 30_000,
      });

      // Click "Restaurer"
      await window.getByRole('button', { name: /^restaurer$/i }).click();

      // The app reloads on success (window.location.reload()).
      // Wait for the dashboard heading to re-appear after the reload.
      await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible({
        timeout: 60_000,
      });

      // Navigate to the Accounts page and expect the synced account to be present.
      await window.getByRole('link', { name: /comptes/i }).click();
      await expect(window.getByText('Compte Sync E2E', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  }
});

// Set a generous timeout: Argon2id runs 3 times (enable × 2 + restore × 1)
// plus two full Electron launches with DB setup.
test.setTimeout(180_000);
