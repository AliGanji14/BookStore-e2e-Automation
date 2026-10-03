# BookCart — Selector Strategy

> Ground truth: verified against the live site (header, login, register, search, cart shell) **and** the app's actual Angular templates (github.com/AnkitSharma-007/BookCart, `master`).
> Maps to test cases in `docs/test-design.md`.
> Date: 2026-10-03

---

## 1. Strategy Rules (priority order)

1. **`data-testid`** — ⚠️ **the app has NONE** (checked every component template). Rule 2 has no effect today; see §8 for the recommendation.
2. **Semantic locators** — `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText` (Material `mat-label` / `placeholder` / `aria-label` attributes are real, stable, and product-owned).
3. **Stable structural anchors** — Angular component tags (`app-book-card`, `app-addtocart`…), `formControlName` attributes (tied to business logic, not styling), Material icon text (`shopping_cart`, `delete`…), table header texts.
4. **Scoped short CSS with `:has()`** — only to reach icon buttons that have no accessible name (e.g. `button:has(mat-icon:text-is("delete"))`).
5. **Never use:** Material/CDK generated classes & ids (`mat-mdc-*`, `mdc-*`, `mat-input-5`, `cdk-describedby-message-ng-*`, `ng-tns-*`), Bootstrap utility classes (`d-flex`, `col-md-3`, `my-4`), positioning (`nth()`), long XPath.

**Rule of thumb:** if a selector stops being readable in one line, it belongs in a Page Object as a named constant — not inlined in tests.

---

## 2. Header / Navigation (used by almost every test)

| Element | Recommended selector | Notes / fallback |
|---|---|---|
| Logo → home | `getByRole('button', { name: 'Book Cart' })` | verified live |
| Search input | `getByPlaceholder('Search books or authors')` | fallback: `getByLabel('search')` (`aria-label="search"` exists) |
| Cart icon button | `page.locator('button:has(mat-icon:text-is("shopping_cart"))')` | no accessible name — wrap in a Header POM method |
| **Cart badge count** | `page.locator('mat-icon[matbadge]')` → `getAttribute('matBadge')` | badge value is an **attribute**, not text — read it, don't read text |
| Login button (logged out) | `getByRole('button', { name: 'Login' })` | on the login page this name is ambiguous with the form submit → scope: `page.locator('form').getByRole('button', { name: 'Login' })` is the **form** one |
| Logged-in user menu | `getByRole('button', { name: new RegExp(username) })` | contains `<span>{{ username }}</span>` |
| Logout | `getByRole('menuitem', { name: 'Logout' })` | inside `mat-menu` after opening the user menu |
| My Orders | `getByRole('menuitem', { name: 'My Orders' })` | same menu |
| Wishlist icon (authed only) | `button:has(mat-icon:text-is("favorite"))` | hidden for guests — use `toBeHidden()` for logged-out state |

---

## 3. Login (`/login`) — LOG-01…LOG-05

| Element | Recommended selector | Notes |
|---|---|---|
| Username field | `getByRole('textbox', { name: 'Username' })` | verified live; `mat-label` gives the accessible name |
| Password field | `getByRole('textbox', { name: 'Password', exact: true })` | `exact:` guards against future Confirm fields |
| Show-password toggle | `page.locator('mat-icon').filter({ hasText: /^visibility(_off)?$/ })` | icon text flips `visibility` ↔ `visibility_off`; assert `input[type]` flips too |
| Submit | `page.locator('form').getByRole('button', { name: 'Login' })` | **must be form-scoped** (header also has "Login") |
| Field required errors | `page.locator('mat-error').getByText('Username is required')` | `mat-error` only renders after touch |
| Invalid-credentials banner | `getByText('Login Failed. Username or Password is incorrect.')` | ⚠️ exists in the template but **does not render today** (template condition `loginForm.errors` is null when fields are valid) — the root cause of the silent-failure bug found in the analysis |

---

## 4. Registration (`/register`) — REG-01…REG-06

| Element | Recommended selector | Notes |
|---|---|---|
| First name | `getByRole('textbox', { name: 'First name' })` | |
| Last name | `getByRole('textbox', { name: 'Last name' })` | ⚠️ label is "Last name" but placeholder is "Last **N**ame" — use the **label** form |
| User name | `getByRole('textbox', { name: 'User name' })` | lowercase "name" — exact string matters |
| Password | `getByRole('textbox', { name: 'Password', exact: true })` | verified live: without `exact` it also matches "Confirm Password" |
| Confirm Password | `getByRole('textbox', { name: 'Confirm Password' })` | |
| Gender Male / Female | `getByRole('radio', { name: 'Male', exact: true })` | verified live: "Female" **contains** "male" — without `exact` the locator matches 2 elements |
| Submit | `page.locator('form').getByRole('button', { name: 'Register' })` | |
| Policy error | `getByText('Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number')` | verified live |
| Mismatch error | `getByText('Password do not match')` | product typo included verbatim |
| Username taken error | `getByText('User Name is not available')` | verified live; appears without submit |

---

## 5. Search & Navigation (`/`, `/search`, `/books/details/:id`) — SRCH-01…SRCH-08

| Element | Recommended selector | Notes |
|---|---|---|
| Category item | `page.locator('app-book-filter mat-list-item').filter({ hasText: 'Fiction' })` | `mat-list-item` has no button role; component-tag anchor keeps it readable |
| Search suggestions | `getByRole('option', { name: /title/ })` | `mat-autocomplete` options |
| Book card | `page.locator('app-book-card').filter({ hasText: exactTitle })` | **the** anchor for every card interaction |
| Card title link | `card.getByRole('link').filter({ hasText: title })` | |
| Card price | `card.getByText(/₹/)`, or `card.locator('p')` | formatted `₹ x,xxx.00` |
| Card Add to Cart | `card.getByRole('button', { name: 'Add to Cart' })` | button text "Add to Cart" (`app-addtocart`) |
| Empty state (home/search) | `getByRole('heading', { name: 'No books found.' })` | ⚠️ same message reused for both empty catalog and empty results |
| Details — info rows | `getByRole('row', { name: 'Author' })` (Title/Author/Category/Price) | details page is a plain table; row-scoped reads keep assertions readable |
| Details — Add to Cart | `getByRole('button', { name: 'Add to Cart' })` | exactly one on the details page |
| Details — error state | `getByRole('heading', { name: 'Error loading book details' })` + `getByRole('button', { name: 'Back to Home' })` | handles bad `bookId` (SRCH negative path) |

---

## 6. Shopping Cart (`/shopping-cart`) — CART-01…CART-08

Rows are a `mat-table`; scope every row action by the book title:

| Element | Recommended selector | Notes |
|---|---|---|
| Cart row | `page.getByRole('row', { name: new RegExp(title) })` | anchor for all per-row actions |
| Quantity + | `row.locator('button:has(mat-icon:text-is("add_circle"))')` | no accessible name |
| Quantity − | `row.locator('button:has(mat-icon:text-is("remove_circle"))')` | **disabled when qty = 1** → `toBeDisabled()` is an assertion target |
| Delete row | `row.locator('button:has(mat-icon:text-is("delete"))')` | has `matTooltip="Delete item"` |
| Clear cart | `getByRole('button', { name: 'Clear cart' })` | only rendered when items exist |
| Row total | `row.getByRole('cell').nth(...)` avoided → read the row's last cell: `row.locator('td').last()` | keep in POM, not inlined |
| Cart total | `page.getByRole('row', { name: /Cart Total/ })` | footer row |
| CheckOut button | `getByRole('button', { name: 'CheckOut' })` | navigates to `/checkout` |
| Empty state | `getByText('Your shopping cart is empty.')` + `getByRole('button', { name: 'Continue shopping' })` | |

---

## 7. Checkout (`/checkout`) — CO-01…CO-06

| Element | Recommended selector | Notes |
|---|---|---|
| Name | `getByRole('textbox', { name: 'Name' })` | shipping form, `formControlName="name"` |
| Address Line 1 / 2 | `getByRole('textbox', { name: 'Address Line 1' })` / `'Address Line 2'` | |
| Pincode | `getByRole('textbox', { name: 'Pincode' })` | ⚠️ **new rule from source:** pattern error "Pincode must have 6 digits only and cannot start with 0" — add as CO-04 data variant |
| State | `getByRole('textbox', { name: 'State' })` | |
| Place Order | `getByRole('button', { name: 'Place Order' })` | `type=submit`; disabled while form invalid → good wait/assert target |
| Cancel | `getByRole('button', { name: 'Cancel' })` | back to cart |
| Order Summary table | `getByRole('cell', { name: 'Grand Total' })` + sibling total cell | plain HTML table |
| Empty-cart state | `getByText('There are no items in your cart.')` + `getByRole('button', { name: 'Start shopping' })` | |
| Loading state | `page.locator('mat-spinner')` | assert it disappears before interacting (the live "infinite spinner" bug makes this assertion mandatory, not optional) |

---

## 8. Elements with NO good selector → recommendation

These are the only elements forced onto icon/class-based locators. Best long-term fix: the app is **open source** — contribute a tiny PR adding `data-testid` to exactly these (and nothing else):

| Element | Current workaround | Proposed `data-testid` |
|---|---|---|
| Cart badge count | `mat-icon[matbadge]` attribute read | `cart-count` |
| Cart row action buttons | `button:has(mat-icon:text-is(...))` | `cart-qty-plus` / `cart-qty-minus` / `cart-delete-item` |
| Book card wrapper | `app-book-card` tag (acceptable) | `book-card` |
| Search suggestions list | `getByRole('option')` (acceptable) | `search-suggestion` |
| Order confirmation / placed-order id | unknown until catalog recovers | `order-confirmation` |

Until the PR lands, all of the above live **only inside Page Object classes**, so a future swap to `data-testid` touches one file per page.

## 9. Verification status

| Module | Verified how |
|---|---|
| Header, Login, Registration, Search input, Cart shell | **Live site** (GUI probing with accessibility snapshot) |
| Book card, Book details, Cart table, Checkout, Filters, My Orders | **App source templates** (authoritative), cross-checked against the live ARIA tree where reachable |
| Risk note | Deployed build may lag `master`; before the automation wave, run a 10-minute locator sanity pass on the live site (catalog-dependent locators only) |
