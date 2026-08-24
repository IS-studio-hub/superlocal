/**
 * Scales the desktop footer to fit mobile / portrait tablet viewports
 * while preserving the same layout and physics coordinate space as desktop.
 * Desktop and landscape/wide screens are left unchanged.
 */
(function () {
  'use strict';

  var DESIGN_W = 1440;
  var DESIGN_H = 900;
  var resizeTimer = null;
  var lastScale = 1;
  var lastShouldScale = null;

  function shouldScaleFooter() {
    var width = window.innerWidth || document.documentElement.clientWidth || 0;
    // Site mobile breakpoint (Framer max-width: 999.98px)
    if (width <= 999) {
      return true;
    }
    // Vertical tablets: same desktop footer, scaled to the narrower portrait width
    var portrait = false;
    try {
      portrait = window.matchMedia('(orientation: portrait)').matches;
    } catch (e) {
      portrait = window.innerHeight >= window.innerWidth;
    }
    if (portrait && width <= 1366) {
      return true;
    }
    return false;
  }

  function getFooterParts() {
    var footer = document.getElementById('footer');
    if (!footer) {
      return null;
    }
    var desktop = footer.querySelector('.framer-5b4Eg');
    if (!desktop) {
      return null;
    }
    return { footer: footer, desktop: desktop };
  }

  function clearScale(parts) {
    var footer = parts.footer;
    var desktop = parts.desktop;

    footer.classList.remove('footer-scaled');
    footer.style.height = '';
    footer.style.minHeight = '';
    footer.style.maxHeight = '';
    footer.style.removeProperty('--footer-scale');
    delete footer.dataset.footerScale;

    desktop.style.transform = '';
    desktop.style.webkitTransform = '';
    desktop.style.transformOrigin = '';
    desktop.style.webkitTransformOrigin = '';
    desktop.style.width = '';
    desktop.style.height = '';
    desktop.style.maxWidth = '';
    desktop.style.minHeight = '';

    window.__footerScale = 1;
    if (lastScale !== 1 || lastShouldScale !== false) {
      lastScale = 1;
      lastShouldScale = false;
      try {
        window.dispatchEvent(new CustomEvent('footer-scale-change', { detail: { scale: 1 } }));
      } catch (e) {
        /* ignore */
      }
    }
  }

  function applyScale(parts) {
    var footer = parts.footer;
    var desktop = parts.desktop;

    // Measure the page column width the footer must fit into
    var availableWidth = footer.clientWidth;
    if (!availableWidth) {
      var pageCol = document.querySelector('.framer-hVDZ8.framer-72rtr7') || document.querySelector('.framer-hVDZ8');
      if (pageCol && pageCol.clientWidth) {
        availableWidth = pageCol.clientWidth;
      }
    }
    if (!availableWidth) {
      var parent = footer.parentElement;
      availableWidth = (parent && parent.clientWidth) || window.innerWidth || DESIGN_W;
    }

    var scale = availableWidth / DESIGN_W;
    if (!isFinite(scale) || scale <= 0) {
      scale = 1;
    }
    // Never upscale past the design size
    if (scale > 1) {
      scale = 1;
    }

    var scaledHeight = Math.round(DESIGN_H * scale * 1000) / 1000;

    footer.classList.add('footer-scaled');
    footer.style.height = scaledHeight + 'px';
    footer.style.minHeight = scaledHeight + 'px';
    footer.style.maxHeight = scaledHeight + 'px';
    footer.dataset.footerScale = String(scale);
    footer.style.setProperty('--footer-scale', String(scale));

    desktop.style.boxSizing = 'border-box';
    desktop.style.width = DESIGN_W + 'px';
    desktop.style.maxWidth = 'none';
    desktop.style.height = DESIGN_H + 'px';
    desktop.style.minHeight = DESIGN_H + 'px';
    desktop.style.transformOrigin = 'top left';
    desktop.style.webkitTransformOrigin = 'top left';
    // Transform is applied via CSS var(--footer-scale) for !important reliability
    desktop.style.transform = '';
    desktop.style.webkitTransform = '';

    window.__footerScale = scale;

    var scaleChanged = Math.abs(scale - lastScale) > 0.001;
    var modeChanged = lastShouldScale !== true;
    lastScale = scale;
    lastShouldScale = true;

    if (scaleChanged || modeChanged) {
      try {
        window.dispatchEvent(new CustomEvent('footer-scale-change', { detail: { scale: scale } }));
      } catch (e) {
        /* ignore */
      }
    }
  }

  function updateFooterScale() {
    var parts = getFooterParts();
    if (!parts) {
      return;
    }

    if (shouldScaleFooter()) {
      applyScale(parts);
    } else {
      clearScale(parts);
    }
  }

  function scheduleUpdate() {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(updateFooterScale, 50);
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

    // Re-run after late layout / Framer hydration
    setTimeout(updateFooterScale, 100);
    setTimeout(updateFooterScale, 500);
    setTimeout(updateFooterScale, 1500);
  }

  function enhanceFooterAccessibility() {
    var footer = document.getElementById('footer');
    if (!footer) return;

    // Convert non-navigating <a> chips into buttons so they are keyboard accessible
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

    // Ensure real links expose an accessible name
    var realLinks = footer.querySelectorAll('a[href]');
    Array.prototype.forEach.call(realLinks, function (el) {
      if (el.getAttribute('aria-label')) return;
      var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) el.setAttribute('aria-label', label);
    });
  }

  window.getFooterScale = function () {
    if (typeof window.__footerScale === 'number' && window.__footerScale > 0) {
      return window.__footerScale;
    }
    var footer = document.getElementById('footer');
    if (footer && footer.dataset.footerScale) {
      var parsed = parseFloat(footer.dataset.footerScale);
      if (isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1;
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
