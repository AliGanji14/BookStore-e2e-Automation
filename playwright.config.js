// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for the Online Book Store E2E suite.
 * Read more: https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  // Only pick up test files inside the tests folder.
  testDir: './tests',

  // Fail the run if a leftover test.only sneaks into the code.
  forbidOnly: !!process.env.CI,

  // Give each test and each expect() a sensible ceiling.
  timeout: 30 * 1000,
  expect: { timeout: 5 * 1000 },

  // Run tests in the same file in parallel.
  fullyParallel: true,

  // Retry only on CI — locally we want to see real failures fast.
  retries: process.env.CI ? 2 : 0,

  // Keep the terminal readable; Playwright picks a good default per machine.
  workers: process.env.CI ? 1 : undefined,

  // Where failures (screenshots, videos, traces) get written.
  outputDir: './test-results',

  /* Settings applied to every test's browser context. */
  use: {
    // Where the application under test lives — every page.goto('/') uses this.
    baseURL: 'https://bookcart.azurewebsites.net',

    // Capture evidence when a test fails.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Trace = full action log; kept on the first retry to debug flaky tests.
    trace: 'on-first-retry',

    // Small waits-free default: actions wait for elements automatically.
    actionTimeout: 10 * 1000,
    navigationTimeout: 20 * 1000,

    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
  },

  /* Browsers the suite runs against. */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  /* Reporters: console list + interactive HTML report. */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
});
