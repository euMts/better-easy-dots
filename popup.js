(async () => {
  await initI18nFromStorage();

  document.documentElement.lang = getActiveDocumentLang();
  document.title = t('popupTitle');
  applyI18n();

  const versionEl = document.getElementById('eed-popup-version');
  const reviewBtn = document.getElementById('eed-popup-review');
  const settingsFooterBtn = document.getElementById('eed-popup-settings-footer');
  const storeLink = document.getElementById('eed-popup-store-link');
  const settingsBtn = document.getElementById('eed-popup-settings');
  const changelogBtn = document.getElementById('eed-popup-changelog');
  const statusSection = document.getElementById('eed-popup-status');
  const statusText = document.getElementById('eed-popup-status-text');
  const openEasydotsBtn = document.getElementById('eed-popup-open-easydots');
  const grantBtn = document.getElementById('eed-popup-grant');

  try {
    versionEl.textContent = `v${EEDBrowser.runtime.getManifest().version}`;
  } catch {
    versionEl.textContent = 'v1.9.1';
  }
  versionEl.setAttribute('aria-label', t('changelogView'));

  function openStore() {
    EEDBrowser.tabs.create({ url: eedGetStoreUrl() }).catch(() => {});
  }

  function openSettingsPage() {
    EEDBrowser.runtime.sendMessage({ action: 'openSettings' }).catch(() => {});
    window.close();
  }

  function openChangelogPage() {
    EEDBrowser.runtime.sendMessage({ action: 'openChangelog' }).catch(() => {});
    window.close();
  }

  const fxLog =
    (typeof eedFirefoxDebugLog === 'function' && eedFirefoxDebugLog) ||
    (typeof EEDBrowser !== 'undefined' && EEDBrowser.firefoxDebugLog) ||
    (() => {});

  fxLog('popup opened', {
    runtimeId: EEDBrowser.runtime?.id || '',
    version: EEDBrowser.runtime?.getManifest?.()?.version || '',
    isFirefox: Boolean(EEDBrowser.isFirefox),
  });
  function isEasydotsHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return (
      host === 'easydots.com.br' ||
      host.endsWith('.easydots.com.br') ||
      host === 'acspontodigital.com.br' ||
      host.endsWith('.acspontodigital.com.br') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '192.168.0.104'
    );
  }

  function setPopupStatus({ tone, message, showOpenButton, showGrantButton }) {
    if (!statusSection || !statusText || !openEasydotsBtn) return;

    statusSection.hidden = false;
    statusSection.dataset.tone = tone;
    statusText.textContent = message;
    openEasydotsBtn.hidden = !showOpenButton;
    if (grantBtn) grantBtn.hidden = !showGrantButton;
  }

  async function resolveEasydotsUrl() {
    try {
      const stored = await EEDBrowser.storage.local.get('eed-settings');
      const url = stored?.['eed-settings']?.easydotsUrl;
      if (typeof url === 'string' && url.trim()) return url.trim();
    } catch {
      /* fall through */
    }
    return typeof EED_DEFAULT_EASYDOTS_URL === 'string'
      ? EED_DEFAULT_EASYDOTS_URL
      : 'https://sys.easydots.com.br/';
  }

  function originPatternForTab(tab) {
    try {
      const parsed = new URL(tab?.url || '');
      if (!/^https?:$/i.test(parsed.protocol) || !isEasydotsHost(parsed.hostname)) return '';
      // Firefox match patterns cannot include a port.
      return `${parsed.protocol}//${parsed.hostname}/*`;
    } catch {
      return '';
    }
  }

  async function hasHostPermission(tab) {
    const originPattern = originPatternForTab(tab);
    if (!originPattern || typeof EEDBrowser.permissions?.contains !== 'function') return false;
    try {
      const already = await EEDBrowser.permissions.contains({ origins: [originPattern] });
      fxLog('permissions.contains', { originPattern, already });
      return Boolean(already);
    } catch (error) {
      fxLog('permissions.contains error', String(error?.message || error));
      return false;
    }
  }

  async function requestHostPermission(tab) {
    const originPattern = originPatternForTab(tab);
    if (!originPattern || typeof EEDBrowser.permissions?.request !== 'function') return false;
    fxLog('permissions.request', originPattern);
    try {
      const granted = await EEDBrowser.permissions.request({ origins: [originPattern] });
      fxLog('permissions.request result', { originPattern, granted });
      return Boolean(granted);
    } catch (error) {
      fxLog('permissions.request error', String(error?.message || error));
      return false;
    }
  }

  async function injectContent(tab, { force = false } = {}) {
    if (!tab?.id) return { ok: false, error: 'no tab' };
    fxLog('injectContent call', { tabId: tab.id, url: tab.url, force });
    try {
      const result = await EEDBrowser.runtime.sendMessage({
        action: 'injectContent',
        tabId: tab.id,
        force,
      });
      fxLog('injectContent result', result);
      return result || { ok: false };
    } catch (error) {
      fxLog('injectContent error', String(error?.message || error));
      return { ok: false, error: String(error?.message || error) };
    }
  }

  async function refreshPageStatus() {
    try {
      const [tab] = await EEDBrowser.tabs.query({ active: true, currentWindow: true });
      fxLog('active tab', { id: tab?.id, url: tab?.url });

      const url = tab?.url || '';
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        setPopupStatus({
          tone: 'warn',
          message: t('popupStatusWrongSite'),
          showOpenButton: true,
        });
        return;
      }

      if (!/^https?:$/i.test(parsed.protocol) || !isEasydotsHost(parsed.hostname)) {
        setPopupStatus({
          tone: 'warn',
          message: t('popupStatusWrongSite'),
          showOpenButton: true,
        });
        return;
      }

      if (!tab?.id) {
        setPopupStatus({
          tone: 'info',
          message: t('popupStatusWaitingPage'),
          showOpenButton: false,
        });
        return;
      }

      const hasPermission = await hasHostPermission(tab);
      if (hasPermission) {
        await injectContent(tab);
      }

      let response = null;
      try {
        response = await EEDBrowser.tabs.sendMessage(tab.id, { action: 'getPageStatus' });
      } catch {
        response = null;
      }

      const isFirefox =
        Boolean(EEDBrowser.isFirefox) ||
        (typeof eedIsFirefoxRuntime === 'function' && eedIsFirefoxRuntime());

      if (response?.ok && response.hasCoreTargets) {
        setPopupStatus({
          tone: 'ok',
          message: t('popupStatusActive'),
          showOpenButton: false,
        });
        return;
      }

      if (response?.ok) {
        setPopupStatus({
          tone: 'info',
          message: t('popupStatusWaitingPage'),
          showOpenButton: false,
        });
        return;
      }

      setPopupStatus({
        tone: 'warn',
        message: isFirefox ? t('popupStatusNeedsSiteAccess') : t('popupStatusWaitingPage'),
        showOpenButton: false,
        showGrantButton: isFirefox,
      });
    } catch {
      setPopupStatus({
        tone: 'warn',
        message: t('popupStatusWrongSite'),
        showOpenButton: true,
      });
    }
  }

  reviewBtn.addEventListener('click', openStore);
  storeLink.addEventListener('click', (event) => {
    event.preventDefault();
    openStore();
  });
  settingsFooterBtn.addEventListener('click', openSettingsPage);
  settingsBtn.addEventListener('click', openSettingsPage);
  changelogBtn.addEventListener('click', openChangelogPage);
  versionEl.addEventListener('click', openChangelogPage);

  openEasydotsBtn?.addEventListener('click', async () => {
    const easydotsUrl = await resolveEasydotsUrl();
    EEDBrowser.tabs.create({ url: easydotsUrl }).catch(() => {});
    window.close();
  });

  grantBtn?.addEventListener('click', async () => {
    const [tab] = await EEDBrowser.tabs.query({ active: true, currentWindow: true });
    fxLog('grant button click', { id: tab?.id, url: tab?.url });
    const granted = await requestHostPermission(tab);
    await injectContent(tab, { force: true });
    if (tab?.id) {
      await EEDBrowser.tabs.reload(tab.id).catch(() => {});
    }
    fxLog('grant flow done', { granted });
    window.close();
  });

  await refreshPageStatus();
})();
