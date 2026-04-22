import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

/**
 * @typedef {object} CarouselRefs
 * @property {HTMLElement} track
 */

/**
 * Auto-scrolling marquee container for Shop the Look.
 * @extends {Component<CarouselRefs>}
 */
class ShopTheLookCarouselComponent extends Component {
  requiredRefs = ['track'];

  connectedCallback() {
    super.connectedCallback();
    // Defer to next frame so offsetWidth is available after layout
    requestAnimationFrame(() => this.#cloneItems());

    // In the Shopify editor, re-apply the animation when settings change so
    // the speed slider takes effect immediately without waiting for the current
    // animation cycle to finish.
    document.addEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
  }

  #onEditorLoad = (/** @type {Event} */ e) => {
    const sectionId = /** @type {CustomEvent} */ (e).detail?.sectionId;
    if (!this.closest(`#shopify-section-${sectionId}`)) return;
    this.#restartAnimation();
  };

  #restartAnimation() {
    const { track } = this.refs;
    track.style.animationName = 'none';
    // Force reflow so the browser registers the name removal
    void track.offsetWidth;
    track.style.animationName = '';
  }

  #cloneItems() {
    const { track } = this.refs;
    const originals = Array.from(track.children);
    if (!originals.length) return;

    // Measure the original set width in pixels
    const originalWidth = originals.reduce((sum, el) => sum + (/** @type {HTMLElement} */ (el)).offsetWidth, 0);
    if (originalWidth === 0) return;

    // Clone enough sets so the total track fills at least 2× the viewport —
    // this guarantees no empty gap is ever visible during the loop.
    const setsNeeded = Math.max(1, Math.ceil((window.innerWidth * 2) / originalWidth));

    for (let i = 0; i < setsNeeded; i++) {
      originals.forEach((item) => {
        const clone = /** @type {HTMLElement} */ (item.cloneNode(true));
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        track.appendChild(clone);
      });
    }

    // Tell the keyframe the exact distance to scroll: one original set in px.
    // This makes the loop seamless regardless of how many clone sets were added.
    track.style.setProperty('--stl-scroll-to', `-${originalWidth}px`);
  }

  pauseScroll() {
    this.refs.track.classList.add('stl-track--paused');
  }

  resumeScroll() {
    this.refs.track.classList.remove('stl-track--paused');
  }
}

/**
 * @typedef {object} ItemRefs
 * @property {HTMLButtonElement} [plusBtn]
 * @property {HTMLElement} [popup]
 */

/**
 * Single shop-the-look item.
 *
 * The popup is teleported to <body> on open to escape the CSS transform
 * containing block created by the marquee animation on .stl-track.
 * Without this, position:fixed on the popup is relative to the animated
 * track instead of the viewport, making it appear off-screen.
 *
 * @extends {Component<ItemRefs>}
 */
class ShopTheLookItemComponent extends Component {
  /** @type {AbortController} */
  #ac = new AbortController();

  /** @type {AbortController | null} portal event listeners, live while popup is open */
  #portalAC = null;

  /** @type {Comment | null} placeholder node that marks the popup's original DOM position */
  #placeholder = null;

  connectedCallback() {
    super.connectedCallback();
    if (!this.refs.popup) return;

    const { signal } = this.#ac;
    document.addEventListener('keydown', this.#onKeydown, { signal });
    document.addEventListener('click', this.#onDocClick, { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#ac.abort();
    // If popup is open when the component is removed, put it back and clean up
    if (this.#placeholder) {
      this.#restorePopup();
    }
  }

  /** @returns {ShopTheLookCarouselComponent | null} */
  get #carousel() {
    return /** @type {ShopTheLookCarouselComponent | null} */ (
      this.closest('shop-the-look-carousel')
    );
  }

  // ─── Public handlers (wired via on:* in Liquid for the + button only) ─────

  handlePlusBtnClick = () => {
    const { popup, plusBtn } = this.refs;
    if (!popup || !plusBtn) return;

    // Anchor the popup to the item's top-left corner so the × button inside
    // lands at the exact same position as the + button (both are offset 12px
    // from the item's top-left edge).
    const rect = this.getBoundingClientRect();
    const margin = 8;

    // Clamp horizontally so popup never escapes the viewport
    const left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - margin);
    // Clamp vertically — allow popup to fill as much of the viewport as needed
    const top = Math.max(margin, rect.top);
    const maxHeight = window.innerHeight - top - margin;

    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(margin, left)}px`;
    popup.style.maxHeight = `${maxHeight}px`;
    // Match popup width to the item so it overlays the card neatly
    popup.style.width = `${Math.min(320, rect.width)}px`;

    // Hide the + button while popup is open (× inside popup takes its place)
    this.classList.add('stl-popup-open');

    // ── Portal: move popup to <body> ──────────────────────────────────────
    // The .stl-track animation applies transform:translateX(), which makes it
    // a CSS containing block for position:fixed children. Moving to <body>
    // restores true viewport-relative fixed positioning.
    this.#placeholder = document.createComment('stl-popup');
    popup.parentNode?.insertBefore(this.#placeholder, popup);
    document.body.appendChild(popup);

    // Wire popup's internal events manually — the Component tree no longer
    // reaches the popup now that it's at <body>.
    this.#portalAC = new AbortController();
    const { signal } = this.#portalAC;

    popup.querySelector('.stl-popup__close')
      ?.addEventListener('click', this.#closeHandler, { signal });

    popup.querySelectorAll('.stl-variant-select').forEach((select) =>
      select.addEventListener('change', this.handleVariantChange, { signal })
    );

    popup.querySelectorAll('.stl-add-btn').forEach((btn) =>
      btn.addEventListener('click', this.handleAddToCart, { signal })
    );
    // ─────────────────────────────────────────────────────────────────────

    popup.setAttribute('open', '');
    plusBtn.setAttribute('aria-expanded', 'true');
    this.#carousel?.pauseScroll();
  };

  handleVariantChange = (/** @type {Event} */ e) => {
    const select = /** @type {HTMLSelectElement} */ (e.target);
    const card = select.closest('.stl-product');
    const btn = /** @type {HTMLButtonElement | null} */ (card?.querySelector('.stl-add-btn'));
    if (btn) btn.dataset.variantId = select.value;
  };

  handleAddToCart = async (/** @type {MouseEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    const btn = /** @type {HTMLButtonElement | null} */ (target.closest('.stl-add-btn'));
    if (!btn) return;

    const variantId = btn.dataset.variantId;
    if (!variantId) return;

    btn.disabled = true;
    btn.classList.add('stl-add-btn--loading');

    try {
      const response = await fetch(window.Theme?.routes?.cart_add_url ?? '/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ id: Number(variantId), quantity: 1 }),
      });

      if (!response.ok) throw new Error(`Cart add failed: ${response.status}`);

      const cart = await response.json();

      document.dispatchEvent(
        new CustomEvent(ThemeEvents.cartUpdate, {
          bubbles: true,
          detail: { source: 'shop-the-look', cart },
        })
      );

      btn.classList.remove('stl-add-btn--loading');
      btn.classList.add('stl-add-btn--success');
      btn.textContent = '✓ Añadido';

      setTimeout(() => {
        btn.classList.remove('stl-add-btn--success');
        btn.textContent = 'Añadir a la bolsa';
        btn.disabled = false;
      }, 2200);
    } catch {
      btn.classList.remove('stl-add-btn--loading');
      btn.disabled = false;
    }
  };

  // ─── Private ──────────────────────────────────────────────────────────────

  #closeHandler = () => this.#close();

  #close() {
    const { popup, plusBtn } = this.refs;
    if (!popup?.hasAttribute('open')) return;

    popup.removeAttribute('open');
    plusBtn?.setAttribute('aria-expanded', 'false');
    this.classList.remove('stl-popup-open');

    // Tear down portal event listeners
    this.#portalAC?.abort();
    this.#portalAC = null;

    // Restore popup to its original position in the DOM
    this.#restorePopup();

    this.#carousel?.resumeScroll();
  }

  #restorePopup() {
    const { popup } = this.refs;
    if (!popup || !this.#placeholder) return;
    this.#placeholder.parentNode?.insertBefore(popup, this.#placeholder);
    this.#placeholder.remove();
    this.#placeholder = null;
  }

  #onDocClick = (/** @type {MouseEvent} */ e) => {
    const { popup, plusBtn } = this.refs;
    if (!popup?.hasAttribute('open')) return;
    const target = /** @type {Node} */ (e.target);
    if (!popup.contains(target) && !plusBtn?.contains(target)) {
      this.#close();
    }
  };

  #onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') this.#close();
  };
}

customElements.define('shop-the-look-carousel', ShopTheLookCarouselComponent);
customElements.define('shop-the-look-item', ShopTheLookItemComponent);
