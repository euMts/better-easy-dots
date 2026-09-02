(function initBetterEasyDotsBrowserCompat(global) {
  'use strict';

  const promiseApi =
    typeof global.browser !== 'undefined' && global.browser?.runtime ? global.browser : null;
  const callbackApi =
    typeof global.chrome !== 'undefined' && global.chrome?.runtime ? global.chrome : null;
  const api = promiseApi || callbackApi || {};

  function getPath(root, path) {
    return path.reduce((current, key) => current?.[key], root);
  }

  function getLastError() {
    try {
      return callbackApi?.runtime?.lastError || null;
    } catch {
      return null;
    }
  }

  function toError(value) {
    if (value instanceof Error) return value;
    return new Error(String(value?.message || value || 'Extension API error'));
  }

  function callApi(path, args = []) {
    const targetApi = promiseApi || callbackApi;
    let namespace;
    let method;

    try {
      namespace = getPath(targetApi, path.slice(0, -1));
      method = namespace?.[path[path.length - 1]];
    } catch (error) {
      return Promise.reject(error);
    }

    if (typeof method !== 'function') {
      return Promise.reject(new Error(`Extension API unavailable: ${path.join('.')}`));
    }

    if (targetApi === promiseApi) {
      try {
        return Promise.resolve(method.apply(namespace, args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise((resolve, reject) => {
      const callback = (...values) => {
        const lastError = getLastError();
        if (lastError) {
          reject(toError(lastError));
          return;
        }

        resolve(values.length > 1 ? values : values[0]);
      };

      try {
        const result = method.apply(namespace, [...args, callback]);
        if (result && typeof result.then === 'function') {
          result.then(resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  const EEDBrowser = {
    raw: api,
    get isAvailable() {
      return Boolean(api?.runtime?.id);
    },
    runtime: {
      get id() {
        try {
          return (
            api?.runtime?.id ||
            callbackApi?.runtime?.id ||
            promiseApi?.runtime?.id ||
            ''
          );
        } catch {
          return '';
        }
      },
      get onInstalled() {
        return api?.runtime?.onInstalled;
      },
      get onMessage() {
        return api?.runtime?.onMessage;
      },
      getURL(path) {
        return api?.runtime?.getURL?.(path) || path;
      },
      getManifest() {
        return api?.runtime?.getManifest?.() || {};
      },
      sendMessage(message) {
        return callApi(['runtime', 'sendMessage'], [message]);
      },
    },
    i18n: {
      getUILanguage() {
        return api?.i18n?.getUILanguage?.() || 'pt-BR';
      },
      getMessage(key, substitutions) {
        if (!api?.i18n?.getMessage) return '';
        return substitutions !== undefined
          ? api.i18n.getMessage(key, substitutions)
          : api.i18n.getMessage(key);
      },
    },
    storage: {
      get onChanged() {
        return api?.storage?.onChanged;
      },
      local: {
        get(keys) {
          return callApi(['storage', 'local', 'get'], [keys]);
        },
        set(values) {
          return callApi(['storage', 'local', 'set'], [values]);
        },
      },
    },
    tabs: {
      query(queryInfo) {
        return callApi(['tabs', 'query'], [queryInfo]);
      },
      update(tabId, updateProperties) {
        return callApi(['tabs', 'update'], [tabId, updateProperties]);
      },
      create(createProperties) {
        return callApi(['tabs', 'create'], [createProperties]);
      },
      sendMessage(tabId, message) {
        return callApi(['tabs', 'sendMessage'], [tabId, message]);
      },
      get(tabId) {
        return callApi(['tabs', 'get'], [tabId]);
      },
      reload(tabId, reloadProperties) {
        return reloadProperties === undefined
          ? callApi(['tabs', 'reload'], [tabId])
          : callApi(['tabs', 'reload'], [tabId, reloadProperties]);
      },
    },
    permissions: {
      contains(permissions) {
        return callApi(['permissions', 'contains'], [permissions]);
      },
      request(permissions) {
        return callApi(['permissions', 'request'], [permissions]);
      },
    },
    scripting: {
      executeScript(details) {
        return callApi(['scripting', 'executeScript'], [details]);
      },
      insertCSS(details) {
        return callApi(['scripting', 'insertCSS'], [details]);
      },
    },
    windows: {
      update(windowId, updateInfo) {
        return callApi(['windows', 'update'], [windowId, updateInfo]);
      },
    },
    action: {
      setBadgeText(details) {
        return callApi(['action', 'setBadgeText'], [details]);
      },
      setBadgeBackgroundColor(details) {
        return callApi(['action', 'setBadgeBackgroundColor'], [details]);
      },
    },
  };

  function isFirefoxRuntime() {
    try {
      const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
      if (/firefox/i.test(ua)) return true;
    } catch {
      /* some workers omit navigator */
    }
    try {
      return typeof global.browser !== 'undefined' && typeof global.browser.runtime?.getBrowserInfo === 'function';
    } catch {
      return false;
    }
  }

  function isDevExtensionPackage() {
    try {
      const manifest = EEDBrowser.runtime.getManifest() || {};
      const haystack = [
        ...(manifest.content_scripts || []).flatMap((cs) => cs.matches || []),
        ...(manifest.host_permissions || []),
      ];
      return haystack.some((item) => /localhost|127\.0\.0\.1/i.test(String(item)));
    } catch {
      return false;
    }
  }

  function isFirefoxDebugEnabled() {
    if (!isFirefoxRuntime()) return false;
    if (isDevExtensionPackage()) return true;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('eedDebug') === '1') {
        return true;
      }
    } catch {
      /* private mode / blocked storage */
    }
    try {
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('eedDebug') === '1') {
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function firefoxDebugLog(...args) {
    if (!isFirefoxDebugEnabled()) return;
    console.info('[Better Easy Dots][Firefox Debug]', ...args);
  }

  EEDBrowser.isFirefox = isFirefoxRuntime();
  EEDBrowser.isDevPackage = isDevExtensionPackage();
  EEDBrowser.firefoxDebugLog = firefoxDebugLog;

  global.EEDBrowser = EEDBrowser;
  global.eedFirefoxDebugLog = firefoxDebugLog;

  firefoxDebugLog('browser-compat loaded', {
    browser: EEDBrowser.isFirefox ? 'firefox' : 'chrome',
    runtimeId: EEDBrowser.runtime.id || '(none)',
    version: EEDBrowser.runtime.getManifest()?.version || '',
    geckoId: EEDBrowser.runtime.getManifest()?.browser_specific_settings?.gecko?.id || '',
    href: typeof location !== 'undefined' ? String(location.href || '') : '(no location)',
    origin: typeof location !== 'undefined' ? String(location.origin || '') : '',
    pathname: typeof location !== 'undefined' ? String(location.pathname || '') : '',
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
