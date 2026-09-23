#!/usr/bin/env node
// Records a .webm video of a scripted browser walkthrough using
// Playwright's built-in video capture (a real Chromium context, recorded
// automatically for its whole lifetime — no manual frame-by-frame
// assembly the way a GIF tool needs). No audio; browser viewport only.
//
// Usage:
//   node scripts/record-demo.js [url]
//
// Defaults to the live production app if no URL is given. This default
// walkthrough is deliberately read-only (just loads the customer view and
// scrolls) so it's safe to run against production without creating test
// data — swap in a real scripted flow here once you know what you want to
// demo.
const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const targetUrl = process.argv[2] || 'https://vendor-checkout-app.expo.app';
  const outDir = path.join(__dirname, '..', 'videos');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  console.log(`Loading ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(1000);

  // Closing the context (not just the page) is what finalizes the video
  // file to disk — Playwright writes it out here, not incrementally.
  await context.close();
  await browser.close();

  console.log(`Recording saved under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
