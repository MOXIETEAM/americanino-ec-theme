import { Component } from '@theme/component';

class CategoryGridSlider extends Component {
  connectedCallback() {
    super.connectedCallback();
    this._track = this.querySelector('.mox-cg__track');
    if (!this._track) return;

    this.refs.prev?.addEventListener('click', () => this._slide(-1));
    this.refs.next?.addEventListener('click', () => this._slide(1));

    this.querySelectorAll('.mox-cg__dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const i = parseInt(dot.dataset.index, 10);
        this._scrollToIndex(i);
      });
    });

    this._track.addEventListener('scroll', () => this._sync(), { passive: true });
    this._track.addEventListener('pointerdown', this._handlePointerDown);
    this._sync();
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
    this._track.scrollTo({ left: i * this._cardStep(), behavior: 'smooth' });
  }

  _sync() {
    const { scrollLeft, scrollWidth, clientWidth } = this._track;
    this.refs.prev?.toggleAttribute('disabled', scrollLeft <= 1);
    this.refs.next?.toggleAttribute('disabled', scrollLeft >= scrollWidth - clientWidth - 1);

    const activeIndex = Math.round(scrollLeft / (this._cardStep() || 1));
    this.querySelectorAll('.mox-cg__dot').forEach((dot, i) => {
      dot.classList.toggle('mox-cg__dot--active', i === activeIndex);
    });
  }
}

customElements.define('category-grid-slider', CategoryGridSlider);
