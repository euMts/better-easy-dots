const versionEl = document.getElementById('eed-popup-version');
const reviewBtn = document.getElementById('eed-popup-review');
const settingsFooterBtn = document.getElementById('eed-popup-settings-footer');
const storeLink = document.getElementById('eed-popup-store-link');
const settingsBtn = document.getElementById('eed-popup-settings');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

function openStore() {
  chrome.tabs.create({ url: EED_EXTENSION_URL });
}

function openSettingsPage() {
  chrome.runtime.sendMessage({ action: 'openSettings' });
  window.close();
}

reviewBtn.addEventListener('click', openStore);
storeLink.addEventListener('click', (event) => {
  event.preventDefault();
  openStore();
});
settingsFooterBtn.addEventListener('click', openSettingsPage);
settingsBtn.addEventListener('click', openSettingsPage);
