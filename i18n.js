function t(key, substitutions) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.i18n?.getMessage) {
      return key;
    }

    const message =
      substitutions !== undefined
        ? chrome.i18n.getMessage(key, substitutions)
        : chrome.i18n.getMessage(key);
    return message || key;
  } catch {
    return key;
  }
}

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('*').forEach((el) => {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('data-i18n-')) continue;
      const targetAttr = attr.name.slice('data-i18n-'.length);
      el.setAttribute(targetAttr, t(attr.value));
    }
  });
}

if (typeof window !== 'undefined') {
  window.t = t;
  window.applyI18n = applyI18n;
}

if (typeof self !== 'undefined') {
  self.t = t;
}
