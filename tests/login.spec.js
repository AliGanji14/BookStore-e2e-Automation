// @ts-check
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login-page');
const { HeaderPage } = require('../pages/header-page');
const { generateUsername } = require('../utils/data-generator');
const { ensureUser } = require('../utils/api-helpers');

const users = require('../test-data/users.json');
const passwords = require('../test-data/passwords.json');

const VALID_PASSWORD = process.env.TEST_USER_PASSWORD;
if (!VALID_PASSWORD) {
  throw new Error('TEST_USER_PASSWORD is not set — copy .env.example to .env (see docs/test-data-management.md)');
}

// Creating an API account (with persistence verification) can outlast the
// default 30s on the flaky public demo — give the whole suite room to breathe.
test.setTimeout(120_000);

test.describe('User Login — with an existing account', () => {
  // One shared, working account per run. The demo's write path only succeeds
  // in intermittent windows, so the account is created once (and cached on
  // disk by ensureUser) instead of per test. Login tests don't mutate the
  // account, so sharing it keeps them effectively independent.
  let username;

  test.beforeAll(async () => {
    // Hook timeouts are separate from test timeouts — extend this hook,
    // it may need several registration attempts on the flaky demo.
    test.setTimeout(420_000);
    const creds = await ensureUser(process.env.BASE_URL, () => ({
      username: generateUsername('login'),
      password: VALID_PASSWORD,
      firstName: users.primary.firstName,
      lastName: users.primary.lastName,
      gender: users.primary.gender,
    }));
    username = creds.username;
  });

  test('LOG-01: successful login shows the user in the header', async ({ page }) => {
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(username, VALID_PASSWORD);

    await expect(header.userMenu(username)).toBeVisible();
    await expect(header.loginButton).toBeHidden();
  });

  test('LOG-02: a wrong password is rejected', async ({ page }) => {
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(username, passwords.wrongButValidShape);

    // Still on the login page and still logged out.
    await expect(page).toHaveURL(/\/login$/);
    await expect(header.loginButton).toBeVisible();
  });

  test('LOG-05: logout clears the session', async ({ page }) => {
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(username, VALID_PASSWORD);
    await expect(header.userMenu(username)).toBeVisible();

    await header.openUserMenu(username);
    await header.logoutMenuItem().click();

    await expect(header.loginButton).toBeVisible();
    await expect(header.userMenu(username)).toBeHidden();
  });
});

test.describe('User Login — form and access rules', () => {
  test('LOG-03: a nonexistent username is rejected', async ({ page }) => {
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(generateUsername('ghost'), passwords.wrongButValidShape);

    await expect(page).toHaveURL(/\/login$/);
    await expect(header.loginButton).toBeVisible();
  });

  test('LOG-04: submitting an empty login form never calls the API', async ({ page }) => {
    const login = new LoginPage(page);
    let loginApiCalled = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().toLowerCase().includes('/api/login')) {
        loginApiCalled = true;
      }
    });

    await login.goto();
    await login.submitButton.click();

    await expect(page).toHaveURL(/\/login$/);
    expect(loginApiCalled).toBe(false);
  });

  test('LOG-06: protected routes redirect anonymous users to the login page', async ({ page }) => {
    for (const route of ['/checkout', '/wishlist', '/myorders']) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`/login\\?returnUrl=${encodeURIComponent(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      // Back to a clean state for the next route.
      await page.goto('/');
    }
  });
});
