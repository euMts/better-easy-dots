importScripts('i18n.js', 'changelog.js');

async function setBadge(recordCount) {
  if (!recordCount) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  await chrome.action.setBadgeText({ text: String(recordCount) });
  await chrome.action.setBadgeBackgroundColor({ color: '#8234e8' });
}

async function openSettingsPage() {
  const settingsUrl = chrome.runtime.getURL('settings.html');
  const tabs = await chrome.tabs.query({ url: settingsUrl });
  const existing = tabs.find((tab) => tab.id);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing.id;
  }

  const tab = await chrome.tabs.create({ url: settingsUrl, active: true });
  return tab.id;
}

async function openChangelogPage({ focusExisting = true } = {}) {
  const changelogUrl = eedGetChangelogUrl();

  if (focusExisting) {
    const tabs = await chrome.tabs.query({ url: changelogUrl });
    const existing = tabs.find((tab) => tab.id);
    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return existing.id;
    }
  }

  const tab = await chrome.tabs.create({ url: changelogUrl, active: true });
  return tab.id;
}

async function openChangelogIfNeeded() {
  try {
    const shouldOpen = await eedShouldOpenChangelog();
    if (!shouldOpen) return;
    await openChangelogPage({ focusExisting: true });
  } catch {
    /* fail silently */
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return;
  openChangelogIfNeeded();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getLocaleMessages') {
    const locale = EED_SUPPORTED_LOCALES.includes(message.locale) ? message.locale : 'pt_BR';
    eedFetchLocaleJson(locale)
      .then((messages) => sendResponse({ ok: true, messages }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === 'openSettings') {
    openSettingsPage()
      .then((tabId) => sendResponse({ success: true, tabId }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === 'openChangelog') {
    openChangelogPage({ focusExisting: true })
      .then((tabId) => sendResponse({ success: true, tabId }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === 'syncBadge') {
    setBadge(message.recordCount ?? 0)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  return false;
});
