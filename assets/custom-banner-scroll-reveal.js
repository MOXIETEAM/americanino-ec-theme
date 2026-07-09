/**
 * Moxie — Banner Scroll Reveal
 * IntersectionObserver-driven expand + stagger animation.
 * Re-triggers on scroll-out / scroll-back-in.
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initSlider(banner) {
    var slides = Array.from(banner.querySelectorAll('[data-slide]'));
    var dots = Array.from(banner.querySelectorAll('[data-dot]'));
    var prevBtn = banner.querySelector('[data-prev]');
    var nextBtn = banner.querySelector('[data-next]');
    var count = slides.length;
    var current = 0;

    if (count <= 1) return;

    function activate(index) {
      slides[current].classList.remove('is-active');
      if (dots[current]) dots[current].classList.remove('is-active');
      current = ((index % count) + count) % count;
      slides[current].classList.add('is-active');
      if (dots[current]) dots[current].classList.add('is-active');
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { activate(i); });
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { activate(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { activate(current + 1); });
  }

  function initSlideLinks(banner) {
    Array.from(banner.querySelectorAll('[data-slide-link]')).forEach(function (slide) {
      var link = slide.getAttribute('data-slide-link');
      slide.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        window.location.href = link;
      });
    });
  }

  function initObserver(banner) {
    if (reducedMotion) {
      banner.classList.add('is-visible');
      return;
    }

    // Pre-compute collapsed height (always px from schema range setting)
    var collapsedH = parseFloat(
      getComputedStyle(banner).getPropertyValue('--banner-reveal-collapsed-height')
    ) || 200;

    // Convert svh → px so both endpoints are the same unit (px→px is smoother)
    var svhVal = parseFloat(
      getComputedStyle(banner).getPropertyValue('--banner-reveal-full-height')
    ) || 80;
    var fullH = Math.round(window.innerHeight * svhVal / 100);

    // Lock both heights as px in CSS vars and set inline height as starting point
    banner.style.setProperty('--banner-reveal-full-height', fullH + 'px');
    banner.style.height = collapsedH + 'px';

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.intersectionRatio >= 0.25) {
            // Set the px target before adding the class so CSS transition gets px→px
            banner.style.height = fullH + 'px';
            banner.classList.add('is-visible');
          } else if (entry.intersectionRatio === 0) {
            // Only reset when fully out of view — avoids flickering at the threshold boundary
            banner.style.height = collapsedH + 'px';
            banner.classList.remove('is-visible');
          }
        });
      },
      { threshold: [0, 0.25] }
    );

    observer.observe(banner);
    banner._bannerObserver = observer;

    // Recalculate on resize (orientation change, window resize)
    var resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        fullH = Math.round(window.innerHeight * svhVal / 100);
        banner.style.setProperty('--banner-reveal-full-height', fullH + 'px');
        if (banner.classList.contains('is-visible')) {
          banner.style.height = fullH + 'px';
        }
      }, 150);
    }
    window.addEventListener('resize', onResize, { passive: true });
    banner._bannerResizeHandler = onResize;
  }

  function init(banner) {
    if (banner._bannerInit) return;
    banner._bannerInit = true;
    initSlider(banner);
    initObserver(banner);
    initSlideLinks(banner);
  }

  function initAll() {
    document.querySelectorAll('[data-banner-reveal]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor: re-init on section load, clean up observer on unload
  document.addEventListener('shopify:section:load', function (e) {
    var section = e.target || document.getElementById('shopify-section-' + e.detail.sectionId);
    if (!section) return;
    section.querySelectorAll('[data-banner-reveal]').forEach(function (banner) {
      banner._bannerInit = false;
      if (banner._bannerObserver) {
        banner._bannerObserver.disconnect();
        delete banner._bannerObserver;
      }
      init(banner);
    });
  });

  document.addEventListener('shopify:section:unload', function (e) {
    var section = e.target || document.getElementById('shopify-section-' + e.detail.sectionId);
    if (!section) return;
    section.querySelectorAll('[data-banner-reveal]').forEach(function (banner) {
      if (banner._bannerObserver) banner._bannerObserver.disconnect();
      if (banner._bannerResizeHandler) window.removeEventListener('resize', banner._bannerResizeHandler);
    });
  });
})();
