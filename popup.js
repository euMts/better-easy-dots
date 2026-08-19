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
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    versionEl.textContent = 'v1.8.0';
  }
  versionEl.setAttribute('aria-label', t('changelogView'));

  function openStore() {
    chrome.tabs.create({ url: EED_EXTENSION_URL });
  }

  function openSettingsPage() {
    chrome.runtime.sendMessage({ action: 'openSettings' });
    window.close();
  }

  function openChangelogPage() {
    chrome.runtime.sendMessage({ action: 'openChangelog' });
    window.close();
  }

  function isEasydotsHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return (
      host === 'easydots.com.br' ||
      host.endsWith('.easydots.com.br') ||
      host === 'acspontodigital.com.br' ||
      host.endsWith('.acspontodigital.com.br')
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
      const stored = await chrome.storage.local.get('eed-settings');
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageStatus' });
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
    chrome.tabs.create({ url: easydotsUrl });
    window.close();
  });

  await refreshPageStatus();
})();
