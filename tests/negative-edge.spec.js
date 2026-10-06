// @ts-check
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login-page');
const { HeaderPage } = require('../pages/header-page');
const { CatalogPage } = require('../pages/catalog-page');
const { RegistrationPage } = require('../pages/registration-page');
const { ShoppingCartPage } = require('../pages/shopping-cart-page');
const { CheckoutPage } = require('../pages/checkout-page');
const { getBooks, ensureUser } = require('../utils/api-helpers');
const { generateUsername } = require('../utils/data-generator');
const { formatInr } = require('../utils/format');

const BASE_URL = process.env.BASE_URL;
const address = require('../test-data/checkout-address.json');

const VALID_PASSWORD = process.env.TEST_USER_PASSWORD;
if (!VALID_PASSWORD) {
  throw new Error('TEST_USER_PASSWORD is not set — copy .env.example to .env (see docs/test-data-management.md)');
}

let account;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  account = await ensureUser(BASE_URL, () => ({
    username: generateUsername('edge'),
    password: VALID_PASSWORD,
    firstName: 'QA',
    lastName: 'Edge',
    gender: 'Male',
  }));
});

// ---------------------------------------------------------------------------
// Input handling — all verified live and runnable today.
// Every test documents OBSERVED behavior (rule: never assume).
// ---------------------------------------------------------------------------
test.describe('Negative & Edge — input handling', () => {
  test('EDGE-REG-01: a username wrapped in spaces is NOT flagged as taken (backend does not trim)', async ({ page }) => {
    // OBSERVATION: GET /api/user/validateUserName/' admin ' returns true
    // ("available") even though `admin` exists — the API compares raw strings.
    const registration = new RegistrationPage(page);

    await registration.goto();
    await registration.userName.fill(' admin ');
    // Wait for the async availability check to settle before asserting.
    await expect(registration.userName).toHaveClass(/ng-pending/);
    await expect(registration.userName).not.toHaveClass(/ng-pending/);

    await expect(registration.userNameNotAvailableError).toBeHidden();
  });

  test('EDGE-LOG-01: login succeeds with an UPPERCASE version of the username (case-insensitive matching)', async ({ page }) => {
    // OBSERVATION: POST /api/login matches usernames case-insensitively.
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(account.username.toUpperCase(), account.password);

    // The header still shows the stored (lowercase) username.
    await expect(header.userMenu(account.username)).toBeVisible();
  });

  test('EDGE-LOG-02: login succeeds with a trailing space in the password (server trims it)', async ({ page }) => {
    // OBSERVATION: POST /api/login accepts "Test@1234 " — the password is not
    // compared byte-exact. Worth flagging to the product owner.
    const login = new LoginPage(page);
    const header = new HeaderPage(page);

    await login.goto();
    await login.login(account.username, account.password + ' ');

    await expect(header.userMenu(account.username)).toBeVisible();
  });

  test('EDGE-SRCH-01: a query with special characters is URL-encoded and renders gracefully', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const query = `harry & potter's "test"`;

    await page.goto('/search?item=' + encodeURIComponent(query));

    await expect(catalog.noBooksHeading).toBeVisible();
    expect(new URL(page.url()).searchParams.get('item')).toBe(query);
  });

  test('EDGE-SRCH-02: a 250-character query does not crash the app', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const longQuery = 'x'.repeat(250);

    await page.goto('/search?item=' + longQuery);

    await expect(catalog.noBooksHeading).toBeVisible();
    expect(new URL(page.url()).searchParams.get('item')).toBe(longQuery);
  });

  test('EDGE-SRCH-03: an empty item query renders the empty state, not the full catalog', async ({ page }) => {
    const catalog = new CatalogPage(page);

    await page.goto('/search?item=');

    await expect(page).toHaveURL(/\/search\?item=$/);
    await expect(catalog.noBooksHeading).toBeVisible();
  });

  test('EDGE-SRCH-04: a non-existing category renders the empty state', async ({ page }) => {
    const catalog = new CatalogPage(page);

    await page.goto('/filter?category=nonexistent');

    await expect(catalog.noBooksHeading).toBeVisible();
  });

  test('EDGE-PROD-01: a non-existing book id renders the graceful not-found state', async ({ page }) => {
    const catalog = new CatalogPage(page);

    await page.goto('/books/details/999999');

    await expect(catalog.noBooksHeading).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Home' })).toBeVisible();
  });

  test('EDGE-PROD-02: a non-numeric book id renders gracefully (no crash)', async ({ page }) => {
    const catalog = new CatalogPage(page);

    await page.goto('/books/details/abc');

    await expect(catalog.noBooksHeading).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Home' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Data-dependent negative/edge cases — auto-skipped while /api/Book is down.
// ---------------------------------------------------------------------------
test.describe('Negative & Edge — catalog data', () => {
  test.describe.configure({ mode: 'serial' });

  let books;

  test.beforeAll(async () => {
    books = await getBooks(BASE_URL);
    test.skip(
      books === null,
      'Catalog API (/api/Book) is down or empty — known demo outage; this suite runs automatically once it recovers'
    );
  });

  async function loginAs(page) {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(account.username, account.password);
  }

  async function resetCart(page) {
    const cart = new ShoppingCartPage(page);
    const header = new HeaderPage(page);
    await header.openCart();
    if (await cart.clearCartButton.isVisible().catch(() => false)) {
      await cart.clearCartButton.click();
      await expect(cart.emptyMessage).toBeVisible();
    }
  }

  test('EDGE-SRCH-05: search results are case-insensitive (upper vs lower query)', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto('/');
    await header.searchFor(book.title.toUpperCase());
    const upperCount = await page.locator('app-book-card').count();
    await expect(catalog.bookCard(book.title)).toBeVisible();

    await page.goto('/');
    await header.searchFor(book.title.toLowerCase());
    const lowerCount = await page.locator('app-book-card').count();

    expect(upperCount).toBe(lowerCount);
  });

  test('EDGE-CART-01: quantity cannot go below 1 (minus button disabled)', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPage(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await loginAs(page);
    await page.goto('/');
    await resetCart(page);
    const card = page.locator('app-book-card').filter({ hasText: book.title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await header.openCart();
    await expect(cart.decreaseQuantity(book.title)).toBeDisabled();
    await expect(cart.quantityValue(book.title)).toHaveText('1');
  });

  test('EDGE-CART-02: a guest cart survives a full page reload', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await page.goto('/');
    const card = page.locator('app-book-card').filter({ hasText: book.title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await page.reload();
    await header.openCart();
    await expect(cart.row(book.title)).toBeVisible();
    await expect(cart.cell(book.title, 'price')).toHaveText(formatInr(book.price));
  });

  for (const [label, pincode] of Object.entries({
    fiveDigits: address.invalidPincodes.tooShort,
    sevenDigits: address.invalidPincodes.tooLong,
  })) {
    test(`EDGE-CO-01: a ${label} pincode is rejected by the pattern`, async ({ page }) => {
      const header = new HeaderPage(page);
      const cart = new ShoppingCartPage(page);
      const checkout = new CheckoutPage(page);

      await loginAs(page);
      await page.goto('/');
      await resetCart(page);
      const card = page.locator('app-book-card').filter({ hasText: books[0].title });
      await card.getByRole('button', { name: 'Add to Cart' }).click();
      await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

      await header.openCart();
      await cart.checkoutButton.click();
      await expect(checkout.placeOrderButton).toBeVisible();

      await checkout.fillShippingAddress({ ...address.valid, pincode });
      await checkout.state.click();
      await expect(checkout.pincodePatternError).toBeVisible();
    });
  }

  test('EDGE-CO-02: whitespace-only address fields pass validation (weak required rule — observation)', async ({ page }) => {
    // OBSERVATION: Angular's `required` treats " " as a value, so a
    // whitespace-only address enables Place Order. Flagged for the product
    // owner; this test pins the current behavior.
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const checkout = new CheckoutPage(page);

    await loginAs(page);
    await page.goto('/');
    await resetCart(page);
    const card = page.locator('app-book-card').filter({ hasText: books[0].title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await header.openCart();
    await cart.checkoutButton.click();
    await expect(checkout.placeOrderButton).toBeVisible();

    await checkout.fillShippingAddress({
      name: '   ',
      addressLine1: '   ',
      addressLine2: '   ',
      pincode: '411014',
      state: '   ',
    });
    await expect(checkout.placeOrderButton).toBeEnabled();
  });
});
