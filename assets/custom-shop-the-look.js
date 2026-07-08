import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

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
    document.addEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
  }

  #onEditorLoad = (/** @type {Event} */ e) => {
    const sectionId = /** @type {CustomEvent} */ (e).detail?.sectionId;
    if (!this.closest(`#shopify-section-${sectionId}`)) return;
    // Defer one frame so #cloneItems() (also RAF-queued in connectedCallback) runs
    // first on full section reload. If data-stl-ready isn't set yet, #restartAnimation
    // is a no-op and the animation starts correctly at the end of #cloneItems().
    requestAnimationFrame(() => this.#restartAnimation());
  };

  #restartAnimation() {
    const { track } = this.refs;
    // Guard: cloneItems hasn't run yet — animation will start correctly there.
    if (!track.hasAttribute('data-stl-ready')) return;
    // CSS animation-duration resolved from var(--stl-duration) is baked in at
    // animation start and does not update on a running animation when the custom
    // property changes. A full restart forces re-resolution with the new value.
    track.removeAttribute('data-stl-ready');
    void track.offsetWidth;
    track.setAttribute('data-stl-ready', '');
  }

  #cloneItems() {
    const { track } = this.refs;
    const originals = Array.from(track.children);
    if (!originals.length) return;

    // Measure the original set width in pixels
    const originalWidth = originals.reduce((sum, el) => sum + (/** @type {HTMLElement} */ (el)).offsetWidth, 0);
    if (originalWidth === 0) return;

    // In the editor use 1 clone set (minimum for a seamless loop) to reduce
    // DOM size and GIF decoding cost during frequent section reloads.
    // On the storefront use 2× viewport to guarantee no gap at any scroll speed.
    const isDesignMode = window.Shopify?.designMode === true;
    const setsNeeded = isDesignMode
      ? 1
      : Math.max(1, Math.ceil((window.innerWidth * 2) / originalWidth));

    for (let i = 0; i < setsNeeded; i++) {
      originals.forEach((item) => {
        // Use a plain div instead of cloneNode() so connectedCallback() is never
        // triggered on decorative clones. A custom-element clone would register
        // its own MutationObserver and two document-level event listeners per item,
        // multiplying with every clone set and every editor section reload.
        const clone = document.createElement('div');
        clone.className = item.className;
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('role', 'presentation');
        clone.innerHTML = item.innerHTML;
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        // Disable interactive descendants — clones are purely decorative
        clone.querySelectorAll('button, select, input').forEach((el) => {
          el.setAttribute('tabindex', '-1');
          el.setAttribute('disabled', '');
        });
        track.appendChild(clone);
      });
    }

    // Tell the keyframe the exact distance to scroll: one original set in px.
    track.style.setProperty('--stl-scroll-to', `-${originalWidth}px`);

    // Start (or restart) the animation only now that --stl-scroll-to is set.
    // Removing and re-adding the attribute resets the animation from 0% with
    // the correct target and the current --stl-duration, so the speed slider
    // in the editor always takes effect immediately on section reload.
    track.removeAttribute('data-stl-ready');
    void track.offsetWidth; // force reflow so the browser registers the reset
    track.setAttribute('data-stl-ready', '');
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

  /**
   * Stable reference to the popup element held while it is open.
   * this.refs.popup is cleared by the Component MutationObserver the moment
   * the popup is teleported to <body>, so we must save the reference before
   * the move and use this variable inside all close paths.
   * @type {HTMLElement | null}
   */
  #openPopup = null;

  /** @type {HTMLElement | null} shared overlay element for mobile bottom sheet */
  #overlay = null;

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
    if (this.#placeholder) {
      this.#restorePopup();
    }
    this.#overlay?.remove();
    this.#overlay = null;
  }

  /** @returns {ShopTheLookCarouselComponent | null} */
  get #carousel() {
    return /** @type {ShopTheLookCarouselComponent | null} */ (
      this.closest('shop-the-look-carousel')
    );
  }

  // ─── Public handlers (wired via on:* in Liquid for the + button only) ─────

  handlePlusBtnClick = () => {
    // Toggle: if popup is already open, close it
    if (this.#openPopup?.hasAttribute('open')) {
      this.#close();
      return;
    }

    const { plusBtn } = this.refs;
    // Read popup from refs before the MutationObserver clears it when we move it to <body>
    const popup = /** @type {HTMLElement | null} */ (this.refs.popup);
    if (!popup || !plusBtn) return;
    this.#openPopup = popup;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      // Bottom sheet: full-width, anchored to bottom of viewport
      popup.style.top = 'auto';
      popup.style.bottom = '0';
      popup.style.left = '0';
      popup.style.right = '0';
      popup.style.width = '100%';
      popup.style.maxWidth = '';
      popup.style.maxHeight = '';
      this.#showOverlay();
    } else {
      // Desktop: unfold the popup from the top of the + / × button that toggles it,
      // so the caret always points back at the button regardless of the item's own size.
      const rect = this.getBoundingClientRect();
      const btnRect = plusBtn.getBoundingClientRect();
      const margin = 8;
      const caretGap = 10; // clearance below the button for the upward-pointing caret
      const caretOffset = 32; // caret center distance from the popup's left edge (see .stl-popup::after)
      const width = Math.min(320, rect.width);

      const btnCenter = btnRect.left + btnRect.width / 2;
      const left = Math.min(Math.max(margin, btnCenter - caretOffset), window.innerWidth - width - margin);
      const top = Math.max(margin, btnRect.bottom + caretGap);
      const maxHeight = window.innerHeight - top - margin;

      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;
      popup.style.width = `${width}px`;
      popup.style.maxHeight = '';
      popup.style.bottom = '';
      popup.style.right = '';

      const inner = /** @type {HTMLElement | null} */ (popup.querySelector('.stl-popup__inner'));
      if (inner) inner.style.maxHeight = `${maxHeight}px`;
    }

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

    popup.querySelectorAll('.stl-variant-select').forEach((select) =>
      select.addEventListener('change', this.handleVariantChange, { signal })
    );

    popup.querySelectorAll('.stl-add-btn').forEach((btn) =>
      btn.addEventListener('click', this.handleAddToCart, { signal })
    );

    popup.querySelectorAll('.stl-popup-close').forEach((btn) =>
      btn.addEventListener('click', this.#closeHandler, { signal })
    );
    // ─────────────────────────────────────────────────────────────────────

    popup.setAttribute('open', '');
    plusBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
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

      this.dispatchEvent(
        new CartAddEvent(cart, variantId, {
          source: 'shop-the-look',
          itemCount: 1,
          variantId,
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
    const popup = this.#openPopup;
    const { plusBtn } = this.refs;
    if (!popup?.hasAttribute('open')) return;

    popup.removeAttribute('open');
    plusBtn?.setAttribute('aria-expanded', 'false');
    this.classList.remove('stl-popup-open');

    // Tear down portal event listeners
    this.#portalAC?.abort();
    this.#portalAC = null;

    this.#hideOverlay();
    document.body.style.overflow = '';

    // Restore popup to its original position in the DOM
    this.#restorePopup();

    this.#carousel?.resumeScroll();
  }

  #showOverlay() {
    if (!this.#overlay) {
      this.#overlay = document.createElement('div');
      this.#overlay.className = 'stl-overlay';
      document.body.appendChild(this.#overlay);
    }
    void this.#overlay.offsetWidth;
    this.#overlay.classList.add('stl-overlay--visible');
  }

  #hideOverlay() {
    if (!this.#overlay) return;
    this.#overlay.remove();
    this.#overlay = null;
  }

  #restorePopup() {
    const popup = this.#openPopup;
    if (!popup || !this.#placeholder) return;
    const inner = /** @type {HTMLElement | null} */ (popup.querySelector('.stl-popup__inner'));
    if (inner) inner.style.maxHeight = '';
    this.#placeholder.parentNode?.insertBefore(popup, this.#placeholder);
    this.#placeholder.remove();
    this.#placeholder = null;
    this.#openPopup = null;
  }

  #onDocClick = (/** @type {MouseEvent} */ e) => {
    const popup = this.#openPopup;
    const { plusBtn } = this.refs;
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
