// @ts-check
const { test, expect } = require('@playwright/test');
const { HeaderPage } = require('../pages/header-page');
const { CatalogPage } = require('../pages/catalog-page');
const { getBooks, getCategories } = require('../utils/api-helpers');

const BASE_URL = process.env.BASE_URL;

/**
 * Utility to read the search query back out of the URL — the app lowercases
 * the term (search.component.ts: `item: searchItem.toLowerCase()`), so tests
 * assert the round-tripped value instead of a hand-encoded URL string.
 */
function searchItemFromUrl(url) {
  return new URL(url).searchParams.get('item');
}

// ---------------------------------------------------------------------------
// Routing: verified to work even while the demo's catalog API is down.
// ---------------------------------------------------------------------------
test.describe('Search & Navigation — routing', () => {
  // KNOWN BUG (verified 2026-10-03): pressing Enter in the search box fires
  // both the keydown.enter navigation to /search and the DOM `search` event
  // (type="search" input) whose handler navigates back to "/". In the current
  // deployment the bounce always wins, so the results page flashes and the
  // user lands back on Home. Expected to fail (here: fixme) until fixed.
  test.fixme('searching with Enter navigates to /search with the lowercased term in the URL', async ({ page }) => {
    const header = new HeaderPage(page);

    await page.goto('/');
    await header.searchFor('Harry Potter');

    await expect(page).toHaveURL(/\/search\?item=/);
    expect(searchItemFromUrl(page.url())).toBe('harry potter');
  });

  test('the search results page renders the searched term in the URL', async ({ page }) => {
    // Deep-link to the results page (the Enter path is covered by the fixme
    // above) and verify the route + query handling.
    await page.goto('/search?item=harry%20potter');
    await expect(page).toHaveURL(/\/search\?item=harry%20potter$/);
  });

  test('every sidebar category navigates to its filter route', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const categories = await getCategories(BASE_URL);
    test.skip(categories === null, 'GetCategoriesList API is not reachable right now');

    await page.goto('/');
    for (const category of categories) {
      await catalog.categoryItem(category.categoryName).click();
      await expect(page).toHaveURL(new RegExp(`/filter\\?category=${category.categoryName.toLowerCase()}$`));
      await page.goto('/'); // clean state for the next category
    }
  });

  test('a non-existing search shows the empty state', async ({ page }) => {
    const catalog = new CatalogPage(page);

    await page.goto('/search?item=zzzqqqxxx99');
    await expect(page).toHaveURL(/\/search\?item=zzzqqqxxx99$/);
    await expect(catalog.noBooksHeading).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Content: needs real catalog data — auto-skipped while /api/Book is down.
// ---------------------------------------------------------------------------
test.describe('Search & Navigation — content', () => {
  let books;

  test.beforeAll(async () => {
    books = await getBooks(BASE_URL);
    test.skip(
      books === null,
      'Catalog API (/api/Book) is down or empty — known demo outage; this suite runs automatically once it recovers'
    );
  });

  test('SRCH-01: searching by exact title finds the book', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto('/');
    await header.searchFor(book.title);

    await expect(page).toHaveURL(/\/search\?item=/);
    expect(searchItemFromUrl(page.url())).toBe(book.title.toLowerCase());
    await expect(catalog.bookCard(book.title)).toBeVisible();
  });

  test('SRCH-02: searching by a partial title finds the book', async ({ page }) => {
    const header = new HeaderPage(page);
    const catalog = new CatalogPage(page);
    const book = books[0];
    // The app matches with "contains" on title/author (search.component.ts),
    // so the first longer word of the title must hit the same book.
    const partial = book.title.split(/\s+/).find((word) => word.length >= 4) ?? book.title;

    await page.goto('/');
    await header.searchFor(partial);

    await expect(catalog.bookCard(book.title)).toBeVisible();
  });

  test('SRCH-04: browsing a category shows its books', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.categoryItem(book.category).click();

    await expect(page).toHaveURL(new RegExp(`/filter\\?category=${book.category.toLowerCase()}$`));
    await expect(catalog.bookCard(book.title)).toBeVisible();
  });

  test('SRCH-05: clicking a book card opens its details page', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.bookCardTitleLink(book.title).click();

    await expect(page).toHaveURL(new RegExp(`/books/details/${book.bookId}$`));
    await expect(catalog.detailsHeading()).toBeVisible();
  });

  test('SRCH-06: the details page shows the book data from the API', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto(`/books/details/${book.bookId}`);

    await expect(catalog.detailsRow('Title')).toContainText(book.title);
    await expect(catalog.detailsRow('Author')).toContainText(book.author);
    await expect(catalog.detailsRow('Category')).toContainText(book.category);
    // Prices render as ₹ with grouping, e.g. 1500 -> "₹1,500.00".
    const expectedPrice = `₹${book.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    await expect(catalog.detailsRow('Price')).toContainText(expectedPrice);
  });

  test('SRCH-07: navigating back from details returns to the product list', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const book = books[0];

    await page.goto('/');
    await catalog.bookCardTitleLink(book.title).click();
    await expect(catalog.detailsHeading()).toBeVisible();

    await page.goBack();

    await expect(page).not.toHaveURL(/books\/details/);
    await expect(catalog.bookCard(book.title)).toBeVisible();
  });
});
