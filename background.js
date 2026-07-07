importScripts('config.js', 'settings.js');

function isEasydotsUrl(url) {
  if (!url) return false;
  if (url.startsWith('http://127.0.0.1:5500/website/')) return true;
  return EEDSettings.isBuiltinEasydotsHost(url);
}

async function getEasydotsOrigin() {
  try {
    const settings = await EEDSettings.load();
    return new URL(settings.easydotsUrl).origin;
  } catch {
    return new URL(EED_DEFAULT_EASYDOTS_URL).origin;
  }
}

async function findEasydotsTab() {
  const configuredOrigin = await getEasydotsOrigin();
  const tabs = await chrome.tabs.query({});

  return (
    tabs.find((tab) => {
      if (!tab.url) return false;
      if (tab.url.startsWith(configuredOrigin)) return true;
      if (tab.url.startsWith('http://127.0.0.1:5500/website/')) return true;
      return EEDSettings.isBuiltinEasydotsHost(tab.url);
    }) || null
  );
}

async function sendToEasydots(action) {
  const tab = await findEasydotsTab();

  if (!tab?.id) {
    return { success: false, error: 'Nenhuma aba do Easydots aberta.' };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch {
    return { success: false, error: 'Recarregue a página do Easydots e tente novamente.' };
  }
}

async function updateBadge() {
  const result = await sendToEasydots('getPageData');

  if (!result?.records?.length) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  await chrome.action.setBadgeText({ text: String(result.records.length) });
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

  return false;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isEasydotsUrl(tab.url)) {
    updateBadge();
  }
});
