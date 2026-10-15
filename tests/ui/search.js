// Read-only browser check of the Inventory search bar, as the test vendor
// (Twin Maples Studio). Never saves, adds to cart, or prints.
const { chromium } = require('playwright');
const { start, signInToInventory } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('search');

async function rowCount(page) {
  return page.getByText('Edit', { exact: true }).count();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));

  await signInToInventory(page, url);
  const searchBox = page.getByPlaceholder('Search by title, SKU, size…');
  await page.waitForTimeout(2000);
  check('search box is visible on Inventory', await searchBox.isVisible());

  const total = await rowCount(page);
  console.log(`total rows: ${total}`);
  await page.screenshot({ path: shotPath('1-unfiltered.png') });

  // Pull each row's title + meta line ("SKU · medium") out of the page so
  // the test adapts to whatever the store currently holds.
  const rows = await page.evaluate(() => {
    const edits = Array.from(document.querySelectorAll('div')).filter(
      (d) => d.children.length === 0 && d.textContent.trim() === 'Edit'
    );
    return edits.map((e) => {
      let row = e;
      for (let i = 0; i < 6 && row.parentElement; i++) {
        row = row.parentElement;
        if (row.innerText.includes(' · ')) break;
      }
      const lines = row.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      const meta = lines.find((l) => l.includes(' · ')) || '';
      return { title: lines[0], sku: meta.split(' · ')[0] };
    });
  });
  console.log('rows:', JSON.stringify(rows));
  check('store has at least 2 pieces to filter', total >= 2, `${total} rows`);

  const target = rows[rows.length - 1];

  // 1. SKU search narrows to exactly that piece.
  await searchBox.fill(target.sku);
  await page.waitForTimeout(500);
  let n = await rowCount(page);
  check(`SKU "${target.sku}" narrows the list`, n >= 1 && n < total, `${n} of ${total}`);
  check('the matching piece is shown', await page.getByText(target.title, { exact: true }).first().isVisible());
  await page.screenshot({ path: shotPath('2-sku-search.png') });

  // 2. Title search, upper-cased, to prove case-insensitivity.
  await searchBox.fill(target.title.toUpperCase());
  await page.waitForTimeout(500);
  n = await rowCount(page);
  check(`title in CAPS "${target.title.toUpperCase()}" still matches`, n >= 1, `${n} rows`);

  // 3. Words in reverse order + SKU mixed in: every word must match, any order.
  const words = target.title.split(/\s+/);
  const reversed = [target.sku, ...words.slice().reverse()].join(' ');
  await searchBox.fill(reversed);
  await page.waitForTimeout(500);
  n = await rowCount(page);
  check(`any-order multi-word "${reversed}" matches`, n >= 1, `${n} rows`);

  // 4. One real word + one nonsense word must match nothing (AND, not OR).
  await searchBox.fill(`${words[0]} zzqqxx`);
  await page.waitForTimeout(500);
  n = await rowCount(page);
  check('real word + nonsense word matches nothing', n === 0, `${n} rows`);
  check(
    'empty-results message names the search',
    await page.getByText(`No pieces match "${words[0]} zzqqxx".`).isVisible().catch(() => false)
  );
  await page.screenshot({ path: shotPath('3-no-match.png') });

  // 5. The clear button restores the full list.
  await page.getByText('✕', { exact: true }).click();
  await page.waitForTimeout(500);
  n = await rowCount(page);
  check('✕ clears the search and restores every row', n === total && (await searchBox.inputValue()) === '', `${n} rows`);
  check('✕ is hidden when the box is empty', (await page.getByText('✕', { exact: true }).count()) === 0);

  // 6. Edit works from a filtered result (opened, then closed without saving).
  await searchBox.fill(target.sku);
  await page.waitForTimeout(500);
  await page.getByText('Edit', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const formTitle = await page.evaluate(
    (t) => Array.from(document.querySelectorAll('input')).some((i) => i.value === t),
    target.title
  );
  check('Edit from a search result opens that piece', formTitle);
  await page.screenshot({ path: shotPath('4-edit-from-search.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const stillOpen = await page.evaluate(
    (t) => Array.from(document.querySelectorAll('input')).some((i) => i.value === t),
    target.title
  );
  if (stillOpen) {
    const closer = page.getByText(/^(Cancel|✕|Close)$/).last();
    await closer.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  check('search text survives opening and closing Edit', (await searchBox.inputValue()) === target.sku);

  // 7. Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const box = await searchBox.boundingBox();
  check('search box fits a phone screen', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await page.screenshot({ path: shotPath('5-phone.png') });

  await browser.close();
  finish();
})().catch(crash);
