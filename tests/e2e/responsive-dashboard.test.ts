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

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'fd-e2e-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const window = await app.firstWindow();
  return { app, window };
}

async function resize(window: Page, width: number, height: number): Promise<void> {
  await window.setViewportSize({ width, height });
}

test.describe('responsive dashboard', () => {
  test('renders without horizontal overflow at 1024 width', async () => {
    const { app, window } = await launchApp();
    try {
      await resize(window, 1024, 800);
      await expect(window.getByRole('heading', { name: /tableau de bord/i })).toBeVisible();
      const overflow = await window.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const sidebar = window.getByRole('complementary', { name: /barre latérale/i });
      await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    } finally {
      await app.close();
    }
  });

  test('expands sidebar and shows breadcrumb at 1440 width', async () => {
    const { app, window } = await launchApp();
    try {
      await resize(window, 1440, 900);
      const sidebar = window.getByRole('complementary', { name: /barre latérale/i });
      await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
      await expect(window.getByText('Tableau de bord').first()).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('main area scrolls vertically at short heights without clipping the table', async () => {
    const { app, window } = await launchApp();
    try {
      await resize(window, 1280, 700);
      await expect(window.getByText('Dernières transactions')).toBeVisible();
      await window.getByText('Dernières transactions').scrollIntoViewIfNeeded();
      // Fresh DB → the transactions card shows its empty state, reachable after scroll.
      await expect(window.getByText(/Aucune transaction/i)).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
