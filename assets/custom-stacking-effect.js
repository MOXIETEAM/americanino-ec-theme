/**
 * Moxie — Stacked Panels Effect
 *
 * Crea un wrapper <div class="moxie-stacking-wrapper"> alrededor de todos
 * los .shopify-section desde el Hero hasta el Overlay (inclusive).
 * Esto confina el position: sticky del Hero a esa zona: cuando el wrapper
 * termina, el Hero se desprende y desaparece con el resto.
 *
 * Soporta secciones intermedias entre Hero y Overlay (p.ej. Promo Countdown).
 */
(function () {
  'use strict';

  var WRAPPER_CLASS = 'moxie-stacking-wrapper';
  var hasCSS = CSS.supports('selector(:has(*))');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getSections() {
    var heroEl = document.querySelector('[data-stacking="hero"]');
    var overlayEl = document.querySelector('[data-stacking="overlay"]');
    return {
      hero: heroEl ? heroEl.closest('.shopify-section') : null,
      overlay: overlayEl ? overlayEl.closest('.shopify-section') : null,
    };
  }

  function buildWrapper() {
    if (reducedMotion) return;

    var s = getSections();
    if (!s.hero || !s.overlay) return;

    var parent = s.hero.parentNode;

    // Deben compartir el mismo padre
    if (s.overlay.parentNode !== parent) {
      console.warn('[Moxie Stacking] Hero y Overlay no comparten el mismo contenedor padre.');
      return;
    }

    // Recopilar todos los .shopify-section desde Hero hasta Overlay (inclusive)
    var toWrap = [];
    var current = s.hero;
    while (current) {
      toWrap.push(current);
      if (current === s.overlay) break;
      current = current.nextElementSibling;
      // Si llegamos al final sin encontrar el Overlay, Hero está después de Overlay — abortar
      if (!current) {
        console.warn('[Moxie Stacking] Overlay no encontrado después del Hero. Verifica el orden de secciones.');
        return;
      }
    }

    // Evitar doble wrapping
    if (s.hero.parentElement && s.hero.parentElement.classList.contains(WRAPPER_CLASS)) return;

    var wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    parent.insertBefore(wrapper, s.hero);
    toWrap.forEach(function (el) { wrapper.appendChild(el); });

    // Fallback de clases para navegadores sin :has()
    if (!hasCSS) {
      s.hero.classList.add('moxie-stacking-hero');
      s.overlay.classList.add('moxie-stacking-overlay');
    }
  }

  function destroyWrapper() {
    var wrapper = document.querySelector('.' + WRAPPER_CLASS);
    if (!wrapper) return;
    var parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  function reinit() {
    destroyWrapper();
    buildWrapper();
  }

  // Inicialización
  buildWrapper();

  // Theme Editor
  document.addEventListener('shopify:section:load', reinit);
  document.addEventListener('shopify:section:reorder', reinit);
  document.addEventListener('shopify:section:unload', reinit);
})();
