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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openSettings') {
    openSettingsPage()
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
