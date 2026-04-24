import { Component } from '@theme/component';

class PromoCountdown extends Component {
  #interval = null;
  #targetTime = 0;

  connectedCallback() {
    super.connectedCallback();

    const raw = this.dataset.target;
    if (!raw) return;

    this.#targetTime = new Date(raw).getTime();
    if (isNaN(this.#targetTime)) return;

    this.#tick();
    this.#interval = setInterval(() => this.#tick(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.#interval);
  }

  #tick() {
    const diff = this.#targetTime - Date.now();

    if (diff <= 0) {
      clearInterval(this.#interval);
      this.#expire();
      return;
    }

    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (this.refs.days)    this.refs.days.textContent    = String(days).padStart(2, '0');
    if (this.refs.hours)   this.refs.hours.textContent   = String(hours).padStart(2, '0');
    if (this.refs.minutes) this.refs.minutes.textContent = String(minutes).padStart(2, '0');
    if (this.refs.seconds) this.refs.seconds.textContent = String(seconds).padStart(2, '0');
  }

  #expire() {
    if (this.dataset.hideOnExpire === 'true') {
      this.closest('.shopify-section')?.style.setProperty('display', 'none');
      return;
    }
    for (const key of ['days', 'hours', 'minutes', 'seconds']) {
      if (this.refs[key]) this.refs[key].textContent = '00';
    }
  }
}

customElements.define('promo-countdown', PromoCountdown);
