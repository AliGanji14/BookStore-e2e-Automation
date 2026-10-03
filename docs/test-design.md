# BookCart — E2E Test Design

> Derived from `docs/application-analysis.md` (black-box exploration + Swagger API contract).
> Scope: Registration, Login, Search & Navigation, Shopping Cart, Checkout.
> Design principle: cover the real critical paths only — no filler tests.
> Date: 2026-10-03

**Priority key:** Critical = money/auth pipeline breaks · High = core user operation · Medium = important but not blocking.
**A = recommended for Playwright automation.**

---

## 1. Registration (`/register`)

| ID | Scenario | Test Case | Precondition | Steps | Expected Result | Priority | Type | A |
|---|---|---|---|---|---|---|---|---|
| REG-01 | Successful registration | Register with valid unique data | Username not already taken | 1) Open `/register` 2) Fill First name, Last name, unique User name 3) Enter valid password in both password fields (e.g. `Test@1234` — meets policy) 4) Select a Gender 5) Click Register | Account is created; user is redirected to Login (or logged in); new credentials can log in successfully | **Critical** | Positive | ✅ |
| REG-02 | Password policy enforced | Submit with a password violating the policy (data-driven: 7 chars / no uppercase / no lowercase / no digit) | Registration page open | 1) Fill all fields with a valid state 2) Enter the violating password in both fields 3) Click Register | Exact message shown: "Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number"; no account created (`POST /api/User` not called) | **High** | Negative | ✅ (data-driven) |
| REG-03 | Confirm-password mismatch | Password and Confirm Password differ | Registration page open | 1) Fill all fields 2) Password = `Test@1234`, Confirm = `Test@12345` 3) Click Register | Message "Password do not match" (sic — product typo) shown under Confirm field; no account created | **High** | Negative | ✅ |
| REG-04 | Duplicate username — live check | Type an already-taken username | Registration page open | 1) Fill other fields validly 2) Type `admin` in User name 3) Wait, do NOT submit | Inline message "User Name is not available" appears without submit | **High** | Negative | ✅ |
| REG-05 | All fields empty | Submit empty registration form | Registration page open | 1) Click Register with nothing filled | All required fields marked invalid (red outline); no API call sent | Medium | Negative | ✅ (cheap, part of form suite) |
| REG-06 | Special characters in username | Register a username with allowed special chars (e.g. `qa.tester_01`) | Username unique | Same steps as REG-01 with that username | Behavior matches documented actual rule (API accepts any non-empty string) — no crash; result recorded as baseline | Medium | Edge Case | ⚠️ optional |

---

## 2. Login (`/login`)

| ID | Scenario | Test Case | Precondition | Steps | Expected Result | Priority | Type | A |
|---|---|---|---|---|---|---|---|---|
| LOG-01 | Successful login | Log in with valid credentials | Account exists (created via API/seed, NOT via UI to stay independent) | 1) Open `/login` 2) Enter valid username + password 3) Click Login | User is logged in: header shows the username (Login button replaced); previous page/home shown | **Critical** | Positive | ✅ |
| LOG-02 | Wrong password | Login with valid user, wrong password | Account exists | 1) Open `/login` 2) Enter valid username + wrong password 3) Click Login | Login is rejected (HTTP 401); user stays on `/login`; **note:** current build shows no visible error message (known UX bug — assert no navigation; raise bug separately) | **Critical** | Negative | ✅ |
| LOG-03 | Nonexistent user | Login with a username that does not exist | — | Same steps as LOG-02 with `no_such_user_xyz` | Same rejection behavior as LOG-02; no information leak about which field was wrong | High | Negative | ✅ (same spec as LOG-02, different data) |
| LOG-04 | Empty form | Submit login with empty fields | — | 1) Open `/login` 2) Click Login without typing | Required fields outlined red; no API call | Medium | Negative | ✅ (cheap) |
| LOG-05 | Password visibility toggle | Eye icon toggles password masking | Login page open | 1) Type a password 2) Click visibility icon 3) Click again | Text visible after first click, masked again after second | Medium | Edge Case | ⚠️ optional (1-line assertion, include only in a "polish" pass) |

---

## 3. Search & Navigation (`/`, `/search`, `/bookdetails`)

> ⚠️ All cases below depend on catalog data being healthy (`GET /api/Book` = 200). A health-check must gate this suite.

| ID | Scenario | Test Case | Precondition | Steps | Expected Result | Priority | Type | A |
|---|---|---|---|---|---|---|---|---|
| SRCH-01 | Search by title | Search for a known book title | Catalog healthy; title known (e.g. from seed) | 1) Type title in header search 2) Press Enter | URL is `/search?item={title}`; page title contains "Search Books"; result cards include the book | **Critical** | Positive | ✅ |
| SRCH-02 | Search by author | Search by author name instead of title | Catalog healthy | Same steps with an author name | Results include books by that author | High | Positive | ✅ |
| SRCH-03 | No results | Search a nonsense query | Catalog healthy | 1) Search `zzzqqqxxx` 2) Enter | Empty-state message "No books found." shown; no crash | High | Negative | ✅ |
| SRCH-04 | Case insensitivity | `HARRY POTTER` vs `harry potter` | Catalog healthy | Run both searches | Same result count for both variants | Medium | Edge Case | ✅ (2 runs of same spec) |
| SRCH-05 | Category filter | Filter by one category | Catalog healthy | 1) On home, click `Fiction` in sidebar | Only Fiction books listed; category highlighted | **High** | Positive | ✅ |
| SRCH-06 | Price filter | Move price slider to a range | Catalog healthy | 1) Adjust slider to a low max price | Only books within the price range listed | Medium | Positive | ⚠️ later (slider interaction is flake-prone; automate after stable locators exist) |
| SRCH-07 | Book details | Open details of a known book | Catalog healthy | 1) Click a known book card on home | Details page `/bookdetails/{id}` shows correct title, author, category, price (₹) | **Critical** | Positive | ✅ |
| SRCH-08 | Malformed search query | Query with spaces & special chars (`harry & potter's`) | Catalog healthy | 1) Search that string 2) Enter | No crash; query correctly URL-encoded in `/search?item=`; page renders a state (results or empty) | Medium | Edge Case | ✅ |

---

## 4. Shopping Cart (`/shopping-cart`)

| ID | Scenario | Test Case | Precondition | Steps | Expected Result | Priority | Type | A |
|---|---|---|---|---|---|---|---|---|
| CART-01 | Add to cart | Add a book from its details page | Catalog healthy; not logged in (guest) | 1) Open a book's details 2) Click Add to Cart | Header badge count 0 → 1; item visible in `/shopping-cart` with correct title & price | **Critical** | Positive | ✅ |
| CART-02 | Add same book twice | Add the same book again | CART-01 state | 1) Add the same book again | Quantity becomes 2 — a second row must NOT be created; badge shows 2 | **High** | Positive | ✅ |
| CART-03 | Update quantity | Change quantity from the cart page | Cart has ≥1 item | 1) Open cart 2) Increase quantity to 3 | Line total and cart total update to price × 3; badge shows 3 | **High** | Positive | ✅ |
| CART-04 | Cart total accuracy | Verify total = Σ(price × qty) | Cart has 2 different books, qty 1 and 2 | 1) Read prices and quantities 2) Read displayed cart total | Displayed total exactly equals the computed sum (financial accuracy) | **Critical** | Positive | ✅ |
| CART-05 | Remove one item | Delete a single line from cart | Cart has 2 lines | 1) Click remove on one line | Line disappears; badge decreases; total recalculates | High | Positive | ✅ |
| CART-06 | Guest cart persists | Cart survives page reload (guest) | Guest has 1 item in cart | 1) Reload `/shopping-cart` | Item still present (localStorage `userId` based cart) | Medium | Edge Case | ✅ |
| CART-07 | Guest cart merge on login | Cart added as guest is preserved after login | Guest cart has 1 item; a valid account exists | 1) Add book as guest 2) Log in 3) Open cart | The guest item is still in the cart (merged via SetShoppingCart), not lost | **Critical** | Positive | ✅ |
| CART-08 | Empty cart | Behavior with an empty cart | Fresh guest / cleared cart | 1) Open `/shopping-cart` | Empty-state shown gracefully; no items, no total, no crash | Medium | Negative | ✅ |

---

## 5. Checkout (`/checkout`)

| ID | Scenario | Test Case | Precondition | Steps | Expected Result | Priority | Type | A |
|---|---|---|---|---|---|---|---|---|
| CO-01 | Auth guard | Direct access to `/checkout` without login | Logged out | 1) Navigate to `/checkout` | Redirected to `/login?returnUrl=%2Fcheckout`; not shown the checkout page | **Critical** | Negative | ✅ |
| CO-02 | Return URL honored | After logging in from the guard redirect | CO-01 state | 1) Log in on the redirected login page | User lands back on `/checkout` (not home) | High | Positive | ✅ |
| CO-03 | Complete purchase (happy path) | Full buy flow end-to-end | Logged in; cart has ≥1 item with known price | 1) Open `/checkout` 2) Review items & total 3) Fill simulated payment fields with valid data 4) Confirm order | Order is placed with an order id / confirmation shown; **cart is emptied afterwards**; order appears in order history | **Critical** | Positive | ✅ |
| CO-04 | Payment form validation | Submit checkout with invalid payment fields | Logged in; cart non-empty | 1) Fill payment fields with invalid data (e.g. incomplete card number) 2) Submit | Form blocks submission with field-level validation; order NOT created | **High** | Negative | ✅ |
| CO-05 | Order history | Verify the order appears in history | CO-03 completed | 1) Open order history for the user | The order from CO-03 is listed with correct items/total/date | Medium | Positive | ✅ |
| CO-06 | Empty-cart checkout | Access checkout with an empty cart | Logged in; cart empty | 1) Navigate to `/checkout` | Handled gracefully (blocked/redirect/empty message) — no crash, no order created | Medium | Edge Case | ✅ |

---

## 6. Automation Decision (what becomes Playwright code)

### ✅ Automate — first wave (P0, ~10 specs)
`REG-01`, `LOG-01`, `LOG-02`, `SRCH-01`, `SRCH-07`, `CART-01`, `CART-04`, `CART-07`, `CO-01`, `CO-03`
→ These are the Critical User Journeys from the analysis. One E2E buy-path spec (CO-03) composes several steps; the others stay small and independent.

### ✅ Automate — second wave (P1, ~12 specs)
`REG-02` (data-driven 4 variants), `REG-03`, `REG-04`, `LOG-03`, `SRCH-02`, `SRCH-03`, `SRCH-05`, `CART-02`, `CART-03`, `CART-05`, `CO-02`, `CO-04`
Plus the cheap form-empty cases (`REG-05`, `LOG-04`) bundled in their module's spec file.

### ⚠️ Automate later / optional (P2)
`SRCH-06` (slider — flake-prone), `LOG-05` (toggle), `REG-06`, plus `CART-06`, `CART-08`, `CO-05`, `CO-06` — include once the core suite is stable.

### 🚫 Do NOT automate
Visual/CSS details, external links (GitHub/Swagger), animations, load/performance — no Playwright value (per analysis §6).

### Test-data & environment rules for automation
1. **Health-check gate:** before catalog-dependent suites, verify `GET /api/Book` returns 200 — otherwise skip with a clear message (the current live outage is the proof this is needed).
2. **Accounts via API, not UI:** create login-fixture users with a `POST /api/User` request in `beforeAll`; UI registration is tested only in REG-01.
3. **Unique usernames:** `qa_<timestamp>` pattern to keep runs parallel-safe.
4. **No assertions on known bugs:** LOG-02 asserts "no navigation" today; when the product fixes the error message, flip the assertion (tracked as a bug reference, not silently).
5. **Cart isolation:** each test starts from a clean guest state (fresh context — Playwright gives this for free per test).
