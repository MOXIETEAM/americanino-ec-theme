import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

/**
 * @typedef {object} CarouselRefs
 * @property {HTMLElement} track
 */

/**
 * Auto-scrolling marquee container for Complete the Look.
 *
 * The marquee loops decorative clones of each item to fill the track. Clones
 * are plain <div>s (not custom elements) so they never register their own
 * MutationObserver/listeners — but every clone still carries a working
 * "+" trigger. Clicking any repeated copy of a look opens the SAME popup as
 * the original, positioned at the clicked copy, via a single delegated
 * listener here instead of duplicating popups per clone.
 *
 * @extends {Component<CarouselRefs>}
 */
class CompleteTheLookCarouselComponent extends Component {
  requiredRefs = ['track'];

  connectedCallback() {
    super.connectedCallback();
    // Defer to next frame so offsetWidth is available after layout
    requestAnimationFrame(() => this.#cloneItems());
    document.addEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
    this.refs.track.addEventListener('click', this.#onTrackClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('shopify:section:load', /** @type {EventListener} */ (this.#onEditorLoad));
    this.refs.track.removeEventListener('click', this.#onTrackClick);
  }

  #onEditorLoad = (/** @type {Event} */ e) => {
    const sectionId = /** @type {CustomEvent} */ (e).detail?.sectionId;
    if (!this.closest(`#shopify-section-${sectionId}`)) return;
    // Defer one frame so #cloneItems() (also RAF-queued in connectedCallback) runs
    // first on full section reload. If data-ctl-ready isn't set yet, #restartAnimation
    // is a no-op and the animation starts correctly at the end of #cloneItems().
    requestAnimationFrame(() => this.#restartAnimation());
  };

  /**
   * Forwards clicks on a decorative clone's "+" trigger to the matching
   * original item, so every visible repeat of a look opens the real popup —
   * not just the one original instance in the DOM.
   * @param {MouseEvent} e
   */
  #onTrackClick = (e) => {
    const target = /** @type {Element} */ (e.target);
    const trigger = target.closest('[data-ctl-clone-trigger]');
    if (!trigger) return; // real items handle their own click via on:click

    const cloneRoot = trigger.closest('[data-ctl-look-index]');
    const index = /** @type {HTMLElement | null} */ (cloneRoot)?.dataset.ctlLookIndex;
    if (index == null) return;

    const original = /** @type {CompleteTheLookItemComponent | null} */ (
      this.refs.track.querySelector(`complete-the-look-item[data-ctl-look-index="${index}"]`)
    );
    original?.open(/** @type {HTMLElement} */ (trigger));
  };

  #restartAnimation() {
    const { track } = this.refs;
    // Guard: cloneItems hasn't run yet — animation will start correctly there.
    if (!track.hasAttribute('data-ctl-ready')) return;
    // CSS animation-duration resolved from var(--ctl-duration) is baked in at
    // animation start and does not update on a running animation when the custom
    // property changes. A full restart forces re-resolution with the new value.
    track.removeAttribute('data-ctl-ready');
    void track.offsetWidth;
    track.setAttribute('data-ctl-ready', '');
  }

  #cloneItems() {
    const { track } = this.refs;
    // Exclude any node already marked as a decorative clone (aria-hidden) so that
    // calling this twice on the same track (e.g. an unexpected re-render) can never
    // clone previously-added clones and compound the DOM/memory footprint.
    const originals = Array.from(track.children).filter((el) => !el.hasAttribute('aria-hidden'));
    if (!originals.length) return;

    // Stable index per original, used to map a clicked clone back to the
    // one real item (and its one real popup) it's a visual copy of.
    originals.forEach((item, index) => {
      if (!(/** @type {HTMLElement} */ (item).dataset.ctlLookIndex)) {
        /** @type {HTMLElement} */ (item).dataset.ctlLookIndex = String(index);
      }
    });

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

    // Drop any clones from a previous call before repopulating, so repeated
    // invocations on the same track stay idempotent instead of stacking up.
    track.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());

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
        clone.dataset.ctlLookIndex = /** @type {HTMLElement} */ (item).dataset.ctlLookIndex ?? '';
        clone.innerHTML = item.innerHTML;
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

        // The popup is never opened directly on a clone — clicking a clone's
        // trigger forwards to the one real popup instead (see #onTrackClick).
        // Dropping it here keeps clone DOM/markup minimal regardless of how
        // many clone sets the marquee needs.
        clone.querySelector('.ctl-popup')?.remove();

        // Disable any remaining interactive descendants — clones are purely
        // decorative and aria-hidden, so they must stay out of the tab order.
        clone.querySelectorAll('button, select, input').forEach((el) => {
          el.setAttribute('tabindex', '-1');
          el.setAttribute('disabled', '');
        });

        // Re-enable just the "+" trigger as a click target (mouse/touch only —
        // aria-hidden ancestors correctly stay out of the keyboard tab order)
        // so every repeated copy of a look opens the real modal.
        const trigger = clone.querySelector('.ctl-plus-btn');
        if (trigger) {
          trigger.removeAttribute('ref');
          trigger.removeAttribute('on:click');
          trigger.removeAttribute('disabled');
          trigger.setAttribute('data-ctl-clone-trigger', '');
        }

        // Clones are always off-screen duplicates used only to fill the seamless
        // loop — the eager/high-priority load hint on the original <img> (meant
        // for the one real, on-screen copy) gets copied by innerHTML into every
        // clone too. Left alone, N look items × M clone sets means the browser
        // eagerly fetches and decodes dozens of duplicate animated GIFs at once.
        // Downgrading clones to lazy/auto leaves the real items untouched.
        clone.querySelectorAll('img[loading="eager"]').forEach((img) => {
          img.setAttribute('loading', 'lazy');
          img.removeAttribute('fetchpriority');
        });
        track.appendChild(clone);
      });
    }

    // Tell the keyframe the exact distance to scroll: one original set in px.
    track.style.setProperty('--ctl-scroll-to', `-${originalWidth}px`);

    // Start (or restart) the animation only now that --ctl-scroll-to is set.
    // Removing and re-adding the attribute resets the animation from 0% with
    // the correct target and the current --ctl-duration, so the speed slider
    // in the editor always takes effect immediately on section reload.
    track.removeAttribute('data-ctl-ready');
    void track.offsetWidth; // force reflow so the browser registers the reset
    track.setAttribute('data-ctl-ready', '');
  }

  pauseScroll() {
    this.refs.track.classList.add('ctl-track--paused');
  }

  resumeScroll() {
    this.refs.track.classList.remove('ctl-track--paused');
  }
}

/**
 * @typedef {object} ItemRefs
 * @property {HTMLButtonElement} [plusBtn]
 * @property {HTMLElement} [popup]
 */

/**
 * Single complete-the-look item.
 *
 * The popup is teleported to <body> on open to escape the CSS transform
 * containing block created by the marquee animation on .ctl-track.
 * Without this, position:fixed on the popup is relative to the animated
 * track instead of the viewport, making it appear off-screen.
 *
 * Popups can be opened either by this item's own "+" button, or forwarded
 * by the carousel when the user clicks a decorative clone showing the same
 * look elsewhere in the loop — in both cases #open() positions the popup
 * relative to whichever trigger element was actually clicked.
 *
 * @extends {Component<ItemRefs>}
 */
class CompleteTheLookItemComponent extends Component {
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

  /** @type {HTMLElement | null} the element (real button or clone trigger) that opened the popup */
  #activeTrigger = null;

  /** @type {HTMLElement | null} the visual wrapper (.ctl-item or clone div) that owns #activeTrigger */
  #activeTriggerWrap = null;

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

  /** @returns {CompleteTheLookCarouselComponent | null} */
  get #carousel() {
    return /** @type {CompleteTheLookCarouselComponent | null} */ (
      this.closest('complete-the-look-carousel')
    );
  }

  // ─── Public handlers (wired via on:* in Liquid for the + button only) ─────

  handlePlusBtnClick = () => {
    this.open(this.refs.plusBtn);
  };

  /**
   * Opens this item's popup, positioned relative to `trigger` — either this
   * item's own "+" button, or a decorative clone's trigger elsewhere in the
   * marquee showing the same look.
   * @param {HTMLElement | undefined} trigger
   */
  open = (trigger) => {
    if (!trigger) return;

    // Toggle: clicking the currently-active trigger again closes the popup.
    if (this.#openPopup?.hasAttribute('open')) {
      const wasSameTrigger = this.#activeTrigger === trigger;
      this.#close();
      if (wasSameTrigger) return;
    }

    // Read popup from refs before the MutationObserver clears it when we move it to <body>
    const popup = /** @type {HTMLElement | null} */ (this.refs.popup);
    if (!popup) return;
    this.#openPopup = popup;

    const triggerWrap = /** @type {HTMLElement} */ (trigger.closest('.ctl-item') ?? this);
    this.#activeTrigger = trigger;
    this.#activeTriggerWrap = triggerWrap;

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
      // Desktop: unfold the popup from the top of whichever "+" / × trigger was
      // clicked, so the caret always points back at it regardless of the
      // triggering item's own size or position in the marquee.
      const rect = triggerWrap.getBoundingClientRect();
      const btnRect = trigger.getBoundingClientRect();
      const margin = 8;
      const caretGap = 10; // clearance below the button for the upward-pointing caret
      const caretOffset = 32; // caret center distance from the popup's left edge (see .ctl-popup::after)
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

      const inner = /** @type {HTMLElement | null} */ (popup.querySelector('.ctl-popup__inner'));
      if (inner) inner.style.maxHeight = `${maxHeight}px`;
    }

    // Hide the + button while popup is open (× inside popup takes its place)
    triggerWrap.classList.add('ctl-popup-open');

    // ── Portal: move popup to <body> ──────────────────────────────────────
    // The .ctl-track animation applies transform:translateX(), which makes it
    // a CSS containing block for position:fixed children. Moving to <body>
    // restores true viewport-relative fixed positioning.
    this.#placeholder = document.createComment('ctl-popup');
    popup.parentNode?.insertBefore(this.#placeholder, popup);
    document.body.appendChild(popup);

    // Wire popup's internal events manually — the Component tree no longer
    // reaches the popup now that it's at <body>.
    this.#portalAC = new AbortController();
    const { signal } = this.#portalAC;

    popup.querySelectorAll('.ctl-variant-select').forEach((select) =>
      select.addEventListener('change', this.handleVariantChange, { signal })
    );

    popup.querySelectorAll('.ctl-add-btn').forEach((btn) =>
      btn.addEventListener('click', this.handleAddToCart, { signal })
    );

    popup.querySelectorAll('.ctl-popup-close').forEach((btn) =>
      btn.addEventListener('click', this.#closeHandler, { signal })
    );
    // ─────────────────────────────────────────────────────────────────────

    popup.setAttribute('open', '');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    this.#carousel?.pauseScroll();
  };

  handleVariantChange = (/** @type {Event} */ e) => {
    const select = /** @type {HTMLSelectElement} */ (e.target);
    const card = select.closest('.ctl-product');
    const btn = /** @type {HTMLButtonElement | null} */ (card?.querySelector('.ctl-add-btn'));
    if (btn) btn.dataset.variantId = select.value;
  };

  handleAddToCart = async (/** @type {MouseEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    const btn = /** @type {HTMLButtonElement | null} */ (target.closest('.ctl-add-btn'));
    if (!btn) return;

    const variantId = btn.dataset.variantId;
    if (!variantId) return;

    btn.disabled = true;
    btn.classList.add('ctl-add-btn--loading');

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

      // MOXIE: use the full cart (with item_count) as the event resource, not the raw
      // /cart/add.js response — that's only the added line, which was making the header
      // cart bubble reset to "1" on every add instead of the real total.
      const cart = await fetch('/cart.js').then((r) => r.json());

      this.dispatchEvent(
        new CartAddEvent(cart, variantId, {
          source: 'complete-the-look',
          itemCount: 1,
          variantId,
        })
      );

      btn.classList.remove('ctl-add-btn--loading');
      btn.classList.add('ctl-add-btn--success');
      btn.textContent = '✓ Añadido';

      setTimeout(() => {
        btn.classList.remove('ctl-add-btn--success');
        btn.textContent = 'Añadir a la bolsa';
        btn.disabled = false;
      }, 2200);
    } catch {
      btn.classList.remove('ctl-add-btn--loading');
      btn.disabled = false;
    }
  };

  // ─── Private ──────────────────────────────────────────────────────────────

  #closeHandler = () => this.#close();

  #close() {
    const popup = this.#openPopup;
    const trigger = this.#activeTrigger;
    const triggerWrap = this.#activeTriggerWrap;
    if (!popup?.hasAttribute('open')) return;

    popup.removeAttribute('open');
    trigger?.setAttribute('aria-expanded', 'false');
    triggerWrap?.classList.remove('ctl-popup-open');

    // Tear down portal event listeners
    this.#portalAC?.abort();
    this.#portalAC = null;

    this.#hideOverlay();
    document.body.style.overflow = '';

    // Restore popup to its original position in the DOM
    this.#restorePopup();

    this.#activeTrigger = null;
    this.#activeTriggerWrap = null;

    this.#carousel?.resumeScroll();
  }

  #showOverlay() {
    if (!this.#overlay) {
      this.#overlay = document.createElement('div');
      this.#overlay.className = 'ctl-overlay';
      document.body.appendChild(this.#overlay);
    }
    void this.#overlay.offsetWidth;
    this.#overlay.classList.add('ctl-overlay--visible');
  }

  #hideOverlay() {
    if (!this.#overlay) return;
    this.#overlay.remove();
    this.#overlay = null;
  }

  #restorePopup() {
    const popup = this.#openPopup;
    if (!popup || !this.#placeholder) return;
    const inner = /** @type {HTMLElement | null} */ (popup.querySelector('.ctl-popup__inner'));
    if (inner) inner.style.maxHeight = '';
    this.#placeholder.parentNode?.insertBefore(popup, this.#placeholder);
    this.#placeholder.remove();
    this.#placeholder = null;
    this.#openPopup = null;
  }

  #onDocClick = (/** @type {MouseEvent} */ e) => {
    const popup = this.#openPopup;
    const trigger = this.#activeTrigger;
    if (!popup?.hasAttribute('open')) return;
    const target = /** @type {Node} */ (e.target);
    if (!popup.contains(target) && !trigger?.contains(target)) {
      this.#close();
    }
  };

  #onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') this.#close();
  };
}

customElements.define('complete-the-look-carousel', CompleteTheLookCarouselComponent);
customElements.define('complete-the-look-item', CompleteTheLookItemComponent);
