// @ts-check
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login-page');
const { HeaderPage } = require('../pages/header-page');
const { ensureUser, requestJson, getBooks } = require('../utils/api-helpers');
const { generateUsername } = require('../utils/data-generator');

const BASE_URL = process.env.BASE_URL;

const VALID_PASSWORD = process.env.TEST_USER_PASSWORD;
if (!VALID_PASSWORD) {
  throw new Error('TEST_USER_PASSWORD is not set — copy .env.example to .env (see docs/test-data-management.md)');
}

let account;

test.beforeAll(async () => {
  // Ceiling for account setup. ensureUser() bounds its own retries and budget,
  // so this only covers slow network calls — it is not a workaround for a
  // backend that fails to create accounts.
  test.setTimeout(120_000);
  account = await ensureUser(BASE_URL, () => ({
    username: generateUsername('api'),
    password: VALID_PASSWORD,
    firstName: 'QA',
    lastName: 'Api',
    gender: 'Male',
  }));
});

/** Logs the shared account in via the API and returns the decoded JWT claims + token. */
async function loginAndGetClaims() {
  const { status, body } = await requestJson('POST', `${BASE_URL}/api/login`, {
    username: account.username,
    password: account.password,
  });
  expect(status, 'login round-trip must succeed').toBe(200);
  const token = JSON.parse(body).token;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  return { token, payload };
}

/**
 * Resolves the shared account's numeric userId from its JWT claim
 * (payload["http://schemas.../identity/claims/UserId"] or "UserId").
 */
function userIdFromClaims(payload) {
  const claim = Object.entries(payload).find(([key]) => /userid/i.test(key));
  return claim ? Number(claim[1]) : NaN;
}

// ---------------------------------------------------------------------------
// Always-runnable: reads + auth + input validation (no catalog needed).
// All tests hit the API directly — no UI dependency.
// ---------------------------------------------------------------------------
test.describe('API — always-runnable', () => {
  test('API-CAT-01: GetCategoriesList returns the 5 shop categories with a stable shape', async () => {
    const { status, body } = await requestJson('GET', `${BASE_URL}/api/Book/GetCategoriesList`);

    expect(status).toBe(200);
    const categories = JSON.parse(body);
    expect(categories).toHaveLength(5);
    for (const category of categories) {
      expect(category.categoryId).toEqual(expect.any(Number));
      expect(category.categoryName).toEqual(expect.any(String));
    }
    expect(categories.map((c) => c.categoryName).sort()).toEqual(
      ['Biography', 'Fantasy', 'Fiction', 'Mystery', 'Romance'].sort()
    );
  });

  test('API-AUTH-01: login with a wrong password returns 401', async () => {
    const { status } = await requestJson('POST', `${BASE_URL}/api/login`, {
      username: account.username,
      password: 'Wrong@9999',
    });

    expect(status).toBe(401);
  });

  test('API-AUTH-02: login returns a JWT whose claims identify the user', async () => {
    const { token, payload } = await loginAndGetClaims();

    expect(token.split('.')).toHaveLength(3);
    expect(payload.name).toBe(account.username);
    expect(userIdFromClaims(payload)).toEqual(expect.any(Number));
  });

  test('API-AUTH-03: username matching is case-insensitive (observed server behavior)', async () => {
    // KNOWN OBSERVATION: the backend matches usernames case-insensitively.
    // Pinned here so a future hardening of the server is caught deliberately.
    const { status } = await requestJson('POST', `${BASE_URL}/api/login`, {
      username: account.username.toUpperCase(),
      password: account.password,
    });

    expect(status).toBe(200);
  });

  test('API-USER-01: validateUserName distinguishes taken vs available names (and has a whitespace quirk)', async () => {
    const taken = await requestJson('GET', `${BASE_URL}/api/user/validateUserName/admin`);
    const fresh = await requestJson('GET', `${BASE_URL}/api/user/validateUserName/${generateUsername('api-check')}`);
    // KNOWN OBSERVATION: the endpoint compares raw strings — ' admin ' (URL-
    // encoded spaces) reports an existing name as available.
    const spaced = await requestJson('GET', `${BASE_URL}/api/user/validateUserName/${encodeURIComponent(' admin ')}`);

    expect(taken.status).toBe(200);
    expect(taken.body).toBe('false');
    expect(fresh.body).toBe('true');
    expect(spaced.body).toBe('true'); // quirk: not trimmed
  });

  for (const [label, payload] of Object.entries({
    badGender: { gender: 'Robot' },
    mismatchedConfirm: { confirmPassword: 'Other@1234' },
  })) {
    test(`API-USER-02: registration rejects ${label} with 400`, async () => {
      const base = {
        firstName: 'QA',
        lastName: 'Api',
        username: generateUsername('api-neg'),
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
        gender: 'Male',
      };
      const { status } = await requestJson('POST', `${BASE_URL}/api/user`, { ...base, ...payload });

      expect(status).toBe(400);
    });
  }

  test('API-USER-03: registration with empty body is rejected with 400', async () => {
    // The backend now validates required fields (firstName, lastName, username,
    // password, confirmPassword, gender) and rejects an empty body.
    const { status } = await requestJson('POST', `${BASE_URL}/api/user`, {});

    expect(status).toBe(400);
  });

  test('API-CART-01: guest carts are readable without authentication', async () => {
    // OBSERVATION: the demo backend persists cart state globally — arbitrary
    // numeric userIds may already have cart items from previous test runs or
    // manual usage. This is shared public state, not a per-run isolated fixture.
    const arbitraryGuestId = `${Date.now()}${process.pid || 0}${Math.floor(Math.random() * 100000)}`;
    const { status, body } = await requestJson('GET', `${BASE_URL}/api/ShoppingCart/${arbitraryGuestId}`);

    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual(expect.any(Array));
  });

  test('API-CART-02: AddToCart accepts a nonexistent bookId and stores book:null (known data bug)', async () => {
    // KNOWN BUG (verified 2026-10-11): the cart endpoint does not validate the
    // book reference — it stores {"book":null,"quantity":N}, which is exactly
    // the payload that leaves the cart UI spinning forever. Demo backend persists
    // these null entries globally; they accumulate across runs.
    const arbitraryGuestId = `${Date.now()}${process.pid || 0}${Math.floor(Math.random() * 100000)}`;
    const add = await requestJson('POST', `${BASE_URL}/api/ShoppingCart/AddToCart/${arbitraryGuestId}/999999`);

    expect(add.status).toBe(200);
    const cart = JSON.parse(add.body);
    expect(cart).toEqual(expect.arrayContaining([expect.objectContaining({ book: null })]));
  });

  test('API-SEC-01: order placement, orders and wishlist toggling require authentication', async () => {
    const guestId = generateUsername('guest3').replace(/\D/g, '');
    const orders = await requestJson('GET', `${BASE_URL}/api/Order/${guestId}`);
    const checkout = await requestJson('POST', `${BASE_URL}/api/CheckOut/${guestId}`, {
      orderDetails: [],
      cartTotal: 0,
    });
    const wishlistToggle = await requestJson('POST', `${BASE_URL}/api/Wishlist/ToggleWishlist/${guestId}/1`);

    expect(orders.status).toBe(401);
    expect(checkout.status).toBe(401);
    expect(wishlistToggle.status).toBe(401);
  });

  test('API-SEC-02 (known issue): wishlist contents are readable without any authentication', async () => {
    // KNOWN ISSUE: GET /api/Wishlist/{userId} answers 200 for arbitrary user
    // ids with no token — any visitor can enumerate other users' wishlists.
    const { status } = await requestJson('GET', `${BASE_URL}/api/Wishlist/1`);

    expect(status).toBe(200);
  });

  test('API-SEC-03 (known issue, IDOR): a foreign user id can be addressed with our own token', async () => {
    // KNOWN ISSUE (verified 2026-10-03): /api/Order/{userId} only checks that
    // A token exists, not WHOSE it is — user A's token can read user B's
    // orders (Insecure Direct Object Reference). Pinned so the fix is noticed.
    test.info().annotations.push({
      type: 'known-issue',
      description: 'IDOR: /api/Order/{userId} trusts the path userId, not the JWT subject.',
    });
    const { token } = await loginAndGetClaims();
    const foreignOrders = await requestJson('GET', `${BASE_URL}/api/Order/1`, undefined, token);

    expect(foreignOrders.status).toBe(200);
    expect(JSON.parse(foreignOrders.body)).toEqual(expect.any(Array));
  });

  test('API-SEC-04 (known issue): another user\'s cart can be cleared without authentication', async () => {
    // KNOWN ISSUE: DELETE /api/ShoppingCart/{userId} has no authorization —
    // any visitor can wipe any cart. Pinned so the fix is noticed.
    test.info().annotations.push({
      type: 'known-issue',
      description: 'Missing authorization on DELETE /api/ShoppingCart/{userId}.',
    });
    const { status } = await requestJson('DELETE', `${BASE_URL}/api/ShoppingCart/${generateUsername('guest4').replace(/\D/g, '')}`);

    expect(status).toBe(200);
  });

  test('API-UI-01: the UI login consumes exactly this /api/login response', async ({ page }) => {
    // Single, justified waitForResponse: proves the UI and the API agree on
    // the login contract (200 + token) and the header reflects the response.
    const loginPage = new LoginPage(page);
    const header = new HeaderPage(page);

    const loginResponsePromise = page.waitForResponse(
      (response) => response.url().toLowerCase().includes('/api/login') && response.request().method() === 'POST'
    );

    await loginPage.goto();
    await loginPage.login(account.username, account.password);

    const response = await loginResponsePromise;
    expect(response.status()).toBe(200);
    expect(JSON.parse(await response.text()).token).toEqual(expect.any(String));
    await expect(header.userMenu(account.username)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Catalog-dependent API tests — auto-skipped while /api/Book is down.
// ---------------------------------------------------------------------------
test.describe('API — catalog data', () => {
  let books;

  test.beforeAll(async () => {
    books = await getBooks(BASE_URL);
    test.skip(
      books === null,
      'Catalog API (/api/Book) is down or empty — known demo outage; this suite runs automatically once it recovers'
    );
  });

  test('API-BOOK-01: the catalog returns a well-formed book list', async () => {
    const { status, body } = await requestJson('GET', `${BASE_URL}/api/Book`);

    expect(status).toBe(200);
    const list = JSON.parse(body);
    expect(list.length).toBeGreaterThan(0);
    const ids = new Set();
    for (const book of list) {
      expect(book.bookId).toEqual(expect.any(Number));
      expect(book.title).toEqual(expect.any(String));
      expect(book.author).toEqual(expect.any(String));
      expect(book.category).toEqual(expect.any(String));
      expect(book.price).toBeGreaterThan(0);
      ids.add(book.bookId);
    }
    expect(ids.size).toBe(list.length); // ids are unique
  });

  test('API-BOOK-02: GET /api/Book/{id} returns the same data as the catalog entry', async () => {
    const book = books[0];
    const { status, body } = await requestJson('GET', `${BASE_URL}/api/Book/${book.bookId}`);

    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      bookId: book.bookId,
      title: book.title,
      author: book.author,
      category: book.category,
      price: book.price,
    });
  });

  test('API-BOOK-03: GET /api/Book/{id} with an unknown id returns 404', async () => {
    const { status } = await requestJson('GET', `${BASE_URL}/api/Book/999999`);

    expect(status).toBe(404);
  });

  test('API-BOOK-04: GetSimilarBooks returns a list for an existing book', async () => {
    const { status, body } = await requestJson('GET', `${BASE_URL}/api/Book/GetSimilarBooks/${books[0].bookId}`);

    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual(expect.any(Array));
  });

  test('API-CART-03: full cart lifecycle over the API (add, read, update, remove, clear)', async ({ page }) => {
    const guestId = Date.now() % 1_000_000_000; // numeric, fresh per run
    const book = books[0];

    // Add twice -> quantity 2.
    const add = await requestJson('POST', `${BASE_URL}/api/ShoppingCart/AddToCart/${guestId}/${book.bookId}`);
    await requestJson('POST', `${BASE_URL}/api/ShoppingCart/AddToCart/${guestId}/${book.bookId}`);
    expect(add.status).toBe(200);

    let cart = JSON.parse((await requestJson('GET', `${BASE_URL}/api/ShoppingCart/${guestId}`)).body);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].book.bookId).toBe(book.bookId);
    expect(cart[0].book.title).toBe(book.title);
    expect(cart[0].book.price).toBe(book.price);

    // PUT updates the quantity (direction observed in app: +1 per call).
    const updated = await requestJson('PUT', `${BASE_URL}/api/ShoppingCart/${guestId}/${book.bookId}`);
    expect(updated.status).toBe(200);
    cart = JSON.parse((await requestJson('GET', `${BASE_URL}/api/ShoppingCart/${guestId}`)).body);
    expect(cart[0].quantity).toBe(3);

    // DELETE the single item.
    const removed = await requestJson('DELETE', `${BASE_URL}/api/ShoppingCart/${guestId}/${book.bookId}`);
    expect(removed.status).toBe(200);
    cart = JSON.parse((await requestJson('GET', `${BASE_URL}/api/ShoppingCart/${guestId}`)).body);
    expect(cart).toHaveLength(0);

    // DELETE clears everything (idempotent on an empty cart).
    const cleared = await requestJson('DELETE', `${BASE_URL}/api/ShoppingCart/${guestId}`);
    expect(cleared.status).toBe(200);
  });
});
