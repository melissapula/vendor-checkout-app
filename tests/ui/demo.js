// Walks the demo store the way a visitor from LinkedIn would: one click on
// the sign-in screen, then every page. Read-only apart from a cart add that
// it removes again.
const { chromium } = require('playwright');
const { start } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('demo');
const writes = [];

async function run(viewport, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  let where = 'load';
  page.on('pageerror', (e) => problems.push(`[${label}/${where}] pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${label}/${where}] console.error: ${m.text().slice(0, 200)}`));
  // Any change to the database that actually leaves the browser. The demo
  // is read-only, so there must be none.
  page.on('request', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && /\/rest\/v1\/|\/auth\/v1\/user/.test(r.url())) {
      writes.push(`[${label}/${where}] ${r.method()} ${r.url().slice(0, 110)}`);
    }
  });
  page.on('response', (r) => r.status() >= 400 && problems.push(`[${label}/${where}] HTTP ${r.status()}: ${r.url().slice(0, 130)}`));
  const shot = async (name) => {
    await page.screenshot({ path: shotPath(`${label}-${name}.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`[${label}] ${name}: no sideways overflow`, overflow <= 1, `${overflow}px`);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const menu = async (item) => {
    await page.getByText(/▾/).first().click();
    await page.waitForTimeout(500);
    await page.getByText(item, { exact: !(item instanceof RegExp) || undefined }).last().click();
    await page.waitForTimeout(1800);
  };

  await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  const btn = page.getByText('Explore the demo store', { exact: true });
  check(`[${label}] sign-in screen offers the demo`, await btn.isVisible());
  const box = await btn.boundingBox();
  check(`[${label}] demo button is on screen without scrolling`, !!box && box.y + box.height <= viewport.height, box && Math.round(box.y + box.height));
  check(`[${label}] credentials are shown`, (await text()).includes('demo@example.com') && (await text()).includes('artfairdemo'));
  await shot('01-signin');

  where = 'demo-signin';
  await btn.click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  where = 'inventory';
  check(`[${label}] one click lands on Inventory (no PIN, no customer screen)`, true);
  const t1 = await text();
  check(`[${label}] demo banner shows`, t1.includes('Demo store'));
  check(`[${label}] store name shows`, t1.includes('Juniper Lane Studio'));
  check(`[${label}] inventory lists pieces`, (await page.getByText('Edit', { exact: true }).count()) === 26, await page.getByText('Edit', { exact: true }).count());
  check(`[${label}] low-stock badge shows`, t1.includes('Low stock'));
  check(`[${label}] sold, reserved and out-of-stock states show`, t1.includes('Sold') && t1.includes('Reserved') && t1.includes('Out of stock'));
  const imgs = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('img')).filter((i) => i.src.includes('/demo/'));
    return { total: list.length, loaded: list.filter((i) => i.complete && i.naturalWidth > 0).length };
  });
  check(`[${label}] thumbnails load`, imgs.total > 0 && imgs.loaded === imgs.total, `${imgs.loaded} of ${imgs.total}`);
  await shot('02-inventory');

  await page.getByPlaceholder('Search by title, SKU, size…').fill('lake 8x10');
  await page.waitForTimeout(600);
  check(`[${label}] search "lake 8x10" finds one piece`, (await page.getByText('Edit', { exact: true }).count()) === 1);
  await page.getByText('✕', { exact: true }).click();
  await page.waitForTimeout(400);

  where = 'read-only';
  check(`[${label}] no read-only message just from looking around`, !(await text()).includes('The demo is read-only'));
  await page.getByText('Edit', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Save', { exact: true }).click();
  await page.waitForTimeout(900);
  check(`[${label}] saving a piece is refused with the read-only message`, (await text()).includes('The demo is read-only'));
  const alerts = await page.getByText('OK', { exact: true }).count();
  check(`[${label}] exactly one message is showing`, alerts === 1, alerts);
  await shot('02b-read-only');
  await page.getByText('OK', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('Cancel', { exact: true }).click();
  await page.waitForTimeout(800);

  where = 'reports';
  await menu('Reports');
  const t2 = await text();
  const sold = Number((t2.match(/Items sold\s*(\d+)/) || [])[1]);
  check(`[${label}] Reports opens on All time with sales`, sold > 50 && !t2.includes('No sales match'), `items sold ${sold}`);
  check(`[${label}] the three fairs are offered as filters`, ['Riverbend Arts Festival', 'Maple Street Makers Market', 'Lakeside Art Fair'].every((n) => t2.includes(n)));
  await shot('03-reports');
  await page.getByText('Lakeside Art Fair', { exact: false }).first().click();
  await page.waitForTimeout(800);
  const t3 = await text();
  const fairSold = Number((t3.match(/Items sold\s*(\d+)/) || [])[1]);
  check(`[${label}] filtering to one fair narrows the report`, fairSold > 0 && fairSold < sold, `${fairSold} of ${sold}`);
  await shot('04-reports-one-fair');
  await page.getByText('Losses & Donations', { exact: true }).click();
  await page.waitForTimeout(1000);
  check(`[${label}] losses and donations are listed`, (await text()).includes('school art auction'));
  await page.getByText('Saved Reports', { exact: true }).click();
  await page.waitForTimeout(1000);
  check(`[${label}] saved reports are listed`, (await text()).includes('final numbers'));
  await shot('05-saved-reports');

  where = 'deals';
  await menu('Deals');
  check(`[${label}] deals are listed`, (await text()).includes('3 for $40'));
  await shot('06-deals');

  where = 'settings';
  await menu('Settings');
  await page.getByText('Payment Methods →', { exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByText('Connect with Stripe', { exact: true }).click();
  await page.waitForTimeout(800);
  check(`[${label}] Stripe connect is blocked in the demo`, (await text()).includes('Not available in the demo'));
  await page.getByText('OK', { exact: true }).click();
  await page.waitForTimeout(300);

  where = 'cart';
  await menu('Inventory');
  await page.getByText('Add', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await menu(/^Cart/);
  check(`[${label}] an added piece appears in the cart`, (await text()).includes('Morning on the Ridge'));
  await shot('07-cart');
  check(`[${label}] adding to the cart shows no read-only message`, !(await text()).includes('The demo is read-only'));
  // The demo cart lives only in this browser tab, so a reload empties it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await menu(/^Cart/);
  check(`[${label}] the cart was never saved to the shared store`, (await text()).includes('Cart is empty'));

  where = 'exit';
  await page.getByText('Exit demo', { exact: true }).click();
  await page.waitForTimeout(1500);
  check(`[${label}] "Exit demo" returns to the sign-in screen`, await page.getByText('Explore the demo store', { exact: true }).isVisible());
  await browser.close();
}

(async () => {
  await run({ width: 1280, height: 800 }, 'desktop');
  await run({ width: 390, height: 844 }, 'phone');
  await run({ width: 375, height: 667 }, 'smallphone');
  check('no change to the database left the browser', writes.length === 0, writes.length ? writes.join(' | ') : 0);
  finish();
})().catch(crash);
