# BookCart E2E Automation

End-to-end test suite for the public demo store [BookCart](https://bookcart.azurewebsites.net), built with Playwright and JavaScript. It covers UI flows in Chromium, Firefox, and WebKit, plus direct API checks, and it records the defects it finds instead of assuming the app is right.

## Project Overview

The suite tests a book store's user-facing behavior: registration, login, search and browsing, the shopping cart, checkout, and order history. It also checks the REST API the UI calls. Where the app behaves unexpectedly, a test documents the observed behavior and names it as a known bug or observation.

## Application Under Test

- **Site:** https://bookcart.azurewebsites.net (a public demo shared by many users)
- **Architecture:** Angular frontend and a REST API under `/api`
- **Important constraint:** the demo is unreliable. The catalog endpoint (`/api/Book`) and the account write path sometimes return errors. The suite skips or retries in those cases, so results can change between runs for reasons outside the test code.

## Tech Stack

- [Playwright Test](https://playwright.dev/) 1.63 (runner and browser automation)
- JavaScript (CommonJS) on Node.js
- `dotenv` for local configuration
- Browsers: Chromium, Firefox, WebKit (Desktop profiles)

## Installation

Requirements: Node.js 20 or newer.

```bash
npm install
npx playwright install      # downloads the three browser builds
cp .env.example .env        # then set TEST_USER_PASSWORD in .env
```

`TEST_USER_PASSWORD` must meet the app's policy: at least 8 characters, with upper- and lower-case letters and a digit. `.env` is git-ignored and must never be committed.

## How to Run Tests

| Command | What it does |
|---|---|
| `npm test` | Runs the full suite in all three browsers |
| `npm run test:chromium` | Runs the full suite in Chromium only (fastest) |
| `npm run test:smoke` | Runs only the smoke test (site reachable) |
| `npm run test:headed` | Runs with a visible browser window |
| `npm run test:ui` | Opens Playwright UI mode for debugging |
| `npm run report` | Opens the last HTML report |

Run one file or one test by line:

```bash
npx playwright test tests/checkout.spec.js
npx playwright test tests/checkout.spec.js:47
```

## Test Structure

```
.
├── .github/workflows/        CI pipeline that runs the suite
├── docs/                     Application analysis, test design, selector and data strategy
├── pages/                    Page Object Model classes (one per page or component)
├── tests/                    Specs grouped by feature
│   ├── smoke/                Site-reachability check
│   ├── login.spec.js
│   ├── registration.spec.js
│   ├── search-navigation.spec.js
│   ├── shopping-cart.spec.js
│   ├── checkout.spec.js
│   ├── negative-edge.spec.js
│   └── api.spec.js           Direct API tests (no UI dependency)
├── test-data/                Static fixtures (no secrets)
├── utils/                    Shared helpers: API client, account setup, formatting, env guard
├── playwright.config.js      Browsers, timeouts, retries, reporters, artifacts
└── API-VALIDATION-SUMMARY.md API endpoint inventory and findings
```

Page objects keep selectors and page actions in one place, so specs read as user steps. Helpers in `utils/` handle the API client, account creation with caching, and the environment guard.

## Covered Scenarios

The suite has 78 tests, which run in each of the three browsers (234 runs in total). Some tests skip when the catalog API is down, so the number that actually runs varies.

| Area | Examples |
|---|---|
| Registration | Valid registration redirects to login; password policy and mismatch errors (data-driven); empty form makes no API call; taken username flagged before submit |
| Login and session | Successful login shows the username; wrong password and unknown user rejected; logout clears the session; protected routes redirect anonymous users |
| Search and navigation | Results page; sidebar category routes; empty state for unknown searches; book details page; catalog content checks (need the catalog API) |
| Shopping cart | Empty-cart state; adding books; badge equals total quantity; quantity changes; totals; removing one item; clearing the cart |
| Checkout | Guard redirect and returnUrl flow; empty cart disables the form; required-field and pincode validation; a full purchase creates an order (need the catalog API) |
| Negative and edge cases | Special characters and long queries in search; non-existing book and category; case-insensitive login; whitespace handling |
| API | Category shape; login 401 and JWT claims; username availability; registration validation (400); cart lifecycle; authentication on protected endpoints |

Known-issue API tests (for example the IDOR and unauthenticated-cart tests in `api.spec.js`) pin the current behavior so that a fix is noticed. Their titles say so.

## Reporting

Each run produces several reports:

- **Terminal:** the `list` reporter prints each test as it runs.
- **HTML:** `playwright-report/index.html`, opened with `npm run report`. It contains per-test steps, screenshots, videos, and traces.
- **JUnit XML:** `test-results/junit.xml`, for CI systems.

Artifacts are captured for failing tests only:

| Artifact | Setting | Notes |
|---|---|---|
| Screenshot | on failure | Attached to the HTML report |
| Video | retained on failure | Attached to the HTML report |
| Trace | on the first retry | Open with `npx playwright show-trace <file>` |

Retries are 1 locally and 2 on CI. A retry is there to detect intermittent infrastructure errors, not to hide bugs. A test that passes only on retry is reported as flaky.

Reports and artifacts are generated locally and are not committed to Git.

## Selector Strategy

Selectors follow `docs/selector-strategy.md`, in this order:

1. Semantic roles and accessible names (`getByRole`, `getByLabel`, `getByPlaceholder`).
2. Visible text, scoped to a container such as the header toolbar.
3. Stable structural anchors only when nothing semantic exists, such as Angular Material icon names.

Generated class names and deep CSS paths are avoided. Waiting relies on Playwright's auto-waiting and web-first assertions such as `expect(...).toBeVisible()`. Fixed sleeps are not used in test code.

## Test Data

- **Test accounts** are created through the API at run time with unique usernames. Their credentials are cached in `test-data/.<name>.json` so later runs can reuse them. Those cache files are git-ignored.
- **Password** comes only from `TEST_USER_PASSWORD` in `.env`. No real password is stored in the repository.
- **Static fixtures** in `test-data/` contain no secrets: sample addresses and password-policy examples.

The demo does not allow deleting orders or users, so accounts and orders accumulate. See Known Limitations.

## Known Limitations

These limits belong to the demo and the suite. They are recorded here rather than hidden.

- **Demo outages.** The catalog API (`/api/Book`) and the account write path have returned 500 and 400/401 errors. While the catalog is down, tests that need book data are skipped, and checkout purchase tests do not run. Account-creation tests can fail for reasons outside the code.
- **Known defects the suite documents:**
  - The registration form posts to `/api/user/` (trailing slash). The account is not saved, so a later login fails. REG-01b records this and is expected to fail until the app is fixed.
  - Pressing Enter in the search box can bounce back to the home page. That test is marked `fixme`.
  - The cart API stores items with a null book reference, which can leave the cart UI spinning.
  - Several API endpoints allow access without proper authorization. See `API-VALIDATION-SUMMARY.md`.
- **No server-side cleanup.** Orders and users cannot be deleted through the API (`DELETE` returns 405), so test accounts and orders persist. Guest carts are not isolated on the server.
- **Shared account state.** Tests that change an account's cart share that account within a file. Each spec file uses its own cached account, and purchase tests run serially.
- **Browser differences.** A few WebKit and Firefox timing issues are still open. See Latest Run.

## Latest Run

From the most recent full run (all browsers, 234 tests). Results depend on the demo's state at the time.

- **104 passed, 30 failed, 1 flaky, 57 skipped, 42 did not run.** The run stopped with the account setup and catalog failing.
- Failures are concentrated in:
  - checkout tests that need a new account (account-setup outage),
  - negative-edge search tests (same outage),
  - REG-01b (known defect),
  - and some login and checkout routing tests.

Failing tests are not hidden or marked as passing. Each one is listed in the HTML report with its error and artifacts.

## Roadmap

- [x] Project setup and Playwright configuration
- [x] Page Object Model structure
- [x] Login, registration, search, cart, checkout, negative/edge, and API suites
- [ ] Stabilize account setup against the demo outage
- [ ] Publish the HTML report from CI as a build artifact
