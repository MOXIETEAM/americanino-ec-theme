import { Component } from '@theme/component';

/**
 * MOXIE: el menú (this._menu) se mueve a <body> al conectar.
 *
 * Motivo: #header-component aplica su propio `backdrop-filter` (modo
 * 'glass' del header) para poder blurear el contenido real de la página
 * bajo el header sticky. Un `backdrop-filter` en un DESCENDIENTE de ese
 * elemento no puede cruzar esa misma frontera de compositing — solo
 * bluerea otros elementos dentro de la misma capa, no la página real
 * (mismo problema ya documentado para .header__row--top/bottom en
 * custom-header.liquid, y la razón por la que mega-menu.js también
 * mueve su panel a <body>). Como el menú vive fuera del árbol del
 * Component tras moverlo, no puede seguir siendo un `ref` — se guarda
 * en `this._menu` y se posiciona a mano (position: fixed) bajo el botón.
 */
class CustomAccountDropdown extends Component {
  connectedCallback() {
    super.connectedCallback();
    this._onOutsideClick = this._handleOutsideClick.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onReposition = this._positionMenu.bind(this);

    this._menu = this.refs.menu ?? null;
    if (this._menu) {
      document.body.appendChild(this._menu);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('scroll', this._onReposition);
    window.removeEventListener('resize', this._onReposition);
    this._menu?.remove();
  }

  onToggle() {
    this.refs.trigger.getAttribute('aria-expanded') === 'true' ? this._close() : this._open();
  }

  _positionMenu() {
    if (!this._menu) return;
    const rect = this.refs.trigger.getBoundingClientRect();
    this._menu.style.top = `${Math.round(rect.bottom + 16)}px`;
    this._menu.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
  }

  _open() {
    if (!this._menu) return;
    this.refs.trigger.setAttribute('aria-expanded', 'true');
    this._positionMenu();
    this._menu.removeAttribute('hidden');
    document.addEventListener('click', this._onOutsideClick);
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('scroll', this._onReposition, { passive: true });
    window.addEventListener('resize', this._onReposition, { passive: true });
  }

  _close() {
    if (!this._menu) return;
    this.refs.trigger.setAttribute('aria-expanded', 'false');
    this._menu.setAttribute('hidden', '');
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('scroll', this._onReposition);
    window.removeEventListener('resize', this._onReposition);
  }

  _handleOutsideClick(event) {
    if (!this.contains(event.target) && !this._menu?.contains(event.target)) this._close();
  }

  _handleKeyDown(event) {
    if (event.key === 'Escape') {
      this._close();
      this.refs.trigger.focus();
    }
  }
}

customElements.define('custom-account-dropdown', CustomAccountDropdown);
