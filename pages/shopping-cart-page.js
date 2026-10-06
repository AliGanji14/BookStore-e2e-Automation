// @ts-check
/**
 * Page Object for /shopping-cart.
 * Selectors follow docs/selector-strategy.md §6: rows are anchored by book
 * title, icon buttons are reached through short `:has()` scoping, and the
 * column order (fixed by the app's `displayedColumns`) lives in one map.
 */
class ShoppingCartPage {
  constructor(page) {
    this.page = page;

    // Column order is fixed by the app's displayedColumns (source-verified).
    this.COLUMNS = { image: 0, title: 1, price: 2, quantity: 3, total: 4, action: 5 };

    this.clearCartButton = page.getByRole('button', { name: 'Clear cart' });
    this.checkoutButton = page.getByRole('button', { name: 'CheckOut' });
    this.emptyMessage = page.getByText('Your shopping cart is empty.');
    this.continueShoppingButton = page.getByRole('button', { name: 'Continue shopping' });
    // Footer: "Cart Total:" label and the amount are sibling cells.
    this.cartTotalValue = page.locator('td:has-text("Cart Total:") + td strong');
  }

  /** A cart table row, anchored by the book title. */
  row(title) {
    return this.page.getByRole('row', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  }

  /** Cell of a row by column name — keeps positional access in one place. */
  cell(title, columnName) {
    return this.row(title).locator('td').nth(this.COLUMNS[columnName]);
  }

  /** The plain-number quantity text between the − and + buttons. */
  quantityValue(title) {
    return this.row(title).locator('td').nth(this.COLUMNS.quantity).getByText(/^\d+$/);
  }

  increaseQuantity(title) {
    return this.row(title).locator('button:has(mat-icon:text-is("add_circle"))');
  }

  decreaseQuantity(title) {
    // Disabled while quantity is 1 (assertion target for the min rule).
    return this.row(title).locator('button:has(mat-icon:text-is("remove_circle"))');
  }

  removeItemButton(title) {
    return this.row(title).locator('button:has(mat-icon:text-is("delete"))');
  }
}

module.exports = { ShoppingCartPage };
