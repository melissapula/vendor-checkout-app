// Shared plumbing for every test script: settings, pass/fail bookkeeping,
// and where screenshots go. Each script stays a plain Node program, run as
//   node tests/<group>/<name>.js [site url]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_URL = 'https://vendor-checkout-app.expo.app';

// Settings come from the environment first (GitHub Actions secrets), then
// from the repo's .env file (a developer's machine). Neither is ever
// committed: the repository is public.
let dotEnv;
function env(name) {
  if (process.env[name]) return process.env[name];
  if (dotEnv === undefined) {
    const file = path.join(ROOT, '.env');
    dotEnv = fs.existsSync(file)
      ? Object.fromEntries(
          fs
            .readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
            .filter(Boolean)
            .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
        )
      : {};
  }
  if (dotEnv[name]) return dotEnv[name];
  throw new Error(`${name} is not set (add it to .env, or to the environment)`);
}

// The Twin Maples test store: an ordinary vendor account, not the demo.
const testVendor = () => ({
  email: env('TEST_VENDOR_EMAIL'),
  password: env('TEST_VENDOR_PASSWORD'),
  pin: env('TEST_VENDOR_PIN'),
});

// After clicking Sign in, waits for the customer view. If the app shows the
// updated-Terms screen first (src/screens/auth/AcceptTermsScreen.tsx), ticks
// and accepts it: the one write a ui script can make, and only once per new
// Terms version, since tests/api/terms-gate.js puts back what it changes.
async function waitForCustomerView(page) {
  const customerView = page.getByText('Scan with camera', { exact: true });
  const termsScreen = page.getByText('Our Terms have changed', { exact: true });
  await customerView.or(termsScreen).waitFor({ timeout: 30000 });
  if (await termsScreen.isVisible()) {
    await page.getByTestId('accept-terms-checkbox').click();
    await page.getByText('Accept', { exact: true }).click();
    await customerView.waitFor({ timeout: 30000 });
  }
}

// Signs a Playwright page in as the test vendor and unlocks the admin side
// (Staff Access lives in the ▾ menu), stopping on Inventory.
async function signInToInventory(page, url) {
  const vendor = testVendor();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.getByPlaceholder('Email').fill(vendor.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(vendor.password);
  await page.getByText('Sign in', { exact: true }).click();
  await waitForCustomerView(page);
  await page.getByText(/▾/).first().click();
  await page.getByText('Staff Access', { exact: true }).click();
  await page.getByPlaceholder('Enter PIN').fill(vendor.pin);
  await page.getByText('Unlock', { exact: true }).click();
  await page.getByPlaceholder('Search by title, SKU, size…').waitFor({ timeout: 30000 });
}

// The demo login is printed on the sign-in screen, so it is not a secret.
const DEMO = { email: 'demo@example.com', password: 'artfairdemo' };

function start(name) {
  const url = process.argv[2] || DEFAULT_URL;
  const outDir = path.join(ROOT, 'test-results', name);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  const problems = [];
  const check = (label, pass, detail) => {
    results.push(!!pass);
    const shown = detail !== undefined && detail !== null && detail !== '' ? '  -> ' + detail : '';
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${shown}`);
  };
  const shotPath = (file) => path.join(outDir, file);
  // Exit code: 0 all passed, 1 a check failed or the browser logged a
  // problem, 2 the script itself crashed.
  const finish = () => {
    const uniq = [...new Set(problems)];
    console.log('\n--- problems (page errors, failed requests) ---\n' + (uniq.length ? uniq.join('\n') : 'none'));
    console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
    process.exit(results.length > 0 && results.every(Boolean) && !uniq.length ? 0 : 1);
  };
  const crash = (e) => {
    console.error('SCRIPT ERROR', e);
    if (problems.length) console.log('problems so far:\n' + problems.join('\n'));
    process.exit(2);
  };
  return { url, check, problems, shotPath, finish, crash };
}

module.exports = { env, testVendor, signInToInventory, waitForCustomerView, DEMO, start };
