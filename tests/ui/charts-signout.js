// Checks the Reports charts against the report's own totals, and the
// "Sign out" item at the bottom of the dropdown. Read-only, in the demo store.
const { chromium } = require('playwright');
const { start } = require('../lib/harness');

const { url, check, problems, shotPath, finish, crash } = start('charts-signout');

async function run(viewport, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${label}] console.error: ${m.text().slice(0, 200)}`));
  const text = () => page.evaluate(() => document.body.innerText);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const openMenu = async () => {
    await page.getByText(/▾/).first().click();
    await page.waitForTimeout(500);
  };
  const menu = async (item) => {
    await openMenu();
    await page.getByText(item, { exact: true }).last().click();
    await page.waitForTimeout(1800);
  };
  // Every chart bar carries a label like "Sat, Oct 10: $640.00, 23 items".
  const bars = (title) =>
    page.evaluate((t) => {
      const heading = Array.from(document.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent === t);
      if (!heading) return null;
      return Array.from(heading.parentElement.querySelectorAll('[aria-label]')).map((el) => {
        const m = el.getAttribute('aria-label').match(/^(.*): \$([\d.]+), (\d+) items?$/);
        return m ? { name: m[1], value: Number(m[2]), count: Number(m[3]) } : null;
      }).filter(Boolean);
    }, title);
  const sum = (list, f) => Math.round(list.reduce((n, b) => n + b[f], 0) * 100) / 100;
  const totals = async () => {
    const t = await text();
    return { gross: Number((t.match(/Gross sales\s*\$([\d.]+)/) || [])[1]), count: Number((t.match(/Items sold\s*(\d+)/) || [])[1]) };
  };

  await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.getByText('Explore the demo store', { exact: true }).click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);

  // ---- Reports charts ----
  await menu('Reports');
  const all = await totals();
  for (const title of ['Sales by day', 'By event', 'By type', 'By payment method']) {
    const list = await bars(title);
    check(`[${label}] "${title}" chart is shown`, !!list && list.length > 0, list && list.length + ' bars');
    if (list) {
      check(`[${label}] "${title}" bars add up to gross sales`, sum(list, 'value') === all.gross, `${sum(list, 'value')} vs ${all.gross}`);
      check(`[${label}] "${title}" counts add up to items sold`, sum(list, 'count') === all.count, `${sum(list, 'count')} vs ${all.count}`);
    }
  }
  const top = await bars('Top items');
  check(`[${label}] "Top items" shows 5, biggest first`, !!top && top.length === 5 && top.every((b, i) => i === 0 || top[i - 1].value >= b.value), top && top.map((b) => b.value).join(' '));
  const days = await bars('Sales by day');
  check(`[${label}] all-time chart has the 9 selling days`, days.length === 9, days.map((d) => d.name).join(' | '));
  check(`[${label}] no sideways overflow with charts`, (await overflow()) <= 1, (await overflow()) + 'px');

  // Tapping a bar shows that bar's figures.
  const first = days[0];
  await page.getByLabel(new RegExp('^' + first.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':')).first().click();
  await page.waitForTimeout(400);
  check(`[${label}] tapping a bar shows its amount`, (await text()).includes(`${first.name}: $${first.value.toFixed(2)}`), `${first.name}: $${first.value.toFixed(2)}`);
  await page.getByText('Sales by day', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(`${label}-charts-all.png`) });

  // One two-day fair: by day, and no event comparison.
  await page.getByText('Lakeside Art Fair', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const fair = await totals();
  const fairDays = await bars('Sales by day');
  check(`[${label}] one two-day fair: 2 day bars matching its gross`, !!fairDays && fairDays.length === 2 && sum(fairDays, 'value') === fair.gross, fairDays && `${fairDays.length} bars, ${sum(fairDays, 'value')} vs ${fair.gross}`);
  check(`[${label}] one fair: "By event" is hidden`, (await bars('By event')) === null);

  // One one-day fair: by hour.
  await page.getByText('Maple Street Makers Market', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const market = await totals();
  const hours = await bars('Sales by hour');
  check(`[${label}] one-day fair switches to hours, matching its gross`, !!hours && hours.length > 1 && sum(hours, 'value') === market.gross, hours && `${hours.length} bars, ${sum(hours, 'value')} vs ${market.gross}`);
  await page.getByText('Sales by hour', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(`${label}-charts-oneday.png`) });

  // Filters that leave nothing: no charts, no crash.
  await page.getByText('Today', { exact: true }).click();
  await page.waitForTimeout(700);
  check(`[${label}] empty report shows no chart and no error`, (await bars('Sales by day')) === null && (await text()).includes('No sales match'));

  // ---- Sign out ----
  await menu('Settings');
  check(`[${label}] Settings no longer has "Sign out"`, !(await text()).includes('Sign out'));
  await openMenu();
  const items = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent === 'Customer View');
    return Array.from(el.parentElement.parentElement.children).map((c) => c.textContent).filter(Boolean);
  });
  check(`[${label}] "Sign out" is the last item in the dropdown`, items[items.length - 1] === 'Sign out', items.join(' / '));
  await page.screenshot({ path: shotPath(`${label}-signout-menu.png`) });
  await page.getByText('Sign out', { exact: true }).click();
  await page.waitForTimeout(600);
  check(`[${label}] it asks before signing out`, (await text()).includes('Sign out?'));
  await page.getByText('Cancel', { exact: true }).click();
  await page.waitForTimeout(600);
  check(`[${label}] Cancel keeps you signed in`, (await text()).includes('Demo store') && !(await text()).includes('Explore the demo store'));
  await openMenu();
  await page.getByText('Sign out', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByText('Sign out', { exact: true }).last().click();
  await page.waitForTimeout(2000);
  check(`[${label}] confirming returns to the sign-in screen`, await page.getByText('Explore the demo store', { exact: true }).isVisible());
  await browser.close();
}

(async () => {
  await run({ width: 1280, height: 800 }, 'desktop');
  await run({ width: 390, height: 844 }, 'phone');
  finish();
})().catch(crash);
