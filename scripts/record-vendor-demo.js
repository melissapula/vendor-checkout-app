#!/usr/bin/env node
// Records a .webm video of the vendor-side flow (add inventory, print a
// label, ring up a cash sale) against a dedicated "Twin Maples Studio" demo
// store on production — created solely for this recording, isolated from
// any real vendor's data. Signs in (the account + store already exist from
// setup) rather than signing up fresh each run, so re-running this is safe.
//
// Paced deliberately slowly for an audience watching a marketing clip, not
// a developer debugging: a caption bar describes each step in plain
// language, and an injected on-page cursor dot shows where each click
// lands (Playwright drives clicks over CDP with no real OS cursor, so
// without this a viewer has no visual cue where an action happened).
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

// Injects a fixed caption bar + a fake cursor dot as real DOM elements, so
// they get captured by Playwright's video recording like any other page
// content. Survives for the life of the page since this app never does a
// full navigation after initial load.
async function injectOverlay(page) {
  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = '__demoCaption';
    Object.assign(caption.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(17,17,17,0.94)',
      color: '#fff',
      font: '600 22px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif',
      padding: '16px 28px',
      zIndex: 2147483647,
      textAlign: 'center',
      minHeight: '32px',
      pointerEvents: 'none',
    });
    document.body.appendChild(caption);

    const cursor = document.createElement('div');
    cursor.id = '__demoCursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      width: '26px',
      height: '26px',
      borderRadius: '50%',
      background: 'rgba(255,87,34,0.5)',
      border: '3px solid rgba(255,87,34,0.95)',
      zIndex: 2147483647,
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%) scale(1)',
      transition: 'left 0.5s ease, top 0.5s ease, transform 0.15s ease',
      left: '-100px',
      top: '-100px',
      boxShadow: '0 0 0 4px rgba(255,87,34,0.15)',
    });
    document.body.appendChild(cursor);

    window.__setCaption = (text) => {
      const el = document.getElementById('__demoCaption');
      if (el) el.textContent = text;
    };
    window.__moveCursor = (x, y) => {
      const el = document.getElementById('__demoCursor');
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    };
    window.__pulseCursor = () => {
      const el = document.getElementById('__demoCursor');
      if (!el) return;
      el.style.transform = 'translate(-50%, -50%) scale(1.7)';
      setTimeout(() => {
        el.style.transform = 'translate(-50%, -50%) scale(1)';
      }, 250);
    };
  });
}

async function setCaption(page, text, pause = 1600) {
  await page.evaluate((t) => window.__setCaption && window.__setCaption(t), text);
  if (pause) await page.waitForTimeout(pause);
}

// Moves the fake cursor to the element, pulses it, then clicks — with
// pauses on either side so the action reads clearly at video speed.
async function clickStep(page, locator, caption, opts = {}) {
  if (caption) await setCaption(page, caption, opts.pauseBefore ?? 1500);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(([px, py]) => window.__moveCursor && window.__moveCursor(px, py), [x, y]);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__pulseCursor && window.__pulseCursor());
  }
  await locator.click();
  await page.waitForTimeout(opts.pauseAfter ?? 1400);
}

// Types character-by-character (visible in the recording) instead of
// Playwright's instant fill(), so the recording reads as someone actually
// typing rather than text just appearing.
async function typeStep(page, locator, text, caption) {
  if (caption) await setCaption(page, caption, 1400);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await page.evaluate(
      ([px, py]) => window.__moveCursor && window.__moveCursor(px, py),
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    await page.waitForTimeout(400);
  }
  await locator.click();
  await locator.pressSequentially(text, { delay: 85 });
  await page.waitForTimeout(900);
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
  await page.waitForTimeout(1500);
  await injectOverlay(page);
  await setCaption(page, "This is Chrissy's Studio Checkout — a quick look at the vendor side.", 2500);

  // Sign in to the existing demo store.
  const isSignUpMode = await page.getByText('Already have an account? Sign in').isVisible().catch(() => false);
  if (isSignUpMode) {
    await clickStep(page, page.getByText('Already have an account? Sign in'), 'Signing in to the demo store...');
  }
  await typeStep(page, page.getByPlaceholder('Email'), EMAIL, 'Signing in to the demo store...');
  await typeStep(page, page.getByPlaceholder('Password', { exact: true }), PASSWORD);
  await clickStep(page, page.getByText('Sign in', { exact: true }), null, { pauseAfter: 2200 });
  log('Signed in.');

  // Into the admin view.
  await clickStep(page, page.getByText('Staff Access', { exact: true }), 'Unlocking staff access with the store PIN...');
  await typeStep(page, page.getByPlaceholder('Enter PIN'), PIN);
  await clickStep(page, page.getByText('Unlock', { exact: true }), null, { pauseAfter: 2000 });
  log('In admin — Inventory.');
  await setCaption(page, '', 300); // clear the stale caption during this off-camera setup detour

  // Make sure the cart's clean (the cart is shared/persisted server-side
  // per store, so a leftover item from a prior run of this script would
  // otherwise show up here too) and Cash is enabled, before the captioned
  // demo flow starts for real.
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
    const chip = el.closest('[tabindex]');
    return chip ? getComputedStyle(chip).backgroundColor : null;
  });
  if (cashSelected !== 'rgb(26, 26, 26)') {
    await clickStep(page, page.getByText('Cash', { exact: true }), 'Turning on Cash as a payment method...');
    await clickStep(page, page.getByText('Save changes', { exact: true }), null, { pauseAfter: 1600 });
    const okVisible = await page.getByText('OK', { exact: true }).isVisible().catch(() => false);
    if (okVisible) await page.getByText('OK', { exact: true }).click();
    log('Enabled Cash payment method.');
  } else {
    log('Cash already enabled — skipping.');
  }
  await page.getByText('← Back to Settings', { exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByText('‹ Back', { exact: true }).click();
  await page.waitForTimeout(800);
  log('Back at Inventory.');

  // Add a new piece.
  await clickStep(page, page.getByText('+ Add Piece', { exact: true }), 'Adding a new piece of inventory...', {
    pauseAfter: 1800,
  });
  await typeStep(page, page.getByPlaceholder('e.g. Loon at Dawn'), PIECE_TITLE, 'Giving it a title...');
  await typeStep(page, page.locator('input[inputmode="decimal"]').first(), PIECE_PRICE, 'And a price...');
  await clickStep(page, page.getByText('Save', { exact: true }), 'Saving it to inventory...', { pauseAfter: 2000 });
  log(`Added piece "${PIECE_TITLE}".`);

  // Print a label for the piece just added (last row in the list).
  await clickStep(
    page,
    page.getByText('Print label', { exact: true }).last(),
    'Printing a barcode label for it...',
    { pauseAfter: 1800 }
  );
  await clickStep(page, page.getByText(/^Print \d+ Labels?$/), null, { pauseAfter: 3000 });
  log('Printed label.');

  // Add it to the cart from the same row.
  await clickStep(page, page.getByText('Add', { exact: true }).last(), 'Adding it to the cart to sell...', {
    pauseAfter: 1800,
  });
  log('Added to cart.');

  // Head to Cart via the header menu.
  await clickStep(page, page.getByText('Twin Maples Studio ▾', { exact: false }), 'Heading to the cart...', {
    pauseAfter: 700,
  });
  await clickStep(page, page.getByText(/^Cart/), null, { pauseAfter: 1800 });
  log('On Cart screen.');

  // Checkout with cash.
  await clickStep(page, page.getByText('Checkout', { exact: true }), 'Ringing up the sale...', { pauseAfter: 1800 });
  await clickStep(page, page.getByText('Confirm & Continue', { exact: true }), 'Reviewing the order...', {
    pauseAfter: 1600,
  });
  await clickStep(page, page.getByText('No tip', { exact: true }), 'Skipping the tip...', { pauseAfter: 1600 });
  await clickStep(page, page.getByText('Cash', { exact: true }), 'Paying with cash...', { pauseAfter: 1800 });
  await clickStep(page, page.getByText('Confirm Paid', { exact: true }), 'Confirming payment received...', {
    pauseAfter: 2600,
  });
  log('Sale recorded.');

  await setCaption(page, "Sale recorded — inventory and reports update automatically.", 3500);

  await context.close();
  await browser.close();
  log(`Recording saved under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
