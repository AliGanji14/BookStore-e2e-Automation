// @ts-check
const { expect } = require('@playwright/test');

/**
 * Page Object for /register.
 * Selectors follow docs/selector-strategy.md §4 — semantic roles first,
 * form-scoped submit button, no generated classes.
 */
class RegistrationPage {
  constructor(page) {
    this.page = page;

    this.firstName = page.getByRole('textbox', { name: 'First name' });
    this.lastName = page.getByRole('textbox', { name: 'Last name' });
    this.userName = page.getByRole('textbox', { name: 'User name' });
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.confirmPassword = page.getByRole('textbox', { name: 'Confirm Password' });
    this.maleRadio = page.getByRole('radio', { name: 'Male', exact: true });
    this.femaleRadio = page.getByRole('radio', { name: 'Female', exact: true });

    // The header has no Register button, but scoping to the form keeps this
    // stable if one is ever added.
    this.submitButton = page.locator('form').getByRole('button', { name: 'Register' });

    // Product-owned error strings (verbatim, including the "do not match" typo).
    this.passwordPolicyError = page.getByText(
      'Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number'
    );
    this.passwordMismatchError = page.getByText('Password do not match');
    this.userNameNotAvailableError = page.getByText('User Name is not available');
  }

  async goto() {
    await this.page.goto('/register');
  }

  /**
   * @param {{ firstName: string, lastName: string, username: string,
   *           password: string, confirmPassword: string, gender: string }} user
   */
  async fill(user) {
    await this.firstName.fill(user.firstName);
    await this.lastName.fill(user.lastName);
    await this.userName.fill(user.username);

    // App behavior: the username field runs an async availability check with a
    // ~1s debounce (custom-validation.service.ts). While it is pending, the
    // form status is PENDING and clicking Register silently does nothing.
    // Wait for the check to start and settle so submit() is deterministic.
    await expect(this.userName).toHaveClass(/ng-pending/);
    await expect(this.userName).not.toHaveClass(/ng-pending/);

    await this.password.fill(user.password);
    await this.confirmPassword.fill(user.confirmPassword);
    await (user.gender === 'Female' ? this.femaleRadio : this.maleRadio).check();
  }

  async submit() {
    await this.submitButton.click();
  }
}

module.exports = { RegistrationPage };
