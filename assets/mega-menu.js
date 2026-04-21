/**
 * MOXIE Megamenu — mega-menu.js
 *
 * Megamenu multimarca impulsado por Metaobjects.
 *
 * Apertura de paneles:
 *   Cada <a data-mega-trigger="nina"> en el navbar dispara la búsqueda de
 *   .moxie-mega__panel[data-panel="nina"].
 *   Si no existe panel para ese ítem, el link funciona como URL normal.
 *
 * Cambio de categoría (panel estándar):
 *   Hover en .moxie-mega__catgroup → activa el .moxie-mega__banner-set
 *   cuyo data-banner-cat coincide. Banners prerrenderizados, sin re-requests.
 *
 * Cambio de licencia (panel personajes):
 *   Hover en .moxie-mega__lic-item → activa el .moxie-mega__lic-subgroup
 *   y .moxie-mega__lic-banner correspondientes.
 *
 * Nota: _bindTriggers usa event delegation en document para sobrevivir
 * a cualquier re-render/hydration del header.
 */

class MoxieMegaMenu {
  constructor() {
    /** @type {HTMLElement|null} */
    this.el = document.getElementById('moxie-megamenu');
    if (!this.el) {
      console.warn('[MoxieMega] #moxie-megamenu no encontrado en el DOM.');
      return;
    }

    /** @type {HTMLElement|null} */
    this.activePanel = null;

    /** @type {ReturnType<typeof setTimeout>|null} */
    this.closeTimer = null;

    /** Delay en ms para cerrar al salir del panel o del trigger */
    this.CLOSE_DELAY = 300;

    this._init();
  }

  // ── Inicialización ───────────────────────────────────────────────────────────

  _init() {
    // Mover al <body> para que position:fixed sea relativo al viewport
    document.body.appendChild(this.el);

    this._bindTriggers();
    this._bindPanelEvents();
    this._bindGlobalClose();
    this._trackHeaderPosition();
    this._preActivateLicensePanels();

    const triggers = document.querySelectorAll('[data-mega-trigger]');
    const panels   = this.el.querySelectorAll('.moxie-mega__panel');

    console.group('[MoxieMega] Diagnóstico');
    console.log(`Triggers     : ${triggers.length}`);
    triggers.forEach(t => console.log(`  trigger → "${t.dataset.megaTrigger}"`));
    console.log(`Paneles      : ${panels.length}`);
    panels.forEach(p => console.log(`  panel  → data-panel="${p.dataset.panel}" data-brand="${p.dataset.brand}"`));
    if (triggers.length === 0) {
      console.warn('⚠ Sin triggers — verifica que los ítems del menú en el bloque de header están configurados.');
    }
    if (panels.length === 0) {
      console.warn('⚠ Sin paneles — verifica que el menú configurado en la sección Megamenu tiene ítems.');
    }
    console.groupEnd();
  }

  /**
   * Devuelve el panel que corresponde a triggerKey.
   * @param {string} triggerKey  Handle del ítem del navbar (ej: 'nina')
   * @returns {HTMLElement|null}
   */
  _getPanel(triggerKey) {
    const panel = this.el.querySelector(`.moxie-mega__panel[data-panel="${triggerKey}"]`);
    if (!panel) {
      console.warn(`[MoxieMega] Panel no encontrado para trigger="${triggerKey}"`);
    }
    return panel;
  }

  // ── Triggers del navbar — event delegation (sobrevive hydration) ─────────────

  _bindTriggers() {
    // mouseover/mouseout bubbles → usamos para delegation en lugar de mouseenter/mouseleave
    document.addEventListener('mouseover', (e) => {
      const el = /** @type {Element} */ (e.target);
      const trigger = el?.closest('[data-mega-trigger]');

      if (trigger) {
        // Ítem con submenu → abrir su panel
        this._cancelClose();
        const panel = this._getPanel(/** @type {HTMLElement} */ (trigger).dataset.megaTrigger ?? '');
        panel ? this._open(panel) : this._scheduleClose(50);
      } else if (el?.closest('[data-mega-nav]')) {
        // Ítem sin submenu dentro del navbar → cerrar el panel activo
        this._scheduleClose(50);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const trigger = /** @type {Element} */ (e.target)?.closest('[data-mega-trigger]');
      if (!trigger) return;
      const toEl = /** @type {Element|null} */ (e.relatedTarget);
      // No cerrar si el destino es: el megamenu, otro trigger, o el navbar (zona segura entre ítems)
      if (toEl && (
        this._isInMega(toEl) ||
        toEl.closest('[data-mega-trigger]') ||
        toEl.closest('[data-mega-nav]')
      )) return;
      this._scheduleClose();
    });

    // Teclado — focusin/focusout bubbles
    document.addEventListener('focusin', (e) => {
      const trigger = /** @type {Element} */ (e.target)?.closest('[data-mega-trigger]');
      if (!trigger) return;
      const panel = this._getPanel(/** @type {HTMLElement} */ (trigger).dataset.megaTrigger);
      if (panel) { this._cancelClose(); this._open(panel); }
    });

    document.addEventListener('focusout', (e) => {
      const trigger = /** @type {Element} */ (e.target)?.closest('[data-mega-trigger]');
      if (!trigger) return;
      const toEl = /** @type {Element|null} */ (e.relatedTarget);
      if (toEl && (this._isInMega(toEl) || toEl.closest('[data-mega-trigger]'))) return;
      this._scheduleClose(200);
    });
  }

  // ── Eventos dentro del panel ─────────────────────────────────────────────────

  _bindPanelEvents() {
    // Mantener panel abierto mientras el cursor esté sobre él
    this.el.addEventListener('mouseenter', () => this._cancelClose());
    this.el.addEventListener('mouseleave', (e) => {
      const toEl = /** @type {Element|null} */ (e.relatedTarget);
      if (
        toEl &&
        (this._isTrigger(toEl) || toEl.closest('[data-mega-nav]'))
      ) return;
      this._scheduleClose();
    });

    // Hover en categoría (panel estándar) — delegación de eventos
    this.el.addEventListener('mouseover', (e) => {
      const catGroup = /** @type {Element} */ (e.target)?.closest('.moxie-mega__catgroup');
      if (!catGroup) return;
      const panel = catGroup.closest('.moxie-mega__panel--standard');
      if (panel) this._activateCategory(panel, /** @type {HTMLElement} */ (catGroup).dataset.cat);
    });

    // Hover en licencia (panel personajes) — delegación de eventos
    this.el.addEventListener('mouseover', (e) => {
      const licItem = /** @type {Element} */ (e.target)?.closest('.moxie-mega__lic-item');
      if (!licItem) return;
      const panel = licItem.closest('.moxie-mega__panel--licenses');
      if (panel) this._activateLicense(panel, /** @type {HTMLElement} */ (licItem).dataset.lic);
    });

    // Click también activa licencia (táctil / teclado)
    this.el.addEventListener('click', (e) => {
      const licItem = /** @type {Element} */ (e.target)?.closest('.moxie-mega__lic-item');
      if (!licItem) return;
      const panel = licItem.closest('.moxie-mega__panel--licenses');
      if (panel) this._activateLicense(panel, /** @type {HTMLElement} */ (licItem).dataset.lic);
    });

    // Click en backdrop
    this.el.querySelector('.moxie-mega__backdrop')
      ?.addEventListener('click', () => this._close());
  }

  // ── Cierre global ────────────────────────────────────────────────────────────

  _bindGlobalClose() {
    // Escape: cierra y devuelve foco al trigger
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.activePanel) return;
      const key = this.activePanel.dataset.panel;
      this._close();
      document.querySelector(`[data-mega-trigger="${key}"]`)?.focus();
    });

    // Click fuera del mega y de los triggers
    document.addEventListener('click', (e) => {
      if (
        !this.el.contains(/** @type {Node} */ (e.target)) &&
        !/** @type {Element} */ (e.target)?.closest('[data-mega-trigger]')
      ) {
        this._close();
      }
    });

  }

  // ── Abrir / cerrar ───────────────────────────────────────────────────────────

  /**
   * Abre un panel y cierra el anterior si hubiera uno.
   * @param {HTMLElement} panel
   */
  _open(panel) {
    if (this.activePanel === panel) return;

    if (this.activePanel) {
      this.activePanel.classList.remove('moxie-mega__panel--active');
    }

    // Forzar reflow para que la transición CSS arranque desde el estado inicial
    void panel.offsetHeight;
    panel.classList.add('moxie-mega__panel--active');

    this.activePanel = panel;
    this.el.classList.add('moxie-mega--open');
    this.el.removeAttribute('aria-hidden');

    // Auto-activar primer ítem al abrir
    if (panel.classList.contains('moxie-mega__panel--standard')) {
      const firstCat = panel.querySelector('.moxie-mega__catgroup');
      if (firstCat) this._activateCategory(panel, /** @type {HTMLElement} */ (firstCat).dataset.cat);
    }
  }

  _close() {
    this._cancelClose();
    if (this.activePanel) {
      this.activePanel.classList.remove('moxie-mega__panel--active');
      this.activePanel = null;
    }
    this.el.classList.remove('moxie-mega--open');
    this.el.setAttribute('aria-hidden', 'true');
  }

  _scheduleClose(ms = this.CLOSE_DELAY) {
    this.closeTimer = setTimeout(() => this._close(), ms);
  }

  _cancelClose() {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  // ── Cambio de categoría (panel estándar) ─────────────────────────────────────

  /**
   * @param {Element} panel
   * @param {string} catKey  Handle de la categoría
   */
  _activateCategory(panel, catKey) {
    panel.querySelectorAll('.moxie-mega__catgroup').forEach((cg) => {
      cg.classList.toggle('moxie-mega__catgroup--active', /** @type {HTMLElement} */ (cg).dataset.cat === catKey);
    });
    panel.querySelectorAll('.moxie-mega__banner-set').forEach((bs) => {
      bs.classList.toggle(
        'moxie-mega__banner-set--active',
        /** @type {HTMLElement} */ (bs).dataset.bannerCat === catKey
      );
    });
  }

  // ── Cambio de licencia (panel personajes) ─────────────────────────────────────

  /**
   * @param {Element} panel
   * @param {string} licKey  Handle de la licencia
   */
  _activateLicense(panel, licKey) {
    // Botones de licencia
    panel.querySelectorAll('.moxie-mega__lic-item').forEach((li) => {
      const active = /** @type {HTMLElement} */ (li).dataset.lic === licKey;
      li.classList.toggle('moxie-mega__lic-item--active', active);
      li.setAttribute('aria-pressed', String(active));
    });

    // Sub-ítems col 3
    panel.querySelectorAll('.moxie-mega__lic-subgroup').forEach((sg) => {
      sg.classList.toggle(
        'moxie-mega__lic-subgroup--active',
        /** @type {HTMLElement} */ (sg).dataset.licSub === licKey
      );
    });

    // Banner col 4
    panel.querySelectorAll('.moxie-mega__lic-banner').forEach((b) => {
      b.classList.toggle(
        'moxie-mega__lic-banner--active',
        /** @type {HTMLElement} */ (b).dataset.licBanner === licKey
      );
    });
  }

  /**
   * Pre-activa la primera licencia en cada panel de personajes
   * para que col 3 y col 4 estén pobladas al abrir por primera vez.
   */
  _preActivateLicensePanels() {
    this.el.querySelectorAll('.moxie-mega__panel--licenses').forEach((panel) => {
      const first = panel.querySelector('.moxie-mega__lic-item');
      if (first) this._activateLicense(panel, /** @type {HTMLElement} */ (first).dataset.lic);
    });
  }

  // ── Posición relativa al header ──────────────────────────────────────────────

  _trackHeaderPosition() {
    const header = document.getElementById('header-component');
    if (!header) {
      console.warn('[MoxieMega] #header-component no encontrado — usando top fijo 80px');
      return;
    }

    const update = () => {
      const { bottom } = header.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--moxie-mega-top',
        `${Math.round(bottom)}px`
      );
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(update).observe(header);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** ¿El elemento está dentro del panel del megamenu? */
  _isInMega(el) {
    return el != null && this.el.contains(/** @type {Node} */ (el));
  }

  /** ¿El elemento es (o está dentro de) un trigger del navbar? */
  _isTrigger(el) {
    return el != null && !!/** @type {Element} */ (el)?.closest('[data-mega-trigger]');
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new MoxieMegaMenu());
} else {
  new MoxieMegaMenu();
}
