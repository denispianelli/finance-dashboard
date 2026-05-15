import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

test('app launches and renders dashboard', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js')] });
  const window = await app.firstWindow();
  await expect(window.locator('h1')).toContainText('Dashboard');
  await app.close();
});
