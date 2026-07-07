function t(key, substitutions) {
  const message =
    substitutions !== undefined
      ? chrome.i18n.getMessage(key, substitutions)
      : chrome.i18n.getMessage(key);
  return message || key;
}

if (typeof window !== 'undefined') {
  window.t = t;
}

if (typeof self !== 'undefined') {
  self.t = t;
}
