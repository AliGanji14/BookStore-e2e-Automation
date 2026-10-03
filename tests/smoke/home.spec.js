// @ts-check
const { test, expect } = require('@playwright/test');

// Smoke test: the goal is only to prove the site is up and reachable.
// Deeper flows (login, search, cart, checkout) come in later phases.
test('home page loads and shows the BookCart header', async ({ page }) => {
  // baseURL from playwright.config.js is used, so "/" means the store home.
  await page.goto('/');

  // The app header should be rendered with the store name in it.
  await expect(page.getByText('Book Cart')).toBeVisible();

  // The navigation bar should also show the Login button.
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});
