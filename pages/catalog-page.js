// @ts-check
/**
 * Page Object for the catalog views: home, search results and category
 * filter — they all render the same sidebar + book-card grid.
 * Selectors follow docs/selector-strategy.md §5.
 */
class CatalogPage {
  constructor(page) {
    this.page = page;

    // Shown both when the catalog is empty and when a search has no matches.
    this.noBooksHeading = page.getByRole('heading', { name: 'No books found.' });
  }

  /** Sidebar category entry (a mat-list-item — no accessible role). */
  categoryItem(name) {
    return this.page.locator('app-book-filter mat-list-item').filter({ hasText: name });
  }

  /** A book card on any catalog page, anchored by its title. */
  bookCard(title) {
    return this.page.locator('app-book-card').filter({ hasText: title });
  }

  /** The card's title link (the card also contains a cover-image link). */
  bookCardTitleLink(title) {
    return this.bookCard(title).getByRole('link').filter({ hasText: title });
  }

  /** Details page info row ("Title", "Author", "Category", "Price"). */
  detailsRow(label) {
    return this.page.getByRole('row', { name: new RegExp(label) });
  }

  detailsHeading() {
    return this.page.getByText('Book Details');
  }
}

module.exports = { CatalogPage };
