import { mediaQueryLarge, requestIdleCallback, startViewTransition } from '@theme/utilities';
import PaginatedList from '@theme/paginated-list';

/**
 * A custom element that renders a pagniated results list
 */
export default class ResultsList extends PaginatedList {
  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#handleMediaQueryChange);
    this.setAttribute('initialized', '');

    // On first visit (no sessionStorage), the inline script leaves product-grid-view="default".
    // Apply the pre-checked option's value so the grid matches the selected button.
    // MOXIE: looked up via `data-grid-layout` before, but snippets/custom_grid_density.liquid
    // intentionally doesn't set that attribute (it's what #handleMediaQueryChange used to force
    // the default back on every breakpoint cross, wiping the user's actual choice). Without it,
    // this lookup always found nothing, so the grid stayed on product-grid-view="default"
    // (native auto-fill/minmax, variable column count) even though a radio was visibly checked —
    // e.g. "col-4" checked in the UI but the grid rendering 5 columns on a wide viewport.
    // Reading `:checked` instead fixes the first-load sync without reintroducing the revert bug,
    // since this block only runs once per connectedCallback, not on every breakpoint change.
    requestIdleCallback(() => {
      const { grid } = this.refs;
      if (!grid || grid.getAttribute('product-grid-view') !== 'default') return;
      const defaultOption = mediaQueryLarge.matches
        ? this.querySelector('input[type="radio"][name="grid"]:checked')
        : this.querySelector('input[type="radio"][name="grid-mobile"]:checked');
      if (defaultOption instanceof HTMLInputElement) {
        this.#setLayout(defaultOption.value);
      }
    });
  }

  disconnectedCallback() {
    mediaQueryLarge.removeEventListener('change', this.#handleMediaQueryChange);
  }

  /**
   * Updates the layout.
   *
   * @param {Event} event
   */
  updateLayout({ target }) {
    if (!(target instanceof HTMLInputElement)) return;

    this.#animateLayoutChange(target.value);
  }

  /**
   * Sets the layout.
   *
   * @param {string} value
   */
  #animateLayoutChange = async (value) => {
    const { grid } = this.refs;

    if (!grid) return;

    await startViewTransition(() => this.#setLayout(value), ['product-grid']);

    requestIdleCallback(() => {
      const viewport = mediaQueryLarge.matches ? 'desktop' : 'mobile';
      sessionStorage.setItem(`product-grid-view-${viewport}`, value);
    });
  };

  /**
   * Animates the layout change.
   *
   * @param {string} value
   */
  #setLayout(value) {
    const { grid } = this.refs;
    if (!grid) return;
    grid.setAttribute('product-grid-view', value);
  }

  /**
   * Handles the media query change event.
   *
   * @param {MediaQueryListEvent} event
   */
  #handleMediaQueryChange = (event) => {
    const targetElement = event.matches
      ? this.querySelector('[data-grid-layout="desktop-default-option"]')
      : this.querySelector('[data-grid-layout="mobile-option"]');

    if (!(targetElement instanceof HTMLInputElement)) return;

    targetElement.checked = true;
    this.#setLayout(targetElement.value);
  };
}

if (!customElements.get('results-list')) {
  customElements.define('results-list', ResultsList);
}
