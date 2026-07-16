document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = t('settingsPageTitle');
applyI18n();

const versionEl = document.getElementById('eed-settings-page-version');
const changelogBtn = document.getElementById('eed-settings-page-changelog');

try {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
} catch {
  versionEl.textContent = 'v1.1.0';
}
versionEl.setAttribute('aria-label', t('changelogView'));

function openChangelogPage() {
  chrome.runtime.sendMessage({ action: 'openChangelog' });
}

changelogBtn.addEventListener('click', openChangelogPage);
versionEl.addEventListener('click', openChangelogPage);

EEDSettingsUI.mount(document.getElementById('eed-settings-root'), {
  showHeader: true,
  includeCancel: false,
});
