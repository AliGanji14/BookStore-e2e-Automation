// @ts-check
const { test, expect } = require('@playwright/test');
const { HeaderPage } = require('../pages/header-page');
const { ShoppingCartPage } = require('../pages/shopping-cart-page');
const { getBooks } = require('../utils/api-helpers');
const { formatInr } = require('../utils/format');

const BASE_URL = process.env.BASE_URL;

// ---------------------------------------------------------------------------
// Empty cart: renders without any catalog data, so it runs even during the
// demo's catalog outage (verified live 2026-10-03).
// ---------------------------------------------------------------------------
test.describe('Shopping Cart — empty state', () => {
  test('a fresh guest sees the empty cart state', async ({ page }) => {
    const header = new HeaderPage(page);
    const cart = new ShoppingCartPage(page);

    await page.goto('/');
    await header.openCart();

    await expect(cart.emptyMessage).toBeVisible();
    await expect(cart.continueShoppingButton).toBeVisible();
    expect(await header.cartBadgeCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cart management: needs real catalog data — auto-skipped while /api/Book
// is down. Carts are guest carts: every test starts from a fresh browser
// context (clean localStorage, unique guest userId), so no login is needed
// and tests stay independent.
// ---------------------------------------------------------------------------
test.describe('Shopping Cart — management', () => {
  let books;

  test.beforeAll(async () => {
    books = await getBooks(BASE_URL);
    test.skip(
      books === null,
      'Catalog API (/api/Book) is down or empty — known demo outage; this suite runs automatically once it recovers'
    );
  });

  test('CART-01: adding one book puts its name and price in the cart', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.addToCart(book.title);

    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await header.openCart();
    await expect(cart.row(book.title)).toBeVisible();
    await expect(cart.cell(book.title, 'price')).toHaveText(formatInr(book.price));
    await expect(cart.cell(book.title, 'total')).toHaveText(formatInr(book.price));
  });

  test('CART-02: adding multiple books lists every book', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const [first, second] = books;

    await page.goto('/');
    await catalog.addToCart(first.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);
    await catalog.addToCart(second.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(2);

    await header.openCart();
    await expect(cart.row(first.title)).toBeVisible();
    await expect(cart.row(second.title)).toBeVisible();
  });

  test('CART-03: the badge count equals the sum of item quantities', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.addToCart(book.title);
    await catalog.addToCart(book.title);

    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(2);

    await header.openCart();
    await expect(cart.quantityValue(book.title)).toHaveText('2');
  });

  test('CART-04: increasing quantity updates totals reliably', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.addToCart(book.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await header.openCart();
    await cart.increaseQuantity(book.title).click();
    await expect(cart.quantityValue(book.title)).toHaveText('2');

    // Line total and cart total must both be price x quantity.
    await expect(cart.cell(book.title, 'total')).toHaveText(formatInr(book.price * 2));
    await expect(cart.cartTotalValue).toHaveText(formatInr(book.price * 2));
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(2);
  });

  test('CART-05: the cart total is the sum of price x quantity over all rows', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const [first, second] = books;

    await page.goto('/');
    await catalog.addToCart(first.title);
    await catalog.addToCart(first.title);
    await catalog.addToCart(second.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(3);

    await header.openCart();
    // first book is already at quantity 2 (added twice); + makes it 3.
    await cart.increaseQuantity(first.title).click();
    const expectedTotal = formatInr(first.price * 3 + second.price);
    await expect(cart.cartTotalValue).toHaveText(expectedTotal);
  });

  test('CART-06: removing an item deletes only its own row', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const [first, second] = books;

    await page.goto('/');
    await catalog.addToCart(first.title);
    await catalog.addToCart(second.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(2);

    await header.openCart();
    await cart.removeItemButton(first.title).click();

    await expect(cart.row(first.title)).toHaveCount(0);
    await expect(cart.row(second.title)).toBeVisible();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);
  });

  test('CART-07: Clear cart empties everything', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPageForCart(page);
    const cart = new ShoppingCartPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.addToCart(book.title);
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(1);

    await header.openCart();
    await cart.clearCartButton.click();

    await expect(cart.emptyMessage).toBeVisible();
    await expect.poll(() => header.cartBadgeCount(), { timeout: 5_000 }).toBe(0);
  });
});

/**
 * Small helper used only by the cart suite: adds a book from its card on the
 * catalog pages. Kept local because nothing else needs it yet.
 * @param {import('@playwright/test').Page} page
 */
function CatalogPageForCart(page) {
  return {
    async addToCart(bookTitle) {
      await page.goto('/');
      const card = page.locator('app-book-card').filter({ hasText: bookTitle });
      await card.getByRole('button', { name: 'Add to Cart' }).click();
    },
  };
}
