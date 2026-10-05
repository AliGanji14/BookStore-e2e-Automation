// @ts-check
const { expect } = require('@playwright/test');

/**
 * Page Object for the top navigation bar (mat-toolbar).
 * Selectors follow docs/selector-strategy.md §2.
 */
class HeaderPage {
  constructor(page) {
    this.page = page;

    // Visible only when logged out. Scoped to the toolbar: the /login page
    // also has a form submit named "Login", which must not match here.
    this.toolbar = page.locator('mat-toolbar');
    this.loginButton = this.toolbar.getByRole('button', { name: 'Login' });

    // Search box in the header.
    this.searchInput = page.getByPlaceholder('Search books or authors');
  }

  /**
   * The user-menu trigger shows the logged-in username.
   * Scoped to the toolbar so page content can never collide with it.
   */
  userMenu(username) {
    return this.toolbar.getByText(username);
  }

  async openUserMenu(username) {
    await this.userMenu(username).click();
  }

  /** Menu items live in the mat-menu overlay, not inside the toolbar. */
  logoutMenuItem() {
    return this.page.getByRole('menuitem', { name: 'Logout' });
  }

  /**
   * Types a search term and submits it.
   *
   * Preferred path: click the autocomplete suggestion — that's how real users
   * search and it avoids the Enter bug below.
   *
   * KNOWN BUG (verified 2026-10-03): pressing Enter in the box navigates to
   * /search via keydown.enter, but the input is type="search", so the same
   * Enter ALSO fires the DOM `search` event whose handler navigates back to
   * "/". In the current deployment the bounce always wins — the results page
   * flashes and disappears. Fallback keeps one Enter attempt for the day the
   * product fixes the race.
   */
  async searchFor(term) {
    await this.searchInput.click();
    await this.searchInput.fill(term);
    // Wait until Angular's reactive control has actually absorbed the input
    // before submitting — pressing Enter too early races the app's boot.
    await expect(this.searchInput).toHaveValue(term);

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suggestion = this.page
      .getByRole('option', { name: new RegExp(escaped, 'i') })
      .first();
    try {
      await suggestion.click({ timeoutMs: 3000 });
    } catch {
      await this.searchInput.press('Enter');
    }
    await expect(this.page).toHaveURL(/\/search\?item=/, { timeout: 5000 });
  }
}

module.exports = { HeaderPage };
