#!/usr/bin/env node
// Records a captioned video tour of the public demo store ("Juniper Lane
// Studio", see src/lib/demo.ts) on production: one click in from the
// sign-in screen, then inventory, search, a cart with a deal applied,
// reports and their charts, saved reports, deals and the color themes. The
// demo is read-only, so this only looks around — nothing it does is saved.
//
// Same pacing idea as record-vendor-demo.js (slow, captioned, with a fake
// cursor dot), with one difference: the caption gets its own strip BELOW
// the app instead of floating over the bottom of it, so it can never cover
// a button, a total or the last row of a list. See reserveCaptionStrip().
//
// Usage: node scripts/record-demo-tour.js [--narrate]
//
// --narrate also reads each caption aloud and writes a second file,
// videos/demo-tour-narrated.mp4. The voice is Windows' built-in
// text-to-speech (see NARRATION_VOICE), so it only works on Windows and
// sounds synthetic; each caption stays up until its line has been spoken.
// Output: videos/demo-tour.webm (raw), plus videos/demo-tour.mp4 with the
// blank loading seconds trimmed off the front, if ffmpeg is on the PATH.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const URL = 'https://vendor-checkout-app.expo.app';
const WIDTH = 1280;
const APP_HEIGHT = 720;
const CAPTION_HEIGHT = 80;

function log(msg) {
  console.log(`[record-demo-tour] ${msg}`);
}

// Shrinks the app to the top APP_HEIGHT pixels of the window and puts the
// caption in the strip left underneath. Two details make that airtight:
// - `transform` on <body> makes it the containing block for everything
//   inside it that is `position: fixed` (the app's alerts and modals are
//   portalled into <body>), so those are confined to the app area too
//   rather than stretching over the whole window.
// - the caption and cursor are attached to <html>, outside <body>, so that
//   confinement doesn't apply to them.
async function reserveCaptionStrip(page) {
  await page.evaluate(
    ({ captionHeight }) => {
      const style = document.createElement('style');
      style.textContent = `
        html { background: #111 !important; }
        body {
          height: calc(100vh - ${captionHeight}px) !important;
          min-height: 0 !important;
          transform: translate(0);
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(style);

      const caption = document.createElement('div');
      caption.id = '__demoCaption';
      Object.assign(caption.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        height: `${captionHeight}px`,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        color: '#fff',
        font: '600 22px/1.3 -apple-system, "Segoe UI", Roboto, sans-serif',
        padding: '0 28px',
        zIndex: 2147483647,
        textAlign: 'center',
        pointerEvents: 'none',
      });
      document.documentElement.appendChild(caption);

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
      document.documentElement.appendChild(cursor);

      window.__setCaption = (text) => {
        caption.textContent = text;
      };
      window.__moveCursor = (x, y) => {
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
      };
      window.__pulseCursor = () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1.7)';
        setTimeout(() => {
          cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 250);
      };
    },
    { captionHeight: CAPTION_HEIGHT }
  );
}

// The check that the strip really is the caption's alone: sample points
// across it and ask the browser what app element, if any, is painted
// there. The caption and cursor ignore pointer events, so they are skipped
// and anything else that turns up is the app poking into the strip.
let overlaps = 0;
async function assertStripIsClear(page, where) {
  const intruders = await page.evaluate(
    ({ captionHeight }) => {
      const found = [];
      for (const y of [window.innerHeight - captionHeight + 2, window.innerHeight - captionHeight / 2, window.innerHeight - 2]) {
        for (let x = 10; x < window.innerWidth; x += 90) {
          const el = document.elementFromPoint(x, y);
          if (el && el !== document.documentElement) found.push(`${el.tagName} "${(el.textContent || '').slice(0, 30)}"`);
        }
      }
      return [...new Set(found)];
    },
    { captionHeight: CAPTION_HEIGHT }
  );
  if (intruders.length) {
    overlaps += 1;
    log(`OVERLAP at "${where}": ${intruders.join(', ')}`);
  }
}

// ---- narration (only with --narrate) ----
const NARRATE = process.argv.includes('--narrate');
const NARRATION_VOICE = 'Microsoft Zira Desktop';
const NARRATION_DIR = path.join(__dirname, '..', 'videos', 'narration');
const narration = { startedAt: 0, clips: [], busyUntil: 0 };

// What to say when the caption wouldn't be read the way it's written.
function spokenForm(text) {
  return text
    .replace(/(\d+)x(\d+)/g, '$1 by $2')
    .replace('vendor-checkout-app.expo.app', 'vendor checkout app, dot expo, dot app')
    .replace(/SKU/g, 'S K U')
    .replace(/["]/g, '');
}

// One .wav per distinct caption, reused between takes.
function narrationClip(text) {
  fs.mkdirSync(NARRATION_DIR, { recursive: true });
  const name = crypto.createHash('sha1').update(NARRATION_VOICE + spokenForm(text)).digest('hex').slice(0, 12);
  const wav = path.join(NARRATION_DIR, `${name}.wav`);
  if (!fs.existsSync(wav)) {
    const txt = path.join(NARRATION_DIR, `${name}.txt`);
    fs.writeFileSync(txt, spokenForm(text), 'utf8');
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
          '$s.SelectVoice($env:NARRATION_VOICE); $s.SetOutputToWaveFile($env:NARRATION_OUT); ' +
          '$s.Speak([IO.File]::ReadAllText($env:NARRATION_IN)); $s.Dispose()',
      ],
      { env: { ...process.env, NARRATION_VOICE, NARRATION_OUT: wav, NARRATION_IN: txt } }
    );
  }
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' })
  );
  return { wav, seconds };
}

// When the first caption went up: everything before it is trimmed off.
let firstCaptionAt = null;

async function setCaption(page, text, pause = 1600) {
  let clip = null;
  if (NARRATE && text) {
    clip = narrationClip(text);
    // Never talk over the previous line.
    const wait = narration.busyUntil - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  if (firstCaptionAt === null) firstCaptionAt = Date.now();
  await page.evaluate((t) => window.__setCaption(t), text);
  if (clip) {
    narration.clips.push({ wav: clip.wav, at: (Date.now() - narration.startedAt) / 1000 });
    narration.busyUntil = Date.now() + clip.seconds * 1000 + 350;
  }
  await assertStripIsClear(page, text);
  if (pause) await page.waitForTimeout(pause);
}

async function clickStep(page, locator, caption, opts = {}) {
  if (caption) await setCaption(page, caption, opts.pauseBefore ?? 1500);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await page.evaluate(([px, py]) => window.__moveCursor(px, py), [box.x + box.width / 2, box.y + box.height / 2]);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__pulseCursor());
  }
  await locator.click();
  await page.waitForTimeout(opts.pauseAfter ?? 1400);
  await assertStripIsClear(page, `after ${caption || 'click'}`);
}

async function typeStep(page, locator, text, caption) {
  if (caption) await setCaption(page, caption, 1400);
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await page.evaluate(([px, py]) => window.__moveCursor(px, py), [box.x + box.width / 2, box.y + box.height / 2]);
    await page.waitForTimeout(400);
  }
  await locator.click();
  await locator.pressSequentially(text, { delay: 85 });
  await page.waitForTimeout(1100);
}

// A slow scroll a viewer can follow, with the pointer parked mid-list.
async function scrollBy(page, total, steps = 24) {
  await page.mouse.move(WIDTH / 2, APP_HEIGHT / 2);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, total / steps);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(700);
  await assertStripIsClear(page, 'after scrolling');
}

async function openMenu(page, item, caption, opts) {
  await clickStep(page, page.getByText(/▾/).first(), caption, { pauseAfter: 700 });
  await clickStep(page, page.getByText(item, { exact: !(item instanceof RegExp) || undefined }).last(), null, opts);
}

async function main() {
  const outDir = path.join(__dirname, '..', 'videos');
  const browser = await chromium.launch();
  const size = { width: WIDTH, height: APP_HEIGHT + CAPTION_HEIGHT };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: outDir, size } });
  const page = await context.newPage();
  const recordingStarted = Date.now();
  narration.startedAt = recordingStarted;

  log('Loading the app...');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await reserveCaptionStrip(page);
  await setCaption(page, 'Vendor Checkout: inventory, checkout and sales reports for art fair vendors.', 3000);
  // Everything before the first caption is a blank page loading, which
  // would otherwise be the video's opening seconds and its thumbnail.
  const leadSeconds = ((firstCaptionAt - recordingStarted) / 1000).toFixed(2);

  await clickStep(page, page.getByText('Explore the demo store', { exact: true }), 'No sign-up needed. One click opens a sample art booth.', {
    pauseBefore: 2200,
    pauseAfter: 600,
  });
  const search = page.getByPlaceholder('Search by title, SKU, size…');
  await search.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2200);
  log('In the demo store.');

  await setCaption(page, 'Inventory: originals, prints in three sizes, stickers, postcards and pins.', 2800);
  await setCaption(page, 'Every piece shows its price, how many are left, and a low-stock warning.', 1200);
  await scrollBy(page, 900);
  await page.waitForTimeout(900);
  await scrollBy(page, -900, 12);

  await typeStep(page, search, 'lake 8x10', 'Search matches any words in any order: title, SKU, size, series.');
  await page.waitForTimeout(1500);
  await clickStep(page, page.getByText('✕', { exact: true }), null, { pauseAfter: 500 });

  await typeStep(page, search, '5x7', 'Ringing up a sale: three 5x7 prints go into the cart.');
  for (let i = 0; i < 3; i++) {
    await clickStep(page, page.getByText('Add', { exact: true }).nth(i + 1), null, { pauseAfter: 700 });
  }
  await openMenu(page, /^Cart/, 'The "3 for $40" deal applies itself. No mental math at the booth.', { pauseAfter: 3800 });
  log('Cart shown.');

  await openMenu(page, 'Reports', 'Reports: every sale, with fees, tips and net totals.', { pauseAfter: 2400 });
  await setCaption(page, 'Charts compare art fairs, item types, payment methods and best sellers.', 600);
  await scrollBy(page, 620);
  await page.waitForTimeout(1800);
  await scrollBy(page, 520);
  await page.waitForTimeout(1800);
  await scrollBy(page, -1140, 14);
  await clickStep(page, page.getByText('Lakeside Art Fair', { exact: false }).first(), 'Filter to one art fair to see how that weekend really went.', {
    pauseAfter: 1600,
  });
  await scrollBy(page, 520);
  await page.waitForTimeout(1600);
  await scrollBy(page, -520, 10);
  await clickStep(page, page.getByText('Saved Reports', { exact: true }), "Save a fair's final numbers with notes, to compare next year.", {
    pauseAfter: 2800,
  });
  log('Reports shown.');

  await openMenu(page, 'Deals', 'Deals: bundles, buy-some-get-one and percent-off, by type or print size.', { pauseAfter: 3000 });

  // Themes. Tapping one only previews it in this recording's own browser;
  // the demo store itself is read-only and stays as it was.
  await openMenu(page, 'Settings', 'Make it yours: every store can pick its own color theme.', { pauseAfter: 1200 });
  await page.getByText('Theme', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await assertStripIsClear(page, 'theme picker');
  await clickStep(page, page.getByText('Emerald', { exact: true }), 'The themes come from my own design system.', { pauseAfter: 1500 });
  await clickStep(page, page.getByText('Navy', { exact: true }), null, { pauseAfter: 1500 });
  await clickStep(page, page.getByText('Terracotta', { exact: true }), null, { pauseAfter: 1700 });
  await openMenu(page, 'Inventory', 'One tap, and the whole app changes with it.', { pauseAfter: 3200 });
  log('Themes shown.');

  await setCaption(page, 'Try it yourself: vendor-checkout-app.expo.app, then "Explore the demo store".', 4500);

  // Let the last line finish before the recording stops.
  if (NARRATE) await page.waitForTimeout(Math.max(0, narration.busyUntil - Date.now()));

  const video = page.video();
  await context.close();
  await browser.close();

  const webm = path.join(outDir, 'demo-tour.webm');
  fs.rmSync(webm, { force: true });
  fs.renameSync(await video.path(), webm);
  log(`Saved ${webm}`);
  try {
    const mp4 = path.join(outDir, 'demo-tour.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', leadSeconds, '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
    log(`Saved ${mp4}`);
    if (NARRATE && narration.clips.length) {
      // Each clip is delayed to the moment its caption appeared (measured
      // from the same trimmed start as the picture), then all are mixed.
      const narrated = path.join(outDir, 'demo-tour-narrated.mp4');
      const inputs = narration.clips.flatMap((c) => ['-i', c.wav]);
      const delayed = narration.clips.map((c, i) => {
        const ms = Math.max(0, Math.round((c.at - Number(leadSeconds)) * 1000));
        return `[${i + 1}:a]adelay=${ms}:all=1[a${i}]`;
      });
      const mix = `${narration.clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${narration.clips.length}:normalize=0[narration]`;
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-i', mp4, ...inputs,
        '-filter_complex', [...delayed, mix].join(';'),
        '-map', '0:v', '-map', '[narration]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', narrated,
      ]);
      log(`Saved ${narrated} (${narration.clips.length} spoken lines)`);
    }
  } catch (err) {
    log(`ffmpeg not found (or it failed), so the .mp4 output is missing or incomplete: ${err.message || err}`);
  }

  if (overlaps) {
    log(`FAILED: the app reached into the caption strip ${overlaps} time(s). See OVERLAP lines above.`);
    process.exit(1);
  }
  log('Caption strip stayed clear of the app at every step.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
