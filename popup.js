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

  try {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    versionEl.textContent = 'v1.3.0';
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

  reviewBtn.addEventListener('click', openStore);
  storeLink.addEventListener('click', (event) => {
    event.preventDefault();
    openStore();
  });
  settingsFooterBtn.addEventListener('click', openSettingsPage);
  settingsBtn.addEventListener('click', openSettingsPage);
  changelogBtn.addEventListener('click', openChangelogPage);
  versionEl.addEventListener('click', openChangelogPage);
})();
