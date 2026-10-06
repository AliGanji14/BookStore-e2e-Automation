// @ts-check
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login-page');
const { HeaderPage } = require('../pages/header-page');
const { CheckoutPage } = require('../pages/checkout-page');
const { ShoppingCartPage } = require('../pages/shopping-cart-page');
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
  test.setTimeout(180_000);
  account = await ensureUser(BASE_URL, () => ({
    username: generateUsername('co'),
    password: VALID_PASSWORD,
    firstName: 'QA',
    lastName: 'Checkout',
    gender: 'Male',
  }));
});

/**
 * Reusable login for the shared account. If a guard already redirected us to
 * /login?returnUrl=..., stay on that page so the returnUrl flow is exercised.
 */
async function loginAs(page) {
  const login = new LoginPage(page);
  if (!page.url().includes('/login')) await login.goto();
  await login.login(account.username, account.password);
}

// ---------------------------------------------------------------------------
// Routing & form rules: verified to work even while the demo's catalog API
// is down (the checkout form renders without book data).
// ---------------------------------------------------------------------------
test.describe('Checkout — routing & form rules', () => {
  test('CO-01: anonymous users hitting /checkout are redirected to login with a returnUrl', async ({ page }) => {
    const checkout = new CheckoutPage(page);

    await checkout.goto();
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcheckout$/);
  });

  test('CO-02: logging in from the guard redirect returns to checkout', async ({ page }) => {
    const checkout = new CheckoutPage(page);

    await checkout.goto(); // bounces to /login?returnUrl=%2Fcheckout
    await loginAs(page);

    await expect(page).toHaveURL(/\/checkout$/);
  });

  // Business rule (source + deployed build verified): with an empty cart the
  // component runs checkOutForm.disable(), so the whole form and its button
  // are disabled until the cart has items.
  test('CO-04: an empty cart disables the checkout form', async ({ page }) => {
    const checkout = new CheckoutPage(page);

    await checkout.goto(); // guard → login → back to checkout
    await loginAs(page);
    await expect(checkout.placeOrderButton).toBeVisible();

    for (const field of [checkout.name, checkout.addressLine1, checkout.addressLine2, checkout.pincode, checkout.state]) {
      await expect(field).toBeDisabled();
    }
    await expect(checkout.placeOrderButton).toBeDisabled();
  });

  test('CO-06: checkout with an empty cart shows the empty state', async ({ page }) => {
    const checkout = new CheckoutPage(page);

    await checkout.goto(); // guard → login → back to checkout
    await loginAs(page);
    await expect(checkout.placeOrderButton).toBeVisible();

    await expect(checkout.emptyCartMessage).toBeVisible();
    await expect(checkout.startShoppingButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Purchase: needs catalog data + a filled cart — auto-skipped while
// /api/Book is down. Serial mode: both tests share the account's cart, so
// they must not run in parallel.
// ---------------------------------------------------------------------------
test.describe('Checkout — purchase', () => {
  test.describe.configure({ mode: 'serial' });

  let books;

  test.beforeAll(async () => {
    books = await getBooks(BASE_URL);
    test.skip(
      books === null,
      'Catalog API (/api/Book) is down or empty — known demo outage; this suite runs automatically once it recovers'
    );
  });

  /** Tests share the account, hence the cart — start each one from empty. */
  async function resetCart(page) {
    const cart = new ShoppingCartPage(page);
    const header = new HeaderPage(page);
    await header.openCart();
    const clearButton = cart.clearCartButton;
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click();
      await expect(cart.emptyMessage).toBeVisible();
    }
  }

  // The form is only enabled when the cart has items, so input validation
  // (required fields, pincode pattern) lives in this gated group.
  test('CO-04b: required-field validation blocks an empty submission', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const checkout = new CheckoutPage(page);
    let checkoutApiCalled = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/CheckOut')) {
        checkoutApiCalled = true;
      }
    });

    await page.goto('/');
    await resetCart(page);
    const card = page.locator('app-book-card').filter({ hasText: books[0].title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await cart.checkoutButton.click();
    await expect(checkout.placeOrderButton).toBeVisible();

    // Focus a field, then submit — blur marks it touched, so its error shows.
    await checkout.name.click();
    await checkout.placeOrderButton.click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    expect(checkoutApiCalled).toBe(false);
  });

  test('CO-04c: an invalid pincode is rejected with the exact rule message', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const checkout = new CheckoutPage(page);

    await page.goto('/');
    await resetCart(page);
    const card = page.locator('app-book-card').filter({ hasText: books[0].title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await cart.checkoutButton.click();
    await expect(checkout.placeOrderButton).toBeVisible();

    await checkout.fillShippingAddress({ ...address.valid, pincode: address.invalidPincodes.startsWithZero });
    // Filling State moves focus (blur) so the pincode mat-error renders.
    await checkout.state.click();
    await expect(checkout.pincodePatternError).toBeVisible();
    await checkout.placeOrderButton.click();
    await expect(page).toHaveURL(/\/checkout$/); // form invalid → no order
  });

  test('CO-03: completing a purchase places the order, empties the cart and shows it in My Orders', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const checkout = new CheckoutPage(page);
    const [first, second] = books;

    // Arrange: two of the first book, one of the second (distinctive total).
    await page.goto('/');
    await resetCart(page);
    const firstCard = page.locator('app-book-card').filter({ hasText: first.title });
    const secondCard = page.locator('app-book-card').filter({ hasText: second.title });
    await firstCard.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);
    await firstCard.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(2);
    await secondCard.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(3);

    const expectedTotal = formatInr(first.price * 2 + second.price);

    // Act: review the order summary, then purchase.
    await header.openCart();
    await cart.checkoutButton.click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(checkout.orderSummaryHeading).toBeVisible();
    await expect(checkout.orderRow(first.title)).toBeVisible();
    await expect(checkout.orderRow(second.title)).toBeVisible();

    await checkout.fillShippingAddress(address.valid);
    await checkout.placeOrderButton.click();

    // Assert: snackbar, landing on My Orders, cart emptied, order listed.
    await expect(page.getByText('Order placed successfully!!!')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/myorders$/, { timeout: 10_000 });
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(0);
    await expect(
      page.getByRole('row', { name: new RegExp(expectedTotal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    ).toBeVisible();
  });

  test('CO-05: the placed order is listed in My Orders', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);
    const checkout = new CheckoutPage(page);
    const book = books[0];

    // Arrange: a fresh order with a distinctive quantity, so its total is
    // unique among this account's orders.
    await page.goto('/');
    await resetCart(page);
    const card = page.locator('app-book-card').filter({ hasText: book.title });
    await card.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);
    await header.openCart();
    await cart.increaseQuantity(book.title).click();
    await expect(cart.quantityValue(book.title)).toHaveText('2');

    await cart.checkoutButton.click();
    await checkout.fillShippingAddress(address.valid);
    await checkout.placeOrderButton.click();
    await expect(page).toHaveURL(/\/myorders$/);

    const expectedTotal = formatInr(book.price * 2);
    await expect(page.getByText('My Orders')).toBeVisible();
    await expect(
      page.getByRole('row', { name: new RegExp(expectedTotal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    ).toBeVisible();
  });
});
