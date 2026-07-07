const EED_SETTINGS_KEY = 'eed-settings';

const EED_DEFAULT_SETTINGS = {
  entrada: '08:00',
  saida: '18:00',
  intervaloInicio: '12:00',
  intervaloFim: '13:00',
  toleranciaAtraso: 5,
  horariosConfigurados: false,
  easydotsUrl:
    typeof EED_DEFAULT_EASYDOTS_URL !== 'undefined'
      ? EED_DEFAULT_EASYDOTS_URL
      : 'https://sys.acspontodigital.com.br/site/login',
};

const EEDSettings = {
  detectEasydotsUrl(href) {
    const parsed = new URL(href);
    parsed.hash = '';
    parsed.search = '';

    if (parsed.href.startsWith('http://127.0.0.1:5500/website/')) {
      return parsed.href;
    }

    const path = parsed.pathname.replace(/\/+$/, '') || '';
    return path ? `${parsed.origin}${path}` : `${parsed.origin}/`;
  },

  normalizeEasydotsUrl(url) {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      return EED_DEFAULT_SETTINGS.easydotsUrl;
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return EED_DEFAULT_SETTINGS.easydotsUrl;
      }

      parsed.hash = '';
      parsed.search = '';
      const path = parsed.pathname.replace(/\/+$/, '') || '';
      return path ? `${parsed.origin}${path}` : `${parsed.origin}/`;
    } catch {
      return EED_DEFAULT_SETTINGS.easydotsUrl;
    }
  },

  isBuiltinEasydotsHost(url) {
    try {
      const parsed = new URL(url);
      if (parsed.href.startsWith('http://127.0.0.1:5500/website/')) {
        return true;
      }

      return (
        parsed.hostname === 'acspontodigital.com.br' ||
        parsed.hostname.endsWith('.acspontodigital.com.br')
      );
    } catch {
      return false;
    }
  },

  isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  },

  isScheduleConfigured(settings = {}) {
    if (!settings.horariosConfigurados) {
      return false;
    }

    return ['entrada', 'saida', 'intervaloInicio', 'intervaloFim'].every((key) =>
      this.isValidTime(settings[key])
    );
  },

  normalize(stored = {}) {
    const settings = {
      entrada: stored.entrada ?? EED_DEFAULT_SETTINGS.entrada,
      saida: stored.saida ?? EED_DEFAULT_SETTINGS.saida,
      intervaloInicio: stored.intervaloInicio ?? EED_DEFAULT_SETTINGS.intervaloInicio,
      intervaloFim: stored.intervaloFim ?? EED_DEFAULT_SETTINGS.intervaloFim,
      toleranciaAtraso: Math.min(
        60,
        Math.max(1, parseInt(stored.toleranciaAtraso, 10) || EED_DEFAULT_SETTINGS.toleranciaAtraso)
      ),
      horariosConfigurados: Boolean(stored.horariosConfigurados),
      easydotsUrl: this.normalizeEasydotsUrl(stored.easydotsUrl ?? EED_DEFAULT_SETTINGS.easydotsUrl),
    };

    return settings;
  },

  async load() {
    const result = await chrome.storage.local.get(EED_SETTINGS_KEY);
    return this.normalize(result[EED_SETTINGS_KEY]);
  },

  async save(settings) {
    const normalized = this.normalize({ ...settings, horariosConfigurados: true });
    await chrome.storage.local.set({ [EED_SETTINGS_KEY]: normalized });
    return normalized;
  },

  async reset() {
    await chrome.storage.local.set({
      [EED_SETTINGS_KEY]: { ...EED_DEFAULT_SETTINGS, horariosConfigurados: false },
    });
    return { ...EED_DEFAULT_SETTINGS, horariosConfigurados: false };
  },

  async rememberSiteUrl(href) {
    if (!href || !this.isBuiltinEasydotsHost(href)) {
      return null;
    }

    const current = await this.load();
    const parsed = new URL(href);
    const detectedUrl = this.detectEasydotsUrl(href);

    let currentOrigin = '';
    try {
      currentOrigin = new URL(current.easydotsUrl).origin;
    } catch {
      currentOrigin = '';
    }

    const shouldUpdate =
      !current.easydotsUrl ||
      current.easydotsUrl === EED_DEFAULT_SETTINGS.easydotsUrl ||
      currentOrigin === parsed.origin;

    if (!shouldUpdate || current.easydotsUrl === detectedUrl) {
      return current;
    }

    const normalized = this.normalize({ ...current, easydotsUrl: detectedUrl });
    await chrome.storage.local.set({ [EED_SETTINGS_KEY]: normalized });
    return normalized;
  },
};

if (typeof window !== 'undefined') {
  window.EEDSettings = EEDSettings;
}

if (typeof self !== 'undefined') {
  self.EEDSettings = EEDSettings;
}
