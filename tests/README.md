# Tests

This folder holds end-to-end checks of the real app and the real database.
There is no test database: every script here talks to the live Supabase
project, so each one says in its header comment exactly what (if anything)
it writes.

Unit tests are separate and live next to the code they test (see
[Unit tests](#unit-tests) below).

| Folder | What | Writes? | Runs on GitHub |
|---|---|---|---|
| `ui/` | Playwright drives Chromium through the app: the demo store (`demo`, `charts-signout`, `themes`) and the Twin Maples test vendor (`smoke`, `search`, `reports`) | No | Every push to master and every pull request, against a build of that commit |
| `api/` | Supabase client calls with no app in between: the demo store's read-only lock (`lock`) and the Stripe onboarding function's demo guard (`edge-function`) | `lock` inserts and deletes one event row | Nightly at 09:30 UTC, after the demo reset |
| `manual/` | `theme-save`: saves a theme to the test store and checks a fresh browser gets it | Yes, then puts the original theme back | Never — run by hand |

## Running them

From the repo root:

```sh
npm run test:ui                           # all ui/ scripts, against the live site
npm run test:ui -- http://localhost:8081  # ... or against any other copy
npm run test:api
node tests/ui/smoke.js                    # one script (optional site URL after it)
node tests/manual/theme-save.js
```

Each script prints `PASS`/`FAIL` per check and exits 0 (all passed),
1 (a check failed, or the browser logged an error or failed request) or
2 (the script itself crashed). Screenshots go to `test-results/<script>/`,
which is gitignored. On GitHub they are uploaded with the run when the ui
job fails (Actions tab → the run → Artifacts).

To test local changes before deploying, build and serve them the same way
the workflow does:

```sh
npx expo export --platform web
python -m http.server 8081 --directory dist
npm run test:ui -- http://localhost:8081
```

## Unit tests

Jest tests of plain functions, in `src/**/*.test.ts` next to the file they
test (for example `src/lib/fees.test.ts`). They touch nothing live: no
browser, no network, no `.env`.

```sh
npm run test:unit                 # all of them
npx jest src/lib/fees.test.ts     # one file
```

On GitHub they run on every pull request (including from forks, since they
need no secrets) and every push to master.

## Settings

Read from environment variables first, then from `.env` (see
`.env.example`). On GitHub they are repository secrets (Settings → Secrets
and variables → Actions):

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the project
- `TEST_VENDOR_EMAIL`, `TEST_VENDOR_PASSWORD`, `TEST_VENDOR_PIN` — the Twin
  Maples test store's login and staff PIN. Never in the code: this
  repository is public.

The demo login (`demo@example.com` / `artfairdemo`) is shown on the sign-in
screen, so it is written in `tests/lib/harness.js`.

## Data the tests depend on

Several checks assert exact counts, so they fail if the data changes:

- Demo store: 26 pieces, 89 sales, 9 selling days, three named fairs. Set by
  `npm run seed-demo` (and the nightly reset), so a seed change means
  updating `ui/demo.js`, `ui/charts-signout.js` and `api/lock.js`.
- Twin Maples: 7 pieces, 3 sales (`api/lock.js`), store name
  "Twin Maples Studio" (`ui/smoke.js`).
