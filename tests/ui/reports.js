// Checks the Reports tab row on a phone-width screen: nothing spills off
// the side and "Manage Events" can be reached. Read-only, as the test vendor.
const { chromium } = require('playwright');
const { start, signInToInventory } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('reports');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  await signInToInventory(page, url);
  await page.getByText(/▾/).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Reports', { exact: true }).last().click();
  await page.waitForTimeout(2000);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check('no sideways overflow', overflow <= 1, `${overflow}px`);
  const box = await page.getByText('Manage Events', { exact: true }).boundingBox();
  check('"Manage Events" is fully on screen', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await page.screenshot({ path: shotPath('reports-phone.png') });
  const tapped = await page.getByText('Manage Events', { exact: true }).click({ timeout: 5000 }).then(() => true, () => false);
  check('"Manage Events" can be tapped', tapped);
  await browser.close();
  finish();
})().catch(crash);
