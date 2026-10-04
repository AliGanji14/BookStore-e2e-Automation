// @ts-check
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
}

module.exports = { HeaderPage };
