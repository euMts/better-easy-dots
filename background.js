// Chrome MV3 service worker loads deps via importScripts.
// Firefox MV3 lists browser-compat.js + deps in background.scripts first.
if (typeof importScripts === 'function') {
  importScripts('browser-compat.js', 'i18n.js', 'changelog.js');
}

async function setBadge(recordCount) {
  if (!recordCount) {
    await EEDBrowser.action.setBadgeText({ text: '' });
    return;
  }

  await EEDBrowser.action.setBadgeText({ text: String(recordCount) });
  await EEDBrowser.action.setBadgeBackgroundColor({ color: '#8234e8' });
}

async function focusWindow(windowId) {
  if (!windowId) return;

  try {
    await EEDBrowser.windows.update(windowId, { focused: true });
  } catch {
    /* Firefox exposes windows without a manifest permission; ignore if unavailable. */
  }
}

async function openSettingsPage() {
  const settingsUrl = EEDBrowser.runtime.getURL('settings.html');
  const tabs = await EEDBrowser.tabs.query({ url: settingsUrl });
  const existing = tabs.find((tab) => tab.id);

  if (existing?.id) {
    await EEDBrowser.tabs.update(existing.id, { active: true });
    await focusWindow(existing.windowId);
    return existing.id;
  }

  const tab = await EEDBrowser.tabs.create({ url: settingsUrl, active: true });
  return tab.id;
}

async function openChangelogPage({ focusExisting = true } = {}) {
  const changelogUrl = eedGetChangelogUrl();

  if (focusExisting) {
    const tabs = await EEDBrowser.tabs.query({ url: changelogUrl });
    const existing = tabs.find((tab) => tab.id);
    if (existing?.id) {
      await EEDBrowser.tabs.update(existing.id, { active: true });
      await focusWindow(existing.windowId);
      return existing.id;
    }
  }

  const tab = await EEDBrowser.tabs.create({ url: changelogUrl, active: true });
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

EEDBrowser.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return;
  openChangelogIfNeeded();
});

EEDBrowser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
