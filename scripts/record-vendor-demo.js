#!/usr/bin/env node
// Records a .webm video of the vendor-side flow (add inventory, print a
// label, ring up a cash sale) against a dedicated "Twin Maples Studio" demo
// store on production — created solely for this recording, isolated from
// any real vendor's data. Signs in (the account + store already exist from
// setup) rather than signing up fresh each run, so re-running this is safe.
//
// Usage: node scripts/record-vendor-demo.js
const { chromium } = require('playwright');
const path = require('path');

const EMAIL = 'demo.vendor.mfp+beta1@gmail.com';
const PASSWORD = 'DemoVendor2026!';
const PIN = '4321';
const PIECE_TITLE = 'Twilight Falls';
const PIECE_PRICE = '225';

function log(msg) {
  console.log(`[record-vendor-demo] ${msg}`);
}

async function main() {
  const outDir = path.join(__dirname, '..', 'videos');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  log('Loading app...');
  await page.goto('https://vendor-checkout-app.expo.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Sign in to the existing demo store.
  const isSignUpMode = await page.getByText('Already have an account? Sign in').isVisible().catch(() => false);
  if (isSignUpMode) {
    await page.getByText('Already have an account? Sign in').click();
    await page.waitForTimeout(400);
  }
  await page.getByPlaceholder('Email').fill(EMAIL);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForTimeout(2500);
  log('Signed in.');

  // Into the admin view.
  await page.getByText('Staff Access', { exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder('Enter PIN').fill(PIN);
  await page.getByText('Unlock', { exact: true }).click();
  await page.waitForTimeout(1500);
  log('In admin — Inventory.');

  // Make sure the cart's clean (the cart is shared/persisted server-side
  // per store, so a leftover item from a prior run of this script would
  // otherwise show up here too) and Cash is enabled, before recording the
  // actual demo flow.
  await page.getByText('Twin Maples Studio ▾', { exact: false }).click();
  await page.waitForTimeout(500);
  await page.getByText(/^Cart/).click();
  await page.waitForTimeout(1000);
  const hasClearCart = await page.getByText('Clear cart', { exact: true }).isVisible().catch(() => false);
  if (hasClearCart) {
    await page.getByText('Clear cart', { exact: true }).click();
    await page.waitForTimeout(800);
    log('Cleared leftover cart.');
  }

  await page.getByText(/^Twin Maples Studio ▾|^Cart ▾/).click();
  await page.waitForTimeout(500);
  await page.getByText('Settings', { exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByText('Payment Methods →', { exact: true }).click();
  await page.waitForTimeout(800);
  const cashSelected = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div'));
    const el = els.find((e) => e.textContent.trim() === 'Cash' && e.children.length === 0);
    if (!el) return null;
    // Selected chips use a dark background — walk up to the chip container.
    const chip = el.closest('[tabindex]');
    return chip ? getComputedStyle(chip).backgroundColor : null;
  });
  log(`Cash chip background: ${cashSelected}`);
  if (cashSelected !== 'rgb(26, 26, 26)') {
    await page.getByText('Cash', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByText('Save changes', { exact: true }).click();
    await page.waitForTimeout(1000);
    const okVisible = await page.getByText('OK', { exact: true }).isVisible().catch(() => false);
    if (okVisible) await page.getByText('OK', { exact: true }).click();
    log('Enabled Cash payment method.');
  } else {
    log('Cash already enabled.');
  }
  await page.getByText('← Back to Settings', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('‹ Back', { exact: true }).click();
  await page.waitForTimeout(800);
  log('Back at Inventory.');

  // Add a new piece.
  await page.getByText('+ Add Piece', { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('e.g. Loon at Dawn').fill(PIECE_TITLE);
  await page.locator('input[inputmode="decimal"]').first().fill(PIECE_PRICE);
  await page.waitForTimeout(600); // let the recording linger on the filled-in form
  await page.getByText('Save', { exact: true }).click();
  await page.waitForTimeout(1500);
  log(`Added piece "${PIECE_TITLE}".`);

  // Print a label for the piece just added (last row in the list).
  await page.getByText('Print label', { exact: true }).last().click();
  await page.waitForTimeout(1200);
  await page.getByText(/^Print \d+ Labels?$/).click();
  await page.waitForTimeout(2500); // window.print() + afterprint round trip
  log('Printed label.');

  // Add it to the cart from the same row.
  await page.getByText('Add', { exact: true }).last().click();
  await page.waitForTimeout(1200);
  log('Added to cart.');

  // Head to Cart via the header menu.
  await page.getByText('Twin Maples Studio ▾', { exact: false }).click();
  await page.waitForTimeout(500);
  await page.getByText(/^Cart/).click();
  await page.waitForTimeout(1200);
  log('On Cart screen.');

  // Checkout with cash.
  await page.getByText('Checkout', { exact: true }).click();
  await page.waitForTimeout(1200);
  console.log(await page.evaluate(() => document.body.innerText));
  await page.getByText('Confirm & Continue', { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByText('No tip', { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByText('Cash', { exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByText('Confirm Paid', { exact: true }).click();
  await page.waitForTimeout(2500);
  log('Sale recorded.');

  await page.waitForTimeout(2000); // linger on the confirmation

  await context.close();
  await browser.close();
  log(`Recording saved under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
