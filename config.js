const EED_CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/better-easy-dots/cfnehkkbmplomaianjpfiaoonmpekbbb';
/** Update after the first AMO listing is published. */
const EED_FIREFOX_STORE_URL = 'https://addons.mozilla.org/firefox/addon/better-easy-dots/';
const EED_DEFAULT_EASYDOTS_URL = 'https://sys.easydots.com.br/';

function eedIsFirefoxRuntime() {
  try {
    if (typeof browser !== 'undefined' && browser?.runtime?.id) {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      if (/firefox/i.test(ua)) return true;
      // Firefox exposes both browser.* and chrome.*; InstallTrigger is gecko-only.
      return typeof InstallTrigger !== 'undefined';
    }
  } catch {
    /* ignore */
  }
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    return /firefox/i.test(ua);
  } catch {
    return false;
  }
}

function eedGetStoreUrl() {
  return eedIsFirefoxRuntime() ? EED_FIREFOX_STORE_URL : EED_CHROME_STORE_URL;
}

if (typeof window !== 'undefined') {
  window.EED_CHROME_STORE_URL = EED_CHROME_STORE_URL;
  window.EED_FIREFOX_STORE_URL = EED_FIREFOX_STORE_URL;
  window.EED_DEFAULT_EASYDOTS_URL = EED_DEFAULT_EASYDOTS_URL;
  window.eedIsFirefoxRuntime = eedIsFirefoxRuntime;
  window.eedGetStoreUrl = eedGetStoreUrl;
}
