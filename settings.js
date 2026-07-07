const EED_SETTINGS_KEY = 'eed-settings';

const EED_BUILTIN_HOST_SUFFIXES = ['acspontodigital.com.br', 'easydots.com.br'];

const EED_LOCAL_DEV_WEBSITE_PREFIXES = [
  'http://127.0.0.1:5500/website/',
  'http://192.168.0.104:5500/website/',
];

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
  isLocalDevWebsiteUrl(url) {
    if (!url) return false;
    return EED_LOCAL_DEV_WEBSITE_PREFIXES.some((prefix) => url.startsWith(prefix));
  },

  detectEasydotsUrl(href) {
    const parsed = new URL(href);
    parsed.hash = '';
    parsed.search = '';

    if (this.isLocalDevWebsiteUrl(parsed.href)) {
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
      if (this.isLocalDevWebsiteUrl(parsed.href)) {
        return true;
      }

      return EED_BUILTIN_HOST_SUFFIXES.some(
        (suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)
      );
    } catch {
      return false;
    }
  },

  isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  },

  normalizeTime(value) {
    const match = String(value || '')
      .trim()
      .match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    const normalized = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return this.isValidTime(normalized) ? normalized : null;
  },

  parseEasydotsJornada(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const splitMatch = text.match(
      /(\d{1,2}:\d{2})\s*[àa]s\s*(\d{1,2}:\d{2})\s+e\s+(\d{1,2}:\d{2})\s*[àa]s\s*(\d{1,2}:\d{2})/i
    );

    if (splitMatch) {
      const entrada = this.normalizeTime(splitMatch[1]);
      const intervaloInicio = this.normalizeTime(splitMatch[2]);
      const intervaloFim = this.normalizeTime(splitMatch[3]);
      const saida = this.normalizeTime(splitMatch[4]);

      if ([entrada, intervaloInicio, intervaloFim, saida].every(Boolean)) {
        return { entrada, intervaloInicio, intervaloFim, saida };
      }

      return null;
    }

    const simpleMatch = text.match(/(\d{1,2}:\d{2})\s*[àa]s\s*(\d{1,2}:\d{2})/i);
    if (!simpleMatch) return null;

    const entrada = this.normalizeTime(simpleMatch[1]);
    const saida = this.normalizeTime(simpleMatch[2]);
    if (!entrada || !saida) return null;

    return {
      entrada,
      saida,
      intervaloInicio: entrada,
      intervaloFim: entrada,
    };
  },

  scheduleMatchesJornada(settings, jornadaValue) {
    const parsed = this.parseEasydotsJornada(jornadaValue);
    if (!parsed || !this.isScheduleConfigured(settings)) return false;

    return ['entrada', 'saida', 'intervaloInicio', 'intervaloFim'].every(
      (key) => settings[key] === parsed[key]
    );
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

  canUseStorage() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  },

  async readStoredSettings() {
    if (!this.canUseStorage()) {
      return null;
    }

    try {
      const result = await chrome.storage.local.get(EED_SETTINGS_KEY);
      return result[EED_SETTINGS_KEY] ?? null;
    } catch {
      return null;
    }
  },

  async writeStoredSettings(settings) {
    if (!this.canUseStorage()) {
      return false;
    }

    try {
      await chrome.storage.local.set({ [EED_SETTINGS_KEY]: settings });
      return true;
    } catch {
      return false;
    }
  },

  async load() {
    const stored = await this.readStoredSettings();
    return this.normalize(stored ?? {});
  },

  async save(settings) {
    const normalized = this.normalize({ ...settings, horariosConfigurados: true });
    await this.writeStoredSettings(normalized);
    return normalized;
  },

  async reset() {
    const defaults = { ...EED_DEFAULT_SETTINGS, horariosConfigurados: false };
    await this.writeStoredSettings(defaults);
    return defaults;
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
    await this.writeStoredSettings(normalized);
    return normalized;
  },
};

if (typeof window !== 'undefined') {
  window.EEDSettings = EEDSettings;
}

if (typeof self !== 'undefined') {
  self.EEDSettings = EEDSettings;
}
