/**
 * Minimal Waves ripple for .waves-effect (matches Easydots / core.css behavior).
 */
(function () {
  'use strict';

  if (window.Waves && typeof window.Waves.attach === 'function') {
    window.EEDWaves = {
      bind(root) {
        window.Waves.attach(root || document.body);
      },
      init() {
        window.Waves.attach(document.body);
      },
    };
    return;
  }

  const RIPPLE_DURATION_MS = 750;

  function getPointer(event) {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    return { x: event.clientX, y: event.clientY };
  }

  function showRipple(event) {
    const element = event.currentTarget;

    if (element.disabled || event.button === 2) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const pointer = getPointer(event);
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = pointer.x - rect.left - size / 2;
    const y = pointer.y - rect.top - size / 2;

    ripple.className = 'waves-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);

    requestAnimationFrame(() => {
      ripple.classList.add('waves-ripple-visible');
    });

    window.setTimeout(() => {
      ripple.remove();
    }, RIPPLE_DURATION_MS);
  }

  function bindWaves(root) {
    root.querySelectorAll('.waves-effect:not([data-eed-waves-bound])').forEach((element) => {
      element.dataset.eedWavesBound = '1';
      element.addEventListener('mousedown', showRipple);
      element.addEventListener('touchstart', showRipple, { passive: true });
    });
  }

  function init() {
    const root = document.body || document.documentElement;
    bindWaves(root);

    const observer = new MutationObserver(() => bindWaves(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  window.EEDWaves = {
    bind: bindWaves,
    init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
