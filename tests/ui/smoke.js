// Read-only smoke test of the whole app as an ordinary vendor (the Twin
// Maples test store, not the demo). Opens every screen and form, never
// saves, sells, prints or deletes (signing in may accept an updated Terms
// screen; see waitForCustomerView in tests/lib/harness.js).
const { chromium } = require('playwright');
const { start, testVendor, waitForCustomerView } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('smoke');
const vendor = testVendor();

// Every way a form or sub-page in the app can be closed without saving.
const CLOSER = /^(Cancel|✕|Close|‹ Back|Back|Done|← Back to Settings)$/;

async function run(viewport, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  let where = 'load';
  page.on('pageerror', (e) => problems.push(`[${label}/${where}] pageerror: ${e}`));
  page.on('console', (m) => {
    // The wrong-password step's 400 is expected; the browser logs it too.
    if (where === 'bad-login' && m.text().includes('status of 400')) return;
    if (m.type() === 'error') problems.push(`[${label}/${where}] console.error: ${m.text().slice(0, 300)}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure();
    if (f && f.errorText.includes('ERR_ABORTED')) return;
    problems.push(`[${label}/${where}] request failed: ${r.url().slice(0, 120)} ${f && f.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !(where === 'bad-login' && r.url().includes('/auth/v1/token'))) {
      problems.push(`[${label}/${where}] HTTP ${r.status()}: ${r.url().slice(0, 140)}`);
    }
  });

  const shot = async (name) => {
    await page.screenshot({ path: shotPath(`${label}-${name}.png`) });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    check(`[${label}] ${name}: no sideways overflow`, overflow <= 1, `${overflow}px`);
  };
  const dialogText = async () =>
    page.evaluate(() => document.body.innerText).then((t) => t.slice(0, 4000));
  const closeDialog = async () => {
    const ok = page.getByText('OK', { exact: true });
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await page.waitForTimeout(300);
  };

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  check(`[${label}] opens on sign-in, not sign-up`, (await page.getByText('Welcome back').isVisible()) && !(await page.getByPlaceholder('Confirm password').isVisible()));
  const createLink = page.getByText("Don't have an account? Create one", { exact: true });
  const linkSize = await createLink.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const buttonSize = await page.getByText('Sign in', { exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const linkBox = await createLink.boundingBox();
  const buttonBox = await page.getByText('Sign in', { exact: true }).boundingBox();
  check(`[${label}] "create an account" is small and under the Sign in button`, linkSize < buttonSize && linkBox.y > buttonBox.y, `${linkSize}px vs ${buttonSize}px`);
  await shot('00-signin');
  await createLink.click();
  await page.waitForTimeout(400);
  check(`[${label}] sign-up screen loads`, await page.getByText('Set up your store').isVisible());
  check(`[${label}] no invite code field`, (await page.getByText(/invite/i).count()) === 0);
  await shot('01-signup');

  // Client-side validation only; nothing is sent.
  where = 'validation';
  await page.getByPlaceholder('Email').fill('someone@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('abc12345');
  await page.getByPlaceholder('Confirm password').fill('different');
  await page.getByText('Create account', { exact: true }).click();
  await page.waitForTimeout(600);
  check(`[${label}] mismatched passwords are caught`, (await dialogText()).includes("Passwords don't match"));
  await closeDialog();

  await page.getByText('Already have an account? Sign in').click();
  await page.waitForTimeout(400);
  check(`[${label}] sign-in screen shows`, await page.getByText('Welcome back').isVisible());

  // Forgot password screen opens (not submitted).
  const forgot = page.getByText(/forgot/i).first();
  if (await forgot.isVisible().catch(() => false)) {
    await forgot.click();
    await page.waitForTimeout(600);
    await shot('02-reset-password');
    const back = page.getByText(/back|cancel/i).first();
    await back.click().catch(() => {});
    await page.waitForTimeout(500);
    if (await page.getByText('Already have an account? Sign in').isVisible().catch(() => false)) {
      await page.getByText('Already have an account? Sign in').click();
    }
  } else {
    check(`[${label}] forgot-password link present`, false);
  }

  // Wrong password gives a visible error instead of nothing.
  where = 'bad-login';
  await page.getByPlaceholder('Email').fill(vendor.email);
  await page.getByPlaceholder('Password', { exact: true }).fill('definitely-wrong-password');
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForTimeout(2500);
  const badText = await dialogText();
  check(`[${label}] wrong password shows an error dialog`, badText.includes('Sign in failed'), badText.match(/Sign in failed[^\n]*\n?[^\n]*/)?.[0]);
  await closeDialog();

  where = 'login';
  await page.getByPlaceholder('Password', { exact: true }).fill(vendor.password);
  await page.getByText('Sign in', { exact: true }).click();
  await waitForCustomerView(page);
  await page.waitForTimeout(1500);
  check(`[${label}] signs in to the customer view`, true);
  check(`[${label}] browser tab title is the store name`, (await page.title()) === 'Twin Maples Studio', await page.title());
  where = 'customer';
  await shot('03-customer');

  where = 'pin';
  check(`[${label}] customer view has no loose Staff Access button`, !(await page.getByText('Staff Access', { exact: true }).isVisible()));
  await page.getByText(/▾/).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Staff Access', { exact: true }).click();
  await page.getByPlaceholder('Enter PIN').fill('0000');
  await page.getByText('Unlock', { exact: true }).click();
  await page.waitForTimeout(800);
  const stillLocked = await page.getByPlaceholder('Enter PIN').isVisible().catch(() => false);
  check(`[${label}] wrong PIN is rejected`, stillLocked);
  await closeDialog();
  await page.getByPlaceholder('Enter PIN').fill(vendor.pin);
  await page.getByText('Unlock', { exact: true }).click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  where = 'inventory';
  check(`[${label}] inventory loads with search bar`, true);
  await shot('04-inventory');

  // Open and close each inventory form without saving.
  const openClose = async (trigger, name) => {
    where = name;
    await trigger.click();
    await page.waitForTimeout(1500);
    await shot(name);
    const closer = page.getByText(CLOSER).last();
    if (await closer.isVisible().catch(() => false)) await closer.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const backHome = await page.getByPlaceholder('Search by title, SKU, size…').isVisible().catch(() => false);
    check(`[${label}] ${name}: opens and closes cleanly`, backHome);
    if (!backHome) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  };
  await openClose(page.getByText('+ Add Piece', { exact: true }), '05-add-piece-form');
  await openClose(page.getByText('Edit', { exact: true }).first(), '06-edit-piece-form');
  await openClose(page.getByText('Print Labels', { exact: true }), '07-print-labels');
  await openClose(page.getByText('Import Print Order', { exact: true }), '08-import-order');
  const logLoss = page.getByText('Log loss/donation', { exact: true }).first();
  if (await logLoss.isVisible().catch(() => false)) await openClose(logLoss, '09-log-adjustment');

  // Every admin page from the menu.
  const goto = async (menuLabel, name, expectText) => {
    where = name;
    await page.getByText(/▾/).first().click();
    await page.waitForTimeout(500);
    await page.getByText(menuLabel, { exact: menuLabel instanceof RegExp ? undefined : true }).last().click();
    await page.waitForTimeout(2000);
    const body = await dialogText();
    check(`[${label}] ${name} page renders`, expectText.test(body), body.replace(/\s+/g, ' ').slice(0, 110));
    await shot(name);
    return body;
  };
  await goto(/^Cart/, '10-cart', /cart|add item|empty/i);
  await goto('Deals', '11-deals', /deal/i);
  await goto('Reports', '12-reports', /report|sales|total/i);
  const settingsText = await goto('Settings', '13-settings', /setting|payment|pin/i);
  console.log(`[${label}] settings links: ` + (settingsText.match(/[^\n]*→/g) || []).join(' | '));

  // Each Settings sub-page that is reached by an arrow link.
  const links = (settingsText.match(/[^\n]*→/g) || []).map((s) => s.trim());
  let i = 0;
  for (const link of links) {
    i += 1;
    where = `settings:${link}`;
    const target = page.getByText(link, { exact: true }).first();
    if (!(await target.isVisible().catch(() => false))) continue;
    await target.click();
    await page.waitForTimeout(2500);
    await shot(`14-settings-${i}`);
    const closer = page.getByText(CLOSER).last();
    if (await closer.isVisible().catch(() => false)) await closer.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const back = await page.getByText(link, { exact: true }).first().isVisible().catch(() => false);
    check(`[${label}] settings "${link}" opens and closes`, back);
    if (!back) {
      await page.getByText(/▾/).first().click().catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('Settings', { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  where = 'customer-view';
  await page.getByText(/▾/).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Customer View', { exact: true }).click();
  await page.waitForTimeout(1200);
  check(`[${label}] returns to customer view`, await page.getByText('Scan with camera', { exact: true }).isVisible());

  await browser.close();
}

(async () => {
  await run({ width: 1280, height: 800 }, 'desktop');
  await run({ width: 390, height: 844 }, 'phone');
  finish();
})().catch(crash);
