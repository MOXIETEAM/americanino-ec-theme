import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

/**
 * MOXIE: Inline size picker for product cards.
 * - Desktop: shown via CSS hover on the parent card (no JS needed).
 * - Mobile: toggle open/close via the + button.
 * Clicking a size option adds it directly to the cart via AJAX.
 */
const ADDED_MESSAGE_DURATION = 1800;

class MoxSizePickerComponent extends Component {
  /** @type {((e: MouseEvent) => void) | null} */
  #outsideClickHandler = null;

  /** @type {number | null} */
  #addedTimeout = null;

  /**
   * Toggle the size picker open/closed (called via on:click="/toggle").
   * @param {Event} event
   */
  toggle(event) {
    event.preventDefault();
    event.stopPropagation();

    const isOpen = this.hasAttribute('data-open');

    if (!isOpen) {
      // Close any other open pickers first
      document.querySelectorAll('mox-size-picker-component[data-open]').forEach((el) => {
        if (el !== this) {
          el.removeAttribute('data-open');
          el.querySelector('.mox-sp__toggle')?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    this.toggleAttribute('data-open', !isOpen);
    this.querySelector('.mox-sp__toggle')?.setAttribute('aria-expanded', String(!isOpen));
  }

  /**
   * Intercepts clicks on .mox-sp__option elements and adds the variant to cart.
   * @param {MouseEvent} event
   */
  #handleOptionClick = async (event) => {
    const option = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest('.mox-sp__option') : null
    );

    if (!option || option.classList.contains('mox-sp__option--unavailable')) return;

    event.preventDefault();

    const variantId = option.dataset.variantId;
    if (!variantId) return;

    await this.#addToCart(variantId);
  };

  /**
   * Adds a variant to the cart via AJAX and dispatches CartAddEvent.
   * @param {string} variantId
   */
  async #addToCart(variantId) {
    if (this.hasAttribute('data-adding')) return;
    this.setAttribute('data-adding', '');

    try {
      const sectionIds = /** @type {NodeListOf<HTMLElement>} */ (
        document.querySelectorAll('cart-items-component[data-section-id]')
      );
      const sections = [...sectionIds].map((el) => el.dataset.sectionId).join(',');

      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity: 1 }],
          ...(sections && { sections }),
        }),
      });

      const data = await response.json();

      if (data.status) {
        console.error('[mox-size-picker] Cart error:', data.message);
        return;
      }

      // MOXIE: use the full cart (with item_count) as the event resource, not the raw
      // /cart/add.js response — that only contains the just-added line(s), which was
      // making the header cart bubble reset to "1" on every add instead of the real total.
      const cart = await fetch('/cart.js').then((r) => r.json());

      this.dispatchEvent(
        new CartAddEvent(cart, variantId, {
          source: 'mox-size-picker',
          itemCount: 1,
          variantId,
          sections: data.sections,
        })
      );

      this.#showAddedMessage();
    } catch (err) {
      console.error('[mox-size-picker] Cart add failed:', err);
    } finally {
      this.removeAttribute('data-adding');
    }
  }

  /**
   * Shows the "added to bag" message in place of the size options, then
   * reverts (and closes the picker on mobile) after a short delay.
   */
  #showAddedMessage() {
    window.clearTimeout(this.#addedTimeout ?? undefined);
    this.setAttribute('data-added', '');

    this.#addedTimeout = window.setTimeout(() => {
      this.removeAttribute('data-added');
      this.removeAttribute('data-open');
      this.querySelector('.mox-sp__toggle')?.setAttribute('aria-expanded', 'false');
      this.#addedTimeout = null;
    }, ADDED_MESSAGE_DURATION);
  }

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('click', this.#handleOptionClick);

    this.#outsideClickHandler = (/** @type {MouseEvent} */ e) => {
      if (this.hasAttribute('data-open') && e.target instanceof Node && !this.contains(e.target)) {
        this.removeAttribute('data-open');
        this.querySelector('.mox-sp__toggle')?.setAttribute('aria-expanded', 'false');
      }
    };

    document.addEventListener('click', this.#outsideClickHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener('click', this.#handleOptionClick);

    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler);
      this.#outsideClickHandler = null;
    }

    window.clearTimeout(this.#addedTimeout ?? undefined);
  }
}

if (!customElements.get('mox-size-picker-component')) {
  customElements.define('mox-size-picker-component', MoxSizePickerComponent);
}
