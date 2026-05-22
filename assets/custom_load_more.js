import { Component } from '@theme/component';
import { sectionRenderer } from '@theme/section-renderer';

/**
 * Load more button with progress indicator for PLP and search results.
 * Replaces infinite scroll auto-trigger; fetches next page on button click.
 *
 * @typedef {object} Refs
 * @property {HTMLParagraphElement} progressText
 * @property {HTMLDivElement} progressBar
 * @property {HTMLButtonElement} [button]
 *
 * @extends {Component<Refs>}
 */
class CustomLoadMore extends Component {
  #loading = false;

  async loadMore() {
    if (this.#loading) return;

    const currentPage = Number(this.dataset.currentPage);
    const totalPages = Number(this.dataset.totalPages);
    const nextPage = currentPage + 1;

    if (nextPage > totalPages) return;

    this.#loading = true;

    const { button } = this.refs;
    if (button) button.disabled = true;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', nextPage.toString());
      url.hash = '';

      const html = await sectionRenderer.getSectionHTML(this.dataset.sectionId, true, url);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newItems = doc.querySelectorAll('[ref="grid"] > [ref="cards[]"]');

      const grid = this.closest('results-list')?.querySelector('[ref="grid"]');
      if (grid && newItems.length) {
        grid.append(...newItems);
      }

      this.dataset.currentPage = nextPage.toString();
      history.pushState('', '', url.toString());

      this.#updateUI();
    } finally {
      this.#loading = false;
      const { button } = this.refs;
      if (button) button.disabled = false;
    }
  }

  #updateUI() {
    const perPage = Number(this.dataset.perPage);
    const total = Number(this.dataset.total);
    const currentPage = Number(this.dataset.currentPage);
    const totalPages = Number(this.dataset.totalPages);
    const shown = Math.min(perPage * currentPage, total);

    const { progressText, progressBar, button } = this.refs;

    if (progressText) {
      const template = progressText.dataset.template ?? this.dataset.progressTemplate ?? '';
      progressText.textContent = template
        ? template.replace('__CURRENT__', shown)
        : `${shown} / ${total}`;
    }

    if (progressBar) {
      progressBar.style.setProperty('--load-more-progress', `${((shown / total) * 100).toFixed(2)}%`);
    }

    if (button && currentPage >= totalPages) {
      button.hidden = true;
    }
  }
}

if (!customElements.get('custom-load-more')) {
  customElements.define('custom-load-more', CustomLoadMore);
}
