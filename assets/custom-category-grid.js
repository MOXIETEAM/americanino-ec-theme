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
    this._sync();
  }

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
