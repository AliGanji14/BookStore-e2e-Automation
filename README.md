# BookCart E2E Automation

End-to-end test automation suite for the [BookCart](https://bookcart.azurewebsites.net) online book store, built with **Playwright**, **JavaScript**, and **Node.js**.

## Tech Stack

- [Playwright](https://playwright.dev/) — test runner + cross-browser automation
- JavaScript (CommonJS) on Node.js
- Chromium, Firefox, and WebKit browser coverage

## Project Structure

```
bookstore-e2e-automation/
├── tests/
│   └── smoke/            # Fast health-check tests (site is up and reachable)
│       └── home.spec.js
├── pages/                # Page Object Model classes (filled in later phases)
├── test-data/            # Test data files (users, books, ...)
├── playwright.config.js  # Playwright configuration (baseURL, browsers, reporters)
└── package.json          # Dependencies and npm scripts
```

## Getting Started

### 1. Install dependencies

```bash
npm install
npx playwright install        # downloads Chromium, Firefox, and WebKit
```

### 2. Run the tests

```bash
npm test                 # all tests, headless, all 3 browsers
npm run test:smoke       # only the smoke suite
npm run test:headed      # watch the browser while tests run
npm run test:ui          # Playwright UI mode (debug, time-travel, pick tests)
npm run test:chromium    # only Chromium
```

### 3. View the report

After a run, open the interactive HTML report:

```bash
npm run report
```

The report contains step-by-step logs, screenshots, videos, and traces for failed tests.

## Key Configuration

| Setting | Value | Why |
|---|---|---|
| `baseURL` | `https://bookcart.azurewebsites.net` | Tests navigate with relative paths like `page.goto('/')` |
| Screenshots | `only-on-failure` | Automatic visual evidence for every failure |
| Video | `retain-on-failure` | Full recording of failed test sessions |
| Trace | `on-first-retry` | Deep debug info for flaky tests on CI retries |
| Retries | `2` on CI, `0` locally | Fast local feedback, resilient CI runs |
| Reporters | list + HTML + JUnit | Terminal output, rich report, CI integration |

## Roadmap

- [x] Phase 1 — Project setup & Playwright configuration
- [ ] Phase 2 — Page Object Model structure
- [ ] Phase 3 — Login, Search, Cart & Checkout test suites
