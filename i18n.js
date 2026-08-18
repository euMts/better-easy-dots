const EED_I18N_SETTINGS_KEY = 'eed-settings';
const EED_LANGUAGE_SYSTEM = 'system';
const EED_SUPPORTED_LOCALES = ['pt_BR', 'en'];

let eedMessageCatalog = null;
let eedActiveLocale = null;
let eedLanguagePreference = EED_LANGUAGE_SYSTEM;

function eedGetBrowserLocale() {
  try {
    const ui =
      typeof EEDBrowser !== 'undefined'
        ? EEDBrowser.i18n?.getUILanguage?.() || 'pt-BR'
        : 'pt-BR';
    const normalized = String(ui).replace('-', '_');
    if (EED_SUPPORTED_LOCALES.includes(normalized)) return normalized;
    const lower = normalized.toLowerCase();
    if (lower.startsWith('pt')) return 'pt_BR';
    if (lower.startsWith('en')) return 'en';
    return 'pt_BR';
  } catch {
    return 'pt_BR';
  }
}

function eedNormalizeLanguagePreference(value) {
  if (value === 'pt_BR' || value === 'en' || value === EED_LANGUAGE_SYSTEM) {
    return value;
  }
  return EED_LANGUAGE_SYSTEM;
}

function eedResolveLocale(preference = eedLanguagePreference) {
  const pref = eedNormalizeLanguagePreference(preference);
  if (pref === EED_LANGUAGE_SYSTEM) return eedGetBrowserLocale();
  return pref;
}

function eedLocaleToHtmlLang(locale) {
  return String(locale || 'pt_BR').replace('_', '-');
}

function eedFormatMessage(entry, substitutions) {
  if (!entry || typeof entry.message !== 'string') return '';

  let message = entry.message;
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions !== undefined
      ? [substitutions]
      : [];

  const replaceIndexed = (text) =>
    text.replace(/\$(\d+)/g, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      return values[idx] !== undefined ? String(values[idx]) : '';
    });

  if (entry.placeholders && typeof entry.placeholders === 'object') {
    for (const [name, meta] of Object.entries(entry.placeholders)) {
      const content = replaceIndexed(String(meta?.content ?? ''));
      message = message.replace(new RegExp(`\\$${name}\\$`, 'gi'), content);
    }
  }

  return replaceIndexed(message);
}

async function eedFetchLocaleJson(locale) {
  const url = EEDBrowser.runtime.getURL(`_locales/${locale}/messages.json`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load locale ${locale}`);
  }
  return response.json();
}

function eedRequestLocaleFromBackground(locale) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof EEDBrowser === 'undefined' || !EEDBrowser.runtime?.sendMessage) {
        reject(new Error('runtime unavailable'));
        return;
      }

      EEDBrowser.runtime
        .sendMessage({ action: 'getLocaleMessages', locale })
        .then((response) => {
          if (response?.ok && response.messages) {
            resolve(response.messages);
            return;
          }

          reject(new Error(response?.error || `Failed to load locale ${locale}`));
        })
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function eedLoadMessageCatalog(locale) {
  try {
    return await eedFetchLocaleJson(locale);
  } catch {
    return eedRequestLocaleFromBackground(locale);
  }
}

async function initI18n(languagePreference) {
  eedLanguagePreference = eedNormalizeLanguagePreference(languagePreference);
  const locale = eedResolveLocale(eedLanguagePreference);

  try {
    eedMessageCatalog = await eedLoadMessageCatalog(locale);
    eedActiveLocale = locale;
  } catch {
    eedMessageCatalog = null;
    eedActiveLocale = locale;
  }

  return eedActiveLocale;
}

async function initI18nFromStorage() {
  let language = EED_LANGUAGE_SYSTEM;

  try {
    if (typeof EEDBrowser !== 'undefined' && EEDBrowser.storage?.local) {
      const result = await EEDBrowser.storage.local.get(EED_I18N_SETTINGS_KEY);
      language = result[EED_I18N_SETTINGS_KEY]?.language ?? EED_LANGUAGE_SYSTEM;
    }
  } catch {
    /* storage unavailable */
  }

  return initI18n(language);
}

function getActiveDocumentLang() {
  return eedLocaleToHtmlLang(eedActiveLocale || eedResolveLocale());
}

function getLanguagePreference() {
  return eedLanguagePreference;
}

function t(key, substitutions) {
  try {
    if (eedMessageCatalog) {
      const entry = eedMessageCatalog[key];
      if (entry) {
        const formatted = eedFormatMessage(entry, substitutions);
        if (formatted) return formatted;
      }
      return key;
    }

    if (typeof EEDBrowser === 'undefined' || !EEDBrowser.runtime?.id || !EEDBrowser.i18n?.getMessage) {
      return key;
    }

    const message =
      substitutions !== undefined
        ? EEDBrowser.i18n.getMessage(key, substitutions)
        : EEDBrowser.i18n.getMessage(key);
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
  window.initI18n = initI18n;
  window.initI18nFromStorage = initI18nFromStorage;
  window.getActiveDocumentLang = getActiveDocumentLang;
  window.getLanguagePreference = getLanguagePreference;
  window.EED_LANGUAGE_SYSTEM = EED_LANGUAGE_SYSTEM;
  window.EED_SUPPORTED_LOCALES = EED_SUPPORTED_LOCALES;
}

if (typeof self !== 'undefined') {
  self.t = t;
  self.applyI18n = applyI18n;
  self.initI18n = initI18n;
  self.initI18nFromStorage = initI18nFromStorage;
  self.getActiveDocumentLang = getActiveDocumentLang;
  self.getLanguagePreference = getLanguagePreference;
  self.EED_LANGUAGE_SYSTEM = EED_LANGUAGE_SYSTEM;
  self.EED_SUPPORTED_LOCALES = EED_SUPPORTED_LOCALES;
  self.eedFetchLocaleJson = eedFetchLocaleJson;
}
