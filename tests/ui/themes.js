// Picks every theme in Settings and checks the app really takes on the
// design system's colors, remembers the choice, and resets on sign-out.
// Read-only, in the demo store (its theme choice is kept in this browser).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('themes');

// Expected primary + page background per theme: the design system's own
// values, read from its package rather than from the app's generated copy.
const tokensDir = path.join(__dirname, '..', '..', 'node_modules', '@mfp-design-system', 'tokens', 'build');
function themeVar(theme, name, fallback) {
  const css = fs.readFileSync(path.join(tokensDir, 'themes', `${theme}.css`), 'utf8');
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  return (m ? m[1] : fallback).toLowerCase();
}
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const EXPECTED = { Studio: { primary: '#5b3fd9', background: '#ffffff' } };
for (const t of ['blue', 'emerald', 'navy', 'orange', 'sand', 'terracotta']) {
  EXPECTED[t[0].toUpperCase() + t.slice(1)] = {
    primary: themeVar(t, 'color-brand-primary', '#000000'),
    background: themeVar(t, 'color-background-default', '#ffffff'),
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text().slice(0, 200)}`));
  const menu = async (item) => {
    await page.getByText(/▾/).first().click();
    await page.waitForTimeout(500);
    await page.getByText(item, { exact: true }).last().click();
    await page.waitForTimeout(1200);
  };
  const bgOf = (text) =>
    page.evaluate((t) => {
      let el = Array.from(document.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent === t);
      while (el && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') el = el.parentElement;
      return el ? getComputedStyle(el).backgroundColor : null;
    }, text);
  const pageBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.getByText('Explore the demo store', { exact: true }).click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await menu('Settings');
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label$=" theme"], [aria-label$=" theme, selected"]')).map((e) => e.getAttribute('aria-label'))
  );
  check('Settings offers Studio plus the six design-system themes', labels.length === 7, labels.join(' | '));
  check('Studio is selected to begin with', labels.includes('Studio theme, selected'));

  for (const [label, want] of Object.entries(EXPECTED)) {
    await page.getByText('Theme', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByText(label, { exact: true }).click();
    await page.waitForTimeout(400);
    const save = await bgOf('Save changes');
    check(`${label}: buttons take the theme's primary color`, save === rgb(want.primary), `${save} vs ${rgb(want.primary)}`);
    check(`${label}: page takes the theme's background`, (await pageBg()) === rgb(want.background), `${await pageBg()} vs ${rgb(want.background)}`);
    await page.screenshot({ path: shotPath(`${label}-settings.png`) });
    if (label === 'Terracotta') {
      await menu('Inventory');
      await page.screenshot({ path: shotPath(`${label}-inventory.png`) });
      await menu('Reports');
      await page.getByText('By event', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: shotPath(`${label}-reports.png`) });
      await menu('Settings');
    }
  }

  // Last one picked was Terracotta: it must survive a reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('the chosen theme survives a reload', (await bgOf('+ Add Piece')) === rgb(EXPECTED.Terracotta.primary), await bgOf('+ Add Piece'));

  // Signing out puts the sign-in screen back in the default colors.
  await page.getByText('Exit demo', { exact: true }).click();
  await page.waitForTimeout(1500);
  check('sign-in screen goes back to the default theme', (await bgOf('Sign in')) === rgb('#5b3fd9'), await bgOf('Sign in'));
  await page.getByText('Explore the demo store', { exact: true }).click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('signing back in restores the store\'s chosen theme', (await bgOf('+ Add Piece')) === rgb(EXPECTED.Terracotta.primary), await bgOf('+ Add Piece'));

  await browser.close();
  finish();
})().catch(crash);
