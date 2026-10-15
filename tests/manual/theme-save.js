// As the test vendor: pick a theme, press "Save changes", and check the
// choice is stored on the store itself, so a fresh browser with nothing
// remembered locally still opens in it.
// WRITES: changes the Twin Maples store's theme, then puts the original back.
const { chromium } = require('playwright');
const { start, signInToInventory } = require('../lib/harness');

const { url, check, shotPath, finish, crash } = start('theme-save');

// Each browser context is a brand-new profile: nothing remembered locally.
async function openSettings(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInToInventory(page, url);
  await page.getByText(/▾/).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Settings', { exact: true }).last().click();
  await page.waitForTimeout(1200);
  return { context, page };
}
const selectedTheme = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[aria-label$=" theme, selected"]');
    return el ? el.getAttribute('aria-label').replace(' theme, selected', '') : null;
  });
async function saveTheme(page, label) {
  await page.getByText('Theme', { exact: true }).scrollIntoViewIfNeeded();
  await page.getByText(label, { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('Save changes', { exact: true }).click();
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.body.innerText);
  const ok = page.getByText('OK', { exact: true });
  if (await ok.isVisible().catch(() => false)) await ok.click();
  return text.includes('Store settings updated');
}

(async () => {
  const browser = await chromium.launch();

  const a = await openSettings(browser);
  const original = await selectedTheme(a.page);
  const target = original === 'Emerald' ? 'Blue' : 'Emerald';
  console.log(`store's theme before the test: ${original}`);
  check(`"Save changes" succeeds with ${target} picked`, await saveTheme(a.page, target));
  await a.context.close();

  const b = await openSettings(browser);
  check(`a fresh browser opens in the saved theme (${target})`, (await selectedTheme(b.page)) === target, await selectedTheme(b.page));
  await b.page.screenshot({ path: shotPath('fresh-browser.png') });
  check(`the original theme (${original}) is put back`, !!original && (await saveTheme(b.page, original)));
  await b.context.close();

  await browser.close();
  finish();
})().catch(crash);
