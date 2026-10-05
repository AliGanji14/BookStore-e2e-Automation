// @ts-check
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const execFileAsync = promisify(execFile);

const REGISTRATION_ATTEMPTS = 8;
const RETRY_PAUSE_MS = 15_000;
const CACHE_FILE = path.join(__dirname, '..', 'test-data', '.local-user.json');

/**
 * API helpers for test-data setup.
 * see docs/test-data-management.md — accounts are created via API, not UI.
 *
 * ⚠️ Workaround (verified 2026-10-03): the demo's write path (POST
 * /api/user, /api/login) only succeeds during intermittent windows and
 * frequently answers 200 without persisting, regardless of HTTP client.
 * Setup therefore verifies every account with a real login round-trip,
 * caches working credentials in test-data/.local-user.json (gitignored),
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
  const args = ['-s', '-m', '30', '-X', method, '-o', 'NUL', '-w', '%{http_code}'];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  args.push(url);
  const out = await curl(args);
  return out === null ? null : Number(out);
}

/**
 * Ensures a working test account exists and returns its credentials.
 * - Reuses the cached account when it still logs in.
 * - Otherwise registers a fresh one, retrying across the demo's outage
 *   windows until a real login round-trip succeeds.
 *
 * @param {string} baseURL
 * @param {() => { username: string, password: string, firstName: string, lastName: string, gender: string }} userFactory
 * @returns {Promise<{ username: string, password: string, firstName: string, lastName: string, gender: string }>}
 */
async function ensureUser(baseURL, userFactory) {
  // 1. Reuse the cached account when it still works.
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if ((await loginStatus(baseURL, cached)) === 200) return cached;
    } catch {
      // unreadable cache — create a fresh account below
    }
  }

  // 2. Register a fresh account; only trust a successful login round-trip.
  const user = userFactory();
  for (let attempt = 0; attempt < REGISTRATION_ATTEMPTS; attempt++) {
    await requestStatus('POST', `${baseURL}/api/user`, { ...user, confirmPassword: user.password });
    if ((await loginStatus(baseURL, user)) === 200) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(user, null, 2));
      return user;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  }
  throw new Error(`Test account creation failed after ${REGISTRATION_ATTEMPTS} attempts (demo write path down?)`);
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

module.exports = { ensureUser, requestStatus, getBooks, getCategories };
