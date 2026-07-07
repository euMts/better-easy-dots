document.getElementById('eed-settings-page-version').textContent =
  `v${chrome.runtime.getManifest().version}`;

EEDSettingsUI.mount(document.getElementById('eed-settings-root'), {
  showHeader: true,
  includeCancel: false,
});
