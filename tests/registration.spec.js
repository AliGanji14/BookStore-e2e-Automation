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

  // KNOWN BUG (verified 2026-10-03): the app posts the registration to
  // `/api/user/` (trailing slash). The backend answers 200 but never persists
  // the account — validateUserName still reports the name as available and the
  // subsequent login returns 401. Registering against `/api/user` (no slash)
  // works. This test is expected to fail until the product fixes the route.
  test('REG-01b: an account created via the UI can log in', async ({ page }) => {
    test.info().annotations.push({
      type: 'known-bug',
      description:
        'App posts registration to /api/user/ (trailing slash); backend returns 200 without persisting the user, so the follow-up login fails with 401.',
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
