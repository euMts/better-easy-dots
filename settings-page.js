(async () => {
  await initI18nFromStorage();

  document.documentElement.lang = getActiveDocumentLang();
  document.title = t('settingsPageTitle');
  applyI18n();

  const versionEl = document.getElementById('eed-settings-page-version');
  const changelogBtn = document.getElementById('eed-settings-page-changelog');

  try {
    versionEl.textContent = `v${EEDBrowser.runtime.getManifest().version}`;
  } catch {
    versionEl.textContent = 'v1.7.2';
  }
  versionEl.setAttribute('aria-label', t('changelogView'));

  function openChangelogPage() {
    EEDBrowser.runtime.sendMessage({ action: 'openChangelog' }).catch(() => {});
  }

  changelogBtn.addEventListener('click', openChangelogPage);
  versionEl.addEventListener('click', openChangelogPage);

  EEDSettingsUI.mount(document.getElementById('eed-settings-root'), {
    showHeader: true,
    includeCancel: false,
  });
})();
