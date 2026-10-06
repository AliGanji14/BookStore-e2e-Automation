// @ts-check
/**
 * Page Object for /checkout.
 * Selectors follow docs/selector-strategy.md §7 — semantic roles for the
 * shipping form, source-verified texts for states.
 */
class CheckoutPage {
  constructor(page) {
    this.page = page;

    // Shipping address form.
    this.name = page.getByRole('textbox', { name: 'Name' });
    this.addressLine1 = page.getByRole('textbox', { name: 'Address Line 1' });
    this.addressLine2 = page.getByRole('textbox', { name: 'Address Line 2' });
    this.pincode = page.getByRole('textbox', { name: 'Pincode' });
    this.state = page.getByRole('textbox', { name: 'State' });

    this.placeOrderButton = page.getByRole('button', { name: 'Place Order' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });

    this.pincodePatternError = page.getByText('Pincode must have 6 digits only and cannot start with 0');

    // Right column states (source-verified texts).
    this.emptyCartMessage = page.getByText('There are no items in your cart.');
    this.startShoppingButton = page.getByRole('button', { name: 'Start shopping' });
    this.orderSummaryHeading = page.getByText('Order Summary');
    this.grandTotalLabel = page.getByRole('cell', { name: 'Grand Total' });
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  /** Order Summary table row for one book title. */
  orderRow(title) {
    return this.page.getByRole('row', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  }

  /**
   * @param {{ name: string, addressLine1: string, addressLine2: string,
   *           pincode: string, state: string }} address
   */
  async fillShippingAddress(address) {
    await this.name.fill(address.name);
    await this.addressLine1.fill(address.addressLine1);
    await this.addressLine2.fill(address.addressLine2);
    await this.pincode.fill(address.pincode);
    await this.state.fill(address.state);
  }
}

module.exports = { CheckoutPage };
