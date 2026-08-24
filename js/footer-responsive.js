/**
 * Footer responsive controller
 * - Desktop / landscape: keep the current desktop footer as-is
 * - Mobile / portrait tablets: use Framer's mobile footer variant (readable UI)
 *   and expose a design→layout scale so physics can remap into the smaller stage
 */
(function () {
  'use strict';

  var DESIGN_W = 1440;
  var DESIGN_H = 900;

  var VARIANT = {
    desktop: 'framer-v-egs4sy',
    tablet: 'framer-v-1mxjd72',
    mobile: 'framer-v-1ft20dn',
    large: 'framer-v-w2yl31'
  };

  var ALL_VARIANTS = [VARIANT.desktop, VARIANT.tablet, VARIANT.mobile, VARIANT.large];
  var resizeTimer = null;
  var lastMode = null;
  var lastScale = 1;

  function isPortrait() {
    try {
      return window.matchMedia('(orientation: portrait)').matches;
    } catch (e) {
      return window.innerHeight >= window.innerWidth;
    }
  }

  function getMode() {
    var width = window.innerWidth || document.documentElement.clientWidth || 0;
    var portrait = isPortrait();

    // Mobile + vertical tablets: mobile footer variant (readable stacked UI)
    if (width <= 999 || (portrait && width <= 1366)) {
      return 'mobile';
    }
    // Mid landscape widths used by the site's 1000px breakpoint
    if (width >= 1000 && width < 1440) {
      return 'tablet';
    }
    if (width >= 1920) {
      return 'large';
    }
    return 'desktop';
  }

  function getFooterParts() {
    var footer = document.getElementById('footer');
    if (!footer) return null;
    var desktop = footer.querySelector('.framer-5b4Eg');
    if (!desktop) return null;
    return { footer: footer, root: desktop };
  }

  function setVariant(root, variantClass) {
    ALL_VARIANTS.forEach(function (cls) {
      root.classList.remove(cls);
    });
    root.classList.add(variantClass);
    // Keep base egs4sy class (Framer uses it in compound selectors)
    if (!root.classList.contains('framer-egs4sy')) {
      root.classList.add('framer-egs4sy');
    }
  }

  function clearInlineScale(parts) {
    var footer = parts.footer;
    var root = parts.root;

    footer.classList.remove('footer-scaled', 'footer-mobile');
    footer.style.height = '';
    footer.style.minHeight = '';
    footer.style.maxHeight = '';
    footer.style.removeProperty('--footer-scale');
    delete footer.dataset.footerScale;
    delete footer.dataset.footerMode;

    root.style.transform = '';
    root.style.webkitTransform = '';
    root.style.transformOrigin = '';
    root.style.webkitTransformOrigin = '';
    root.style.width = '';
    root.style.height = '';
    root.style.maxWidth = '';
    root.style.minHeight = '';
    root.removeAttribute('data-framer-name');
  }

  function applyDesktopLike(parts, mode) {
    clearInlineScale(parts);
    var variant = mode === 'large' ? VARIANT.large : (mode === 'tablet' ? VARIANT.tablet : VARIANT.desktop);
    setVariant(parts.root, variant);
    parts.root.setAttribute('data-framer-name', mode === 'tablet' ? 'Tablet' : 'Desktop');
    parts.footer.dataset.footerMode = mode;
    parts.footer.dataset.footerScale = '1';
    parts.footer.style.setProperty('--footer-scale', '1');
    window.__footerScale = 1;
    window.__footerMode = mode;
  }

  function applyMobile(parts) {
    var footer = parts.footer;
    var root = parts.root;

    // Prefer Framer mobile variant for readable stacked chrome,
    // while physics remaps into the fluid column width.
    setVariant(root, VARIANT.mobile);
    root.setAttribute('data-framer-name', 'Phone');

    footer.classList.add('footer-mobile');
    footer.classList.remove('footer-scaled');

    var pageCol = document.querySelector('.framer-hVDZ8.framer-72rtr7') || document.querySelector('.framer-hVDZ8');
    var availableWidth = (pageCol && pageCol.clientWidth) || footer.clientWidth || window.innerWidth || 390;
    if (availableWidth > 900) {
      // Safety for large portrait tablets: keep a comfortable column
      availableWidth = Math.min(availableWidth, 768);
    }

    var scale = availableWidth / DESIGN_W;
    if (!isFinite(scale) || scale <= 0) scale = 390 / DESIGN_W;
    if (scale > 1) scale = 1;

    // Fluid mobile stage: full column width, tall enough for stacked UI + physics play area
    footer.style.height = '';
    footer.style.maxHeight = '';
    footer.style.minHeight = '';
    footer.dataset.footerScale = String(scale);
    footer.dataset.footerMode = 'mobile';
    footer.style.setProperty('--footer-scale', String(scale));

    root.style.width = '100%';
    root.style.maxWidth = '100%';
    root.style.height = 'auto';
    root.style.minHeight = Math.max(640, Math.round(DESIGN_H * Math.max(scale, 0.45))) + 'px';
    root.style.transform = '';
    root.style.webkitTransform = '';

    window.__footerScale = scale;
    window.__footerMode = 'mobile';
  }

  function updateFooterScale() {
    var parts = getFooterParts();
    if (!parts) return;

    var mode = getMode();
    if (mode === 'mobile') {
      applyMobile(parts);
    } else {
      applyDesktopLike(parts, mode);
    }

    var scale = window.__footerScale || 1;
    var modeChanged = lastMode !== mode;
    var scaleChanged = Math.abs(scale - lastScale) > 0.001;
    lastMode = mode;
    lastScale = scale;

    if (modeChanged || scaleChanged) {
      try {
        window.dispatchEvent(new CustomEvent('footer-scale-change', {
          detail: { scale: scale, mode: mode }
        }));
      } catch (e) {
        /* ignore */
      }
    }
  }

  function scheduleUpdate() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateFooterScale, 50);
  }

  function enhanceFooterAccessibility() {
    var footer = document.getElementById('footer');
    if (!footer) return;

    var fakeLinks = footer.querySelectorAll('a:not([href])');
    Array.prototype.forEach.call(fakeLinks, function (el) {
      if (el.getAttribute('role') === 'button') return;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      if (!el.getAttribute('aria-label')) {
        var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (label) el.setAttribute('aria-label', label);
      }
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });

    var realLinks = footer.querySelectorAll('a[href]');
    Array.prototype.forEach.call(realLinks, function (el) {
      if (el.getAttribute('aria-label')) return;
      var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) el.setAttribute('aria-label', label);
    });
  }

  function init() {
    updateFooterScale();
    enhanceFooterAccessibility();

    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', function () {
      setTimeout(updateFooterScale, 120);
    }, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    }

    setTimeout(updateFooterScale, 100);
    setTimeout(updateFooterScale, 500);
    setTimeout(updateFooterScale, 1500);
  }

  window.getFooterScale = function () {
    if (typeof window.__footerScale === 'number' && window.__footerScale > 0) {
      return window.__footerScale;
    }
    var footer = document.getElementById('footer');
    if (footer && footer.dataset.footerScale) {
      var parsed = parseFloat(footer.dataset.footerScale);
      if (isFinite(parsed) && parsed > 0) return parsed;
    }
    return 1;
  };

  window.getFooterMode = function () {
    return window.__footerMode || 'desktop';
  };

  window.updateFooterScale = updateFooterScale;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', function () {
    updateFooterScale();
  });
})();
