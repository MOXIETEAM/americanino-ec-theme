import { Component } from '@theme/component';

class CategoryGridSlider extends Component {
  connectedCallback() {
    super.connectedCallback();
    this._track = this.querySelector('.mox-cg__track');
    if (!this._track) return;

    this._dotsContainer = this.refs.dotsContainer ?? null;

    this.refs.prev?.addEventListener('click', () => this._slide(-1));
    this.refs.next?.addEventListener('click', () => this._slide(1));

    this._track.addEventListener('scroll', () => this._sync(), { passive: true });
    this._track.addEventListener('pointerdown', this._handlePointerDown);

    // The number of reachable stops depends on how many cards fit per view
    // (slides_desktop/slides_mobile), which changes with viewport width —
    // recompute whenever the track's size changes rather than hardcoding
    // one dot per card (see _rebuildDots for why that broke).
    this._resizeObserver = new ResizeObserver(() => this._scheduleRebuild());
    this._resizeObserver.observe(this._track);

    this._rebuildDots();
    this._sync();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  _scheduleRebuild() {
    cancelAnimationFrame(this._rebuildFrame);
    this._rebuildFrame = requestAnimationFrame(() => {
      this._rebuildDots();
      this._sync();
    });
  }

  /**
   * One dot per card only makes sense when a single card is visible at a
   * time. With multiple cards visible per view (slides_desktop/mobile > 1),
   * the track can't actually scroll to every card's own position — it stops
   * a few cards early, so the trailing dots were dead: clicking them, or
   * scrolling to the end, always landed on the same spot and highlighted an
   * earlier dot instead. Dots must represent the actual reachable stops
   * ("pages"), not the raw card count.
   */
  _pageCount() {
    const step = this._cardStep();
    const maxScroll = this._track.scrollWidth - this._track.clientWidth;
    if (!step || maxScroll <= 1) return 1;
    return Math.ceil(maxScroll / step) + 1;
  }

  _pageScrollLeft(i) {
    const step = this._cardStep();
    const maxScroll = this._track.scrollWidth - this._track.clientWidth;
    const lastPage = this._pageCount() - 1;
    // Snap the last page to the true max scroll position — it rarely lands
    // on an exact multiple of the card width, since the last few cards only
    // partially fit past the final full step.
    return i >= lastPage ? maxScroll : i * step;
  }

  _rebuildDots() {
    if (!this._dotsContainer) return;

    const pageCount = this._pageCount();
    const existing = this._dotsContainer.querySelectorAll('.mox-cg__dot');

    this._dotsContainer.toggleAttribute('hidden', pageCount <= 1);
    if (existing.length === pageCount) return;

    this._dotsContainer.replaceChildren();
    for (let i = 0; i < pageCount; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'mox-cg__dot';
      dot.dataset.index = String(i);
      dot.setAttribute('aria-label', Theme.translations.mox_go_to_slide.replace('__INDEX__', String(i + 1)));
      dot.addEventListener('click', () => this._scrollToIndex(i));
      this._dotsContainer.append(dot);
    }
  }

  /**
   * Enables click-and-drag scrolling with the mouse. Touch/pen already
   * scroll the track natively, so only mouse input is handled here.
   * @param {PointerEvent} event
   */
  _handlePointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const track = this._track;
    const startX = event.clientX;
    const startScrollLeft = track.scrollLeft;
    let moved = false;

    const onPointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;

      if (!moved) {
        // Only commit to "dragging" once the pointer has actually moved a
        // few pixels. Capturing the pointer (or preventing default) on every
        // plain click — even one with zero movement — breaks the normal
        // click-through navigation on the cards' links/buttons.
        if (Math.abs(delta) <= 3) return;
        moved = true;
        track.setPointerCapture(event.pointerId);
        track.classList.add('mox-cg__track--dragging');
      }

      track.scrollLeft = startScrollLeft - delta;
    };

    const onPointerUp = () => {
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', onPointerUp);

      if (moved) {
        track.releasePointerCapture(event.pointerId);
        track.classList.remove('mox-cg__track--dragging');

        // Swallow the click that follows a real drag so links/buttons under
        // the pointer don't get accidentally activated.
        const preventClick = (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        };
        track.addEventListener('click', preventClick, { capture: true, once: true });
      }
    };

    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
  };

  _cardStep() {
    const card = this._track.querySelector('.mox-cg__card');
    if (!card) return 0;
    const gap = parseFloat(getComputedStyle(this._track).columnGap) || 0;
    return card.offsetWidth + gap;
  }

  _slide(dir) {
    this._track.scrollBy({ left: dir * this._cardStep(), behavior: 'smooth' });
  }

  _scrollToIndex(i) {
    this._track.scrollTo({ left: this._pageScrollLeft(i), behavior: 'smooth' });
  }

  _sync() {
    const { scrollLeft, scrollWidth, clientWidth } = this._track;
    this.refs.prev?.toggleAttribute('disabled', scrollLeft <= 1);
    this.refs.next?.toggleAttribute('disabled', scrollLeft >= scrollWidth - clientWidth - 1);

    if (!this._dotsContainer) return;

    // Find the page whose target position is closest to the current scroll —
    // the last page's target is the true max scroll, not an exact card-width
    // multiple, so a simple division would miss it.
    const pageCount = this._pageCount();
    let activeIndex = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < pageCount; i++) {
      const distance = Math.abs(this._pageScrollLeft(i) - scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        activeIndex = i;
      }
    }

    this._dotsContainer.querySelectorAll('.mox-cg__dot').forEach((dot, i) => {
      dot.classList.toggle('mox-cg__dot--active', i === activeIndex);
    });
  }
}

customElements.define('category-grid-slider', CategoryGridSlider);
