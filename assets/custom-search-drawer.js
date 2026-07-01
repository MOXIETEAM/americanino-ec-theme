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

  /** @type {HTMLElement | null} Cache del panel — ver nota en connectedCallback. */
  #panelEl = null;

  /** @type {Element | null} Padre original del panel, para devolverlo al cerrar. */
  #panelHome = null;

  // Accesores directos (evitan repetir querySelector)
  get #pill()  { return this.querySelector('.mox-spill'); }
  get #input() { return /** @type {HTMLInputElement|null} */ (this.querySelector('.mox-spill__input')); }

  connectedCallback() {
    super.connectedCallback();
    const { signal } = this.#controller;

    // Cacheado una sola vez: tras abrir, el panel se mueve fuera de este
    // elemento (ver #openDrawer), así que this.querySelector('.mox-sdrawer')
    // dejaría de encontrarlo.
    this.#panelEl = this.querySelector('.mox-sdrawer');

    // Clic en la píldora → abrir (el input tiene pointer-events:none, el clic llega aquí)
    this.#pill?.addEventListener('pointerdown', this.#onPillPointerDown, { signal });

    // El usuario escribe (cuando el input ya está activo) → asegurar que el panel está abierto
    this.#input?.addEventListener('input', () => this.openDrawer(), { signal });

    // Escape — capture para interceptar antes que predictive-search
    document.addEventListener('keydown', this.#onKeyDown, { signal, capture: true });

    // Clic fuera → cerrar
    document.addEventListener('pointerdown', this.#onClickOutside, { signal });

    this.#trackHeaderPosition();
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

    const panel = this.#panelEl;
    if (panel) {
      // Sacar el panel de la jerarquía del header. `.header` tiene
      // `contain: layout style` y `.header__row--top` tiene `backdrop-filter`
      // (blur de marca) — ambos convierten a ese ancestro en el containing
      // block de sus descendientes `position: fixed`, así que el panel de
      // altura completa quedaría medido contra la caja del header (~76px) en
      // vez del viewport. Neutralizar esos estilos en el header (como hace
      // custom_mobile_drawer.liquid) no sirve aquí: el drawer solo cubre una
      // franja angosta a la derecha, así que el resto del header quedaría
      // visible sin su blur de marca. Mover el panel a <body> resuelve el
      // problema de raíz sin tocar el header en absoluto.
      this.#panelHome ??= panel.parentElement;

      // Las variables --product-corner-radius / --card-corner-radius / --title-case
      // se definen inline en predictive-search-component (mox-sdrawer__psc) y
      // heredan por cascada normal; al mover el panel fuera de ese ancestro
      // hay que copiarlas para no perder esos estilos de marca.
      const psc = this.querySelector('.mox-sdrawer__psc');
      if (psc instanceof HTMLElement) {
        for (const prop of ['--product-corner-radius', '--card-corner-radius', '--title-case']) {
          const value = psc.style.getPropertyValue(prop);
          if (value) panel.style.setProperty(prop, value);
        }
      }

      document.body.appendChild(panel);

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
    const panel = this.#panelEl;
    if (panel) {
      panel.removeAttribute('data-open');
      const hide = () => {
        if (this.#isOpen) return;
        panel.hidden = true;
        // Devolverlo a su posición original en el DOM
        this.#panelHome?.appendChild(panel);
      };
      panel.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 300); // fallback
    }
  }

  // ── Posición bajo el header ──────────────────────────────────────────────────
  //
  // El panel debe empezar justo debajo del header (no encima), sea cual sea su
  // altura real (con/sin announcement bar, sticky, transparente...). Mismo
  // patrón que mega-menu.js usa para su panel: medir el borde inferior real
  // del header en coordenadas de viewport y exponerlo como variable CSS.
  #trackHeaderPosition() {
    const header = document.getElementById('header-component');
    if (!header) return;

    const { signal } = this.#controller;

    const update = () => {
      const { bottom } = header.getBoundingClientRect();
      document.documentElement.style.setProperty('--mox-sdrawer-top', `${Math.max(0, Math.round(bottom))}px`);
    };

    update();
    window.addEventListener('scroll', update, { passive: true, signal });
    window.addEventListener('resize', update, { passive: true, signal });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(update).observe(header);
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
    if (target instanceof Node && !this.contains(target) && !this.#panelEl?.contains(target)) {
      this.closeDrawer();
    }
  };
}

customElements.define('custom-search-drawer', CustomSearchDrawer);
