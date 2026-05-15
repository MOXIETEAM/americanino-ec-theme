import { Component } from '@theme/component';

class CustomAccountDropdown extends Component {
  connectedCallback() {
    super.connectedCallback();
    this._onOutsideClick = this._handleOutsideClick.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  onToggle() {
    this.refs.trigger.getAttribute('aria-expanded') === 'true' ? this._close() : this._open();
  }

  _open() {
    this.refs.trigger.setAttribute('aria-expanded', 'true');
    this.refs.menu.removeAttribute('hidden');
    document.addEventListener('click', this._onOutsideClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  _close() {
    this.refs.trigger.setAttribute('aria-expanded', 'false');
    this.refs.menu.setAttribute('hidden', '');
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _handleOutsideClick(event) {
    if (!this.contains(event.target)) this._close();
  }

  _handleKeyDown(event) {
    if (event.key === 'Escape') {
      this._close();
      this.refs.trigger.focus();
    }
  }
}

customElements.define('custom-account-dropdown', CustomAccountDropdown);
