// @ts-check
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const execFileAsync = promisify(execFile);

// curl's null device is platform-specific; 'NUL' is only a device on Windows
// and would instead create a file called NUL on the Linux runners.
const NULL_SINK = process.platform === 'win32' ? 'NUL' : '/dev/null';

// The demo's write path (POST /api/user) frequently answers 200 without
// persisting the account. Retry only a few times, within a fixed budget, so a
// broken backend surfaces as one clear error in well under a minute instead of
// stalling a whole CI job (previously: 8 attempts × 15s against a 120s hook).
const REGISTRATION_ATTEMPTS = 3;
const SETUP_BUDGET_MS = 60_000;
const RETRY_PAUSE_MS = 5_000;
const CACHE_LOGIN_ATTEMPTS = 3;
const CONFIGURED_LOGIN_ATTEMPTS = 3;
const DEFAULT_CACHE_NAME = 'local-user';

// CI runners start with no cached credentials (test-data/.<cacheName>.json is
// gitignored), so they must not depend on the demo's broken write path. When
// TEST_USER_USERNAME is set, that existing account is used instead of
// registering a new one — see docs/test-data-management.md §2.
const CONFIGURED_USERNAME = process.env.TEST_USER_USERNAME;

/**
 * API helpers for test-data setup.
 * see docs/test-data-management.md — accounts are created via API, not UI.
 *
 * ⚠️ Workaround (verified 2026-10-03): the demo's write path (POST
 * /api/user, /api/login) only succeeds during intermittent windows and
 * frequently answers 200 without persisting, regardless of HTTP client.
 * Setup therefore verifies every account with a real login round-trip,
 * caches working credentials in test-data/.<cacheName>.json (gitignored),
 * and reuses the same account across runs.
 */

/**
 * Runs curl and returns stdout, or null on connection-level failure.
 * curl is used (instead of Playwright's request fixture) because it proved
 * the most reliable client against the demo's flaky edge.
 * @param {string[]} args
 * @returns {Promise<string | null>}
 */
async function curl(args) {
  try {
    const { stdout } = await execFileAsync('curl', args, { timeout: 40_000, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Performs an HTTP request and returns only the status code (null on failure).
 * @param {'GET' | 'POST'} method
 * @param {string} url
 * @param {object} [body]
 * @returns {Promise<number | null>}
 */
async function requestStatus(method, url, body) {
  const args = ['-s', '-m', '30', '-X', method, '-o', NULL_SINK, '-w', '%{http_code}'];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  args.push(url);
  const out = await curl(args);
  return out === null ? null : Number(out);
}

/**
 * Performs an HTTP request via curl and returns { status, body }.
 * curl is used because the demo's edge unreliably drops Node-side writes.
 * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} method
 * @param {string} url
 * @param {object} [body]
 * @param {string} [authToken] Bearer token to send
 * @returns {Promise<{ status: number | null, body: string | null }>}
 */
async function requestJson(method, url, body, authToken) {
  const args = ['-s', '-m', '30', '-X', method, '-w', '\n%{http_code}'];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  if (authToken) args.push('-H', `Authorization: Bearer ${authToken}`);
  args.push(url);
  const out = await curl(args);
  if (out === null) return { status: null, body: null };
  const separator = out.lastIndexOf('\n');
  return {
    status: Number(out.slice(separator + 1)),
    body: separator === -1 ? '' : out.slice(0, separator),
  };
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Caches credentials for later runs. Best effort: a read-only checkout must not
 * turn a working account into a failure.
 * @param {string} cacheFile
 * @param {{ username: string, password: string }} user
 */
function remember(cacheFile, user) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(user, null, 2));
  } catch {
    // Cache is an optimisation, never a requirement.
  }
  return user;
}

/**
 * Ensures a working test account exists and returns its credentials, in order:
 * 1. TEST_USER_USERNAME when configured — an existing account (used by CI,
 *    which has no cache and cannot rely on the demo's broken registration).
 * 2. The cached account for this spec, when it still logs in.
 * 3. A freshly registered account, within a bounded retry budget.
 * Every tier is validated by a real login round-trip, never by the response of
 * the registration call (the demo answers 200 without persisting the user).
 *
 * @param {string} baseURL
 * @param {() => { username: string, password: string, firstName: string, lastName: string, gender: string }} userFactory
 * @param {string} [cacheName] Separate cache per spec, so specs that mutate
 *   the account's cart or orders never share an account in parallel runs.
 * @returns {Promise<{ username: string, password: string, firstName: string, lastName: string, gender: string }>}
 */
async function ensureUser(baseURL, userFactory, cacheName = DEFAULT_CACHE_NAME) {
  const cacheFile = path.join(__dirname, '..', 'test-data', `.${cacheName}.json`);
  const password = process.env.TEST_USER_PASSWORD;

  // 1. An explicitly configured account wins: CI supplies a pre-existing one
  //    because POST /api/user does not persist new users there. A configured
  //    account that cannot log in is a configuration error — say so instead of
  //    silently falling back to a registration path that is known to be broken.
  if (CONFIGURED_USERNAME) {
    const configured = { username: CONFIGURED_USERNAME, password };
    for (let attempt = 1; attempt <= CONFIGURED_LOGIN_ATTEMPTS; attempt++) {
      if ((await loginStatus(baseURL, configured)) === 200) return remember(cacheFile, configured);
      if (attempt < CONFIGURED_LOGIN_ATTEMPTS) await sleep(RETRY_PAUSE_MS);
    }
    throw new Error(
      `Configured test account "${CONFIGURED_USERNAME}" (TEST_USER_USERNAME) cannot log in ` +
        `with TEST_USER_PASSWORD after ${CONFIGURED_LOGIN_ATTEMPTS} attempts. ` +
        'Fix the account/secret, or unset TEST_USER_USERNAME to fall back to API registration.'
    );
  }

  // 2. Reuse the cached account when it still works. The verification login is
  //    retried — the demo's edge drops requests even when the account is fine,
  //    and one flaky 401 must not discard a good account.
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      for (let attempt = 1; attempt <= CACHE_LOGIN_ATTEMPTS; attempt++) {
        if ((await loginStatus(baseURL, cached)) === 200) return cached;
        if (attempt < CACHE_LOGIN_ATTEMPTS) await sleep(3_000);
      }
    } catch {
      // unreadable cache — create a fresh account below
    }
  }

  // 3. Register a fresh account, bounded in both attempts and wall clock. Only
  //    a real login round-trip counts as success: the demo answers 200 on
  //    POST /api/user without persisting the user, so the response proves nothing.
  const startedAt = Date.now();
  const user = userFactory();
  let lastStatus = null;
  for (let attempt = 1; attempt <= REGISTRATION_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt > SETUP_BUDGET_MS) break;
    lastStatus = await requestStatus('POST', `${baseURL}/api/user`, { ...user, confirmPassword: user.password });
    if ((await loginStatus(baseURL, user)) === 200) return remember(cacheFile, user);
    if (attempt < REGISTRATION_ATTEMPTS) await sleep(RETRY_PAUSE_MS);
  }
  throw new Error(
    `Test account creation failed after ${REGISTRATION_ATTEMPTS} attempts ` +
      `(last POST /api/user -> ${lastStatus}, then login != 200). ` +
      "The demo's registration write path is not persisting users; " +
      'set TEST_USER_USERNAME to an existing account (see docs/test-data-management.md §2).'
  );
}

/**
 * @param {string} baseURL
 * @param {{ username: string, password: string }} user
 * @returns {Promise<number | null>}
 */
async function loginStatus(baseURL, user) {
  return requestStatus('POST', `${baseURL}/api/login`, { username: user.username, password: user.password });
}

/**
 * Reads the book catalog. Returns the list, or null when the API is down or
 * empty (the demo's catalog has known outages — suites use this as a gate).
 * @param {string} baseURL
 * @returns {Promise<Array<{ bookId: number, title: string, author: string, category: string, price: number }> | null>}
 */
async function getBooks(baseURL) {
  const out = await curl(['-s', '-m', '30', `${baseURL}/api/Book`]);
  if (!out) return null;
  try {
    const books = JSON.parse(out);
    return Array.isArray(books) && books.length > 0 ? books : null;
  } catch {
    return null;
  }
}

/**
 * Reads the category list, or null when the API fails.
 * @param {string} baseURL
 * @returns {Promise<Array<{ categoryId: number, categoryName: string }> | null>}
 */
async function getCategories(baseURL) {
  const out = await curl(['-s', '-m', '30', `${baseURL}/api/Book/GetCategoriesList`]);
  if (!out) return null;
  try {
    const categories = JSON.parse(out);
    return Array.isArray(categories) && categories.length > 0 ? categories : null;
  } catch {
    return null;
  }
}

module.exports = { ensureUser, requestStatus, requestJson, getBooks, getCategories };
