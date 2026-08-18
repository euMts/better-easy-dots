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
        return api?.runtime?.id || '';
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

  global.EEDBrowser = EEDBrowser;
})(typeof globalThis !== 'undefined' ? globalThis : this);
