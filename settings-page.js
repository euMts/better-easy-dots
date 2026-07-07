document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = t('settingsPageTitle');

document.getElementById('eed-settings-page-version').textContent =
  `v${chrome.runtime.getManifest().version}`;

EEDSettingsUI.mount(document.getElementById('eed-settings-root'), {
  showHeader: true,
  includeCancel: false,
});
