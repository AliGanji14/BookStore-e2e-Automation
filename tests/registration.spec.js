// @ts-check
const { test, expect } = require('@playwright/test');
const { RegistrationPage } = require('../pages/registration-page');
const { LoginPage } = require('../pages/login-page');
const { generateUsername } = require('../utils/data-generator');

const users = require('../test-data/users.json');
const passwords = require('../test-data/passwords.json');

const VALID_PASSWORD = process.env.TEST_USER_PASSWORD;
if (!VALID_PASSWORD) {
  throw new Error('TEST_USER_PASSWORD is not set — copy .env.example to .env (see docs/test-data-management.md)');
}

test.describe('User Registration', () => {
  test('REG-01: registration with valid data redirects to the login page', async ({ page }) => {
    const registration = new RegistrationPage(page);
    const username = generateUsername('reg', test.info().workerIndex);

    await registration.goto();
    await registration.fill({
      ...users.primary,
      username,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    await registration.submit();

    // Verified live: a successful registration navigates to /login.
    await expect(page).toHaveURL(/\/login$/);
  });

  // KNOWN BUG (verified 2026-10-03, re-verified 2026-10-19): the backend
  // answers 200 on registration but never persists the account — a direct
  // GET /api/user/validateUserName/<new user> still reports the name as
  // available and the follow-up login returns 401. Posting straight to
  // /api/user (no trailing slash, what utils/api-helpers.js uses) fails the
  // same way, so this is a backend write-path defect, not a routing typo.
  // test.fail() keeps the test running and asserting: the documented bug is
  // reported as an expected failure, and it becomes an ordinary failure
  // ("unexpected pass") once the product is fixed — the signal to drop it.
  test('REG-01b: an account created via the UI can log in', async ({ page }) => {
    test.fail(true, 'Known backend bug: POST /api/user returns 200 without persisting the account.');
    test.info().annotations.push({
      type: 'known-bug',
      description:
        'POST /api/user (with or without trailing slash) returns 200 without persisting the user, so the follow-up login fails with 401.',
    });
    const registration = new RegistrationPage(page);
    const login = new LoginPage(page);
    const username = generateUsername('reg', test.info().workerIndex);

    await registration.goto();
    await registration.fill({
      ...users.primary,
      username,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    await registration.submit();

    await expect(page).toHaveURL(/\/login$/);
    await login.login(username, VALID_PASSWORD);
    await expect(page.getByText(username)).toBeVisible();
  });

  for (const [label, weakPassword] of Object.entries(passwords.invalid)) {
    test(`REG-02: rejects a password that is ${label}`, async ({ page }) => {
      const registration = new RegistrationPage(page);

      await registration.goto();
      await registration.fill({
        ...users.primary,
        username: generateUsername('reg-neg', test.info().workerIndex),
        password: weakPassword,
        confirmPassword: weakPassword,
      });
      await registration.submit();

      await expect(registration.passwordPolicyError).toBeVisible();
      // The form is invalid, so no account is created and the user stays here.
      await expect(page).toHaveURL(/\/register$/);
    });
  }

  test('REG-03: rejects a mismatched confirm password', async ({ page }) => {
    const registration = new RegistrationPage(page);

    await registration.goto();
    await registration.fill({
      ...users.primary,
      username: generateUsername('reg-neg', test.info().workerIndex),
      password: VALID_PASSWORD,
      confirmPassword: passwords.mismatchConfirm,
    });
    await registration.submit();

    await expect(registration.passwordMismatchError).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('REG-04: flags a taken username before submit and blocks registration', async ({ page }) => {
    const registration = new RegistrationPage(page);
    let registerApiCalled = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/User')) {
        registerApiCalled = true;
      }
    });

    await registration.goto();
    await registration.fill({
      ...users.primary,
      username: 'admin', // an intentionally existing account
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });

    // The availability check runs while typing — no submit needed.
    await expect(registration.userNameNotAvailableError).toBeVisible();

    await registration.submit();
    await expect(page).toHaveURL(/\/register$/);
    expect(registerApiCalled).toBe(false);
  });

  test('REG-05: submitting an empty form stays on the page and never calls the API', async ({ page }) => {
    const registration = new RegistrationPage(page);
    let registerApiCalled = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/User')) {
        registerApiCalled = true;
      }
    });

    await registration.goto();
    await registration.submit();

    await expect(page).toHaveURL(/\/register$/);
    expect(registerApiCalled).toBe(false);
  });
});
