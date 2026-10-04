# BookCart — Test Data & Environment Management

> Goal: tests that are **independent, repeatable, and never depend on data left by a previous run**.
> Grounded in the app's real API contract (see `docs/application-analysis.md`).
> Date: 2026-10-03

---

## 1. What test data each module needs

| Module | Data needed | Source |
|---|---|---|
| **Registration** | firstName, lastName, **username (unique per run)**, valid password, confirm-password, gender | Profile fields: `test-data/users.json` · Password: `process.env.TEST_USER_PASSWORD` · Username: generated dynamically |
| Registration (negative) | 4 policy-violating passwords + 1 mismatch value + a taken username | `test-data/passwords.json` (static) · taken username: `admin` (hardcoded constant) |
| **Login** | One valid account per worker + wrong-password value + a nonexistent username | Account **created via API** before tests run · wrong password: static string · nonexistent: generated like a real username |
| **Cart** | A real book (id, title, price) with known values; quantity numbers | **Selected dynamically from `GET /api/Book`** at run start — never hardcoded |
| **Checkout** | Shipping address (name, 2 address lines, pincode, state) + invalid pincode variants | `test-data/checkout-address.json` (static) |

> 📌 Correction recorded from the source-code phase: the checkout form has **no payment fields** — only a shipping address. So no card data is needed anywhere.

### Why books are dynamic, not static

The demo catalog already lost its data once (live `GET /api/Book` → 500, cart rows with `book: null`). A hardcoded `bookId: 1` or `price: 1500` would break on every demo reset. Instead, each run:

1. Calls `GET /api/Book` (health gate).
2. Picks one in-stock book programmatically (e.g. the first result).
3. Reads title and price **from the API response** and uses them for UI assertions.

This makes cart/checkout tests immune to data resets — they assert *consistency* (UI shows what the API returned), not *specific values*.

---

## 2. Username / password / test-user management

**Username — always dynamic:**

```
qa_<purpose>_<epoch>_<workerIndex>      e.g.  qa_login_1759512345_3
```

- Purpose tag (`login`, `reg`, `cart`…) makes failures and leftover data easy to attribute.
- Epoch + `workerIndex` guarantees uniqueness under `fullyParallel: true`.
- Generated in one helper (`utils/data-generator.js`), never inline in tests.

**Password — one shared, from env:**

- `TEST_USER_PASSWORD` lives in `.env` (local) / CI secret (CI). Committed files only ever see `.env.example` with a placeholder.
- Policy-compliant by construction (`Test@1234` shape satisfies the regex).

**Account lifecycle:**

- Login/Cart/Checkout tests get their account from an **API fixture** (`POST /api/User` in a worker-scoped fixture) — the UI registration path is exercised only by REG-01.
- UI-created data (the REG-01 user) is never reused by other tests — tests never depend on each other's leftovers.

---

## 3. Secrets policy — nothing sensitive in Git

| Item | Where it lives | Committed? |
|---|---|---|
| `BASE_URL` | `.env` (values) / `.env.example` (placeholder) | `.env` no · `.env.example` yes |
| `TEST_USER_PASSWORD` | `.env` / CI secret | ❌ never |
| Profile fields (names, gender) | `test-data/*.json` | ✅ yes — not sensitive |
| Policy fixtures (weak passwords, addresses) | `test-data/*.json` | ✅ yes — test inputs, not secrets |

`.env` is already covered by `.gitignore`. Rule of thumb: **if a value would matter on a real system, it goes in env; if it only shapes a test case, it goes in JSON.**

---

## 4. `.env` in Playwright — correct usage

Playwright does **not** load `.env` by itself. One line in `playwright.config.js` (already applied):

```js
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

module.exports = defineConfig({
  baseURL: process.env.BASE_URL || 'https://bookcart.azurewebsites.net',
  ...
});
```

- Every value is then read anywhere via `process.env.X` — in config **and** in tests/fixtures.
- `ENV_FILE` lets you switch environments without code changes:

```bash
npx playwright test                          # default: .env
ENV_FILE=.env.staging npx playwright test    # another environment
```

- **CI has no `.env` file** — CI providers set environment variables directly (GitHub Actions → *Settings → Secrets and variables → Actions*); `dotenv` simply leaves existing variables untouched, so the same config works everywhere.
- On Windows Git Bash / PowerShell, `ENV_FILE=... npx playwright test` works in Git Bash; for `package.json` scripts prefer [`cross-env`](https://www.npmjs.com/package/cross-env) if needed later.

---

## 5. Static vs dynamic — the decision matrix

| Data | Static or dynamic? | Why |
|---|---|---|
| Username | **Dynamic** | Unique per run/worker → parallel-safe, no collisions with leftover data |
| Book selection (id/title/price) | **Dynamic** (from API) | Demo catalog resets; we assert consistency, not fixed values |
| Search terms | **Dynamic** (derive from a real book title via API) | Same reason |
| Password (valid) | **Static via env** | One shared value; policy-compliant by construction |
| Weak-password variants | **Static** (`passwords.json`) | They test the *rule*, not the site's data |
| Checkout address + invalid pincodes | **Static** (`checkout-address.json`) | Form fixtures, no dependence on site state |
| Taken username (`admin`) | **Static constant** | An intentionally existing account |
| Expected error texts | **Static constants** (in Page Objects) | Product-owned strings (incl. the "Password do not match" typo) |

---

## 6. Cleanup & reset

Key constraint discovered in the analysis: **the API has no delete-user and no delete-order endpoint.** So cleanup is designed around that reality:

| Data | Created by | Reset strategy |
|---|---|---|
| Guest cart / localStorage | Any UI action as guest | ✅ **Automatic** — every Playwright test runs in a fresh browser context (clean `localStorage`, new guest `userId`) |
| Test users | API fixture / REG-01 | ⚠️ **Cannot be deleted** → made harmless by unique usernames (accumulate, never collide). A periodic note in the README acknowledges demo-data growth |
| User cart after non-purchase tests | addToCart calls | Teardown in the cart fixture: `DELETE /api/ShoppingCart/{userId}` when the test didn't end with a purchase |
| User cart after purchase | Checkout itself | ✅ Emptied by the app — asserted in CO-03 |
| Wishlist toggles | Wishlist actions | `DELETE /api/Wishlist/{userId}` in teardown if used |
| Orders | Checkout tests | Cannot delete → tests read orders **filtering by the orderId captured during CO-03**, never "row count" assertions |
| Books | Tests never create books | Read-only usage — no cleanup needed |

**Principle:** prefer *no shared state* (fresh contexts, unique users) over after-the-fact cleanup; cleanup calls are only a safety net for cart/wishlist.

---

## 7. File structure

```
bookstore-e2e-automation/
├── .env                        # local values — GITIGNORED (already)
├── .env.example                # committed template with placeholders
├── playwright.config.js        # loads dotenv; baseURL comes from env
├── test-data/                  # static, non-sensitive fixtures (committed)
│   ├── users.json              # profile fields for API-created users
│   ├── passwords.json          # policy-violating password variants (REG-02/03)
│   └── checkout-address.json   # valid address + invalid pincode variants
└── utils/                      # (added in the automation phase, designed here)
    ├── data-generator.js       # unique username generator (qa_<tag>_<epoch>_<worker>)
    └── api-helpers.js          # createUser / login / addToCart / clearCart via API
```

`test-data/` holds **data**, `utils/` holds **behavior**. Tests never hardcode any of it.

---

## 8. Environment pre-flight (health gate)

Because this is a public demo that already broke once, every run starts cheap and explicit:

1. `GET BASE_URL` reachable → else abort with a clear message.
2. `GET /api/Book` → 200 → catalog suites run; non-200 → catalog/search/cart/checkout suites are **skipped with a reason**, login/registration suites still run.

This turns today's live outage from "50 mysterious failures" into "1 clear, actionable signal".
