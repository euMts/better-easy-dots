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

  try {
    versionEl.textContent = `v${EEDBrowser.runtime.getManifest().version}`;
  } catch {
    versionEl.textContent = 'v1.7.2';
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

  function setPopupStatus({ tone, message, showOpenButton }) {
    if (!statusSection || !statusText || !openEasydotsBtn) return;

    statusSection.hidden = false;
    statusSection.dataset.tone = tone;
    statusText.textContent = message;
    openEasydotsBtn.hidden = !showOpenButton;
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

  async function refreshPageStatus() {
    try {
      const [tab] = await EEDBrowser.tabs.query({ active: true, currentWindow: true });
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

      let response = null;
      try {
        response = await EEDBrowser.tabs.sendMessage(tab.id, { action: 'getPageStatus' });
      } catch {
        response = null;
      }

      if (response?.ok && response.hasCoreTargets) {
        setPopupStatus({
          tone: 'ok',
          message: t('popupStatusActive'),
          showOpenButton: false,
        });
        return;
      }

      setPopupStatus({
        tone: 'info',
        message: t('popupStatusWaitingPage'),
        showOpenButton: false,
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

  await refreshPageStatus();
})();
