import { Component } from '@theme/component';

/**
 * MOXIE: Custom Search Drawer
 *
 * Pill con input real en el header. Clic → input activo + panel de resultados.
 *
 * IMPORTANTE: NO usa this.refs para pill/panel porque predictive-search-component
 * está anidado dentro de custom-search-drawer, y el sistema ref= de Horizon asigna
 * cada ref al Component ancestro más cercano — por tanto todos los ref= quedan en
 * predictive-search-component, y this.refs de custom-search-drawer queda vacío.
 * Se usa querySelector directamente.
 *
 * @extends {Component}
 */
class CustomSearchDrawer extends Component {
  #controller = new AbortController();
  #isOpen = false;

  // Accesores directos (evitan repetir querySelector)
  get #pill()  { return this.querySelector('.mox-spill'); }
  get #panel() { return this.querySelector('.mox-sdrawer'); }
  get #input() { return /** @type {HTMLInputElement|null} */ (this.querySelector('.mox-spill__input')); }

  connectedCallback() {
    super.connectedCallback();
    const { signal } = this.#controller;

    // Clic en la píldora → abrir (el input tiene pointer-events:none, el clic llega aquí)
    this.#pill?.addEventListener('pointerdown', this.#onPillPointerDown, { signal });

    // El usuario escribe (cuando el input ya está activo) → asegurar que el panel está abierto
    this.#input?.addEventListener('input', () => this.openDrawer(), { signal });

    // Escape — capture para interceptar antes que predictive-search
    document.addEventListener('keydown', this.#onKeyDown, { signal, capture: true });

    // Clic fuera → cerrar
    document.addEventListener('pointerdown', this.#onClickOutside, { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  openDrawer() {
    if (this.#isOpen) return;
    this.#isOpen = true;

    // Activar el input (quitar estado inactivo)
    const input = this.#input;
    if (input) input.removeAttribute('tabindex');

    // Mostrar panel con animación
    const panel = this.#panel;
    if (panel) {
      panel.hidden = false;
      panel.getBoundingClientRect(); // forzar reflow para que la transición CSS arranque
      panel.setAttribute('data-open', '');
    }

    // Marcar el host para el selector CSS de pointer-events del input
    this.setAttribute('data-open', '');
    this.#pill?.setAttribute('aria-expanded', 'true');

    // Enfocar el input
    requestAnimationFrame(() => this.#input?.focus({ preventScroll: true }));
  }

  closeDrawer() {
    if (!this.#isOpen) return;
    this.#isOpen = false;

    // Volver el input a estado inactivo
    const input = this.#input;
    if (input) {
      input.setAttribute('tabindex', '-1');
      input.blur();
    }

    this.removeAttribute('data-open');
    this.#pill?.setAttribute('aria-expanded', 'false');

    // Animar salida y ocultar
    const panel = this.#panel;
    if (panel) {
      panel.removeAttribute('data-open');
      const hide = () => { if (!this.#isOpen) panel.hidden = true; };
      panel.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 300); // fallback
    }
  }

  // ── Privado ─────────────────────────────────────────────────────────────────

  #onPillPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    this.openDrawer();
  };

  #onKeyDown = (event) => {
    if (event.key !== 'Escape' || !this.#isOpen) return;
    event.stopPropagation();
    this.closeDrawer();
  };

  #onClickOutside = (event) => {
    if (!this.#isOpen) return;
    const target = /** @type {Node} */ (event.composedPath?.()[0] ?? event.target);
    if (target instanceof Node && !this.contains(target)) {
      this.closeDrawer();
    }
  };
}

customElements.define('custom-search-drawer', CustomSearchDrawer);
