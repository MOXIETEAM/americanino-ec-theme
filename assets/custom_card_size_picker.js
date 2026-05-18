import { Component } from '@theme/component';

/**
 * MOXIE: Inline size picker for product cards.
 * - Mobile: toggle open/close via the + button.
 * - Desktop: shown via CSS hover on product-card (no JS needed).
 */
class MoxSizePickerComponent extends Component {
  /** @type {((e: MouseEvent) => void) | null} */
  #outsideClickHandler = null;

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

  connectedCallback() {
    super.connectedCallback();

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

    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler);
      this.#outsideClickHandler = null;
    }
  }
}

if (!customElements.get('mox-size-picker-component')) {
  customElements.define('mox-size-picker-component', MoxSizePickerComponent);
}
