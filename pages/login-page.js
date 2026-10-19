// @ts-check
/**
 * Page Object for /login.
 * Used by registration tests to prove the newly created account really works.
 */
class LoginPage {
  constructor(page) {
    this.page = page;

    this.userName = page.getByRole('textbox', { name: 'Username' });
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.submitButton = page.locator('form').getByRole('button', { name: 'Login' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(username, password) {
    await this.userName.fill(username);
    await this.password.fill(password);
    await this.submitButton.click();
  }

  /**
   * Opens /login and signs in, then waits until the app leaves the login page.
   * Used by specs that only need an authenticated session before continuing.
   */
  async loginAs(username, password) {
    await this.goto();
    await this.login(username, password);
    await this.page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  }
}

module.exports = { LoginPage };
