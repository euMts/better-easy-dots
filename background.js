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

const EED_CONTENT_JS = [
  'browser-compat.js',
  'config.js',
  'i18n.js',
  'settings.js',
  'content.js',
  'pending-requests-impact.js',
];
const EED_CONTENT_CSS = ['eed-animations.css', 'content.css'];

function eedBackgroundDebugLog(...args) {
  if (typeof eedFirefoxDebugLog === 'function') {
    eedFirefoxDebugLog(...args);
    return;
  }
  if (typeof EEDBrowser !== 'undefined' && typeof EEDBrowser.firefoxDebugLog === 'function') {
    EEDBrowser.firefoxDebugLog(...args);
  }
}

function eedIsFirefoxBackground() {
  try {
    if (typeof EEDBrowser !== 'undefined' && EEDBrowser.isFirefox) return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || '')) {
      return true;
    }
  } catch {
    /* some workers omit navigator */
  }
  return typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
}

function eedUrlLooksInjectable(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '192.168.0.104' ||
      host === 'easydots.com.br' ||
      host.endsWith('.easydots.com.br') ||
      host === 'acspontodigital.com.br' ||
      host.endsWith('.acspontodigital.com.br')
    );
  } catch {
    return false;
  }
}

async function injectContentIfMissing(tabId, url, { force = false } = {}) {
  if (!tabId || !eedUrlLooksInjectable(url)) {
    eedBackgroundDebugLog('injectContent skip', { tabId, url, reason: 'not injectable' });
    return { ok: false, error: 'not injectable' };
  }

  eedBackgroundDebugLog('injectContent received', { tabId, url, force });

  if (!force) {
    try {
      await EEDBrowser.tabs.sendMessage(tabId, { action: 'getPageStatus' });
      eedBackgroundDebugLog('injectContent already present', { tabId, url });
      return { ok: true, already: true };
    } catch {
      /* content script not present yet */
    }

    try {
      const probe = await EEDBrowser.scripting.executeScript({
        target: { tabId },
        func: () => Boolean(globalThis.__eedBooted || globalThis.EASydots),
      });
      if (probe?.[0]?.result) {
        eedBackgroundDebugLog('injectContent probe found existing scripts', { tabId, url });
        return { ok: true, already: true };
      }
    } catch (error) {
      eedBackgroundDebugLog('injectContent probe failed', { tabId, url, error: String(error?.message || error) });
    }
  }

  const errors = [];

  try {
    await EEDBrowser.scripting.insertCSS({ target: { tabId }, files: EED_CONTENT_CSS });
    eedBackgroundDebugLog('insertCSS ok', { tabId, files: EED_CONTENT_CSS });
  } catch (error) {
    const message = String(error?.message || error);
    errors.push(`insertCSS: ${message}`);
    eedBackgroundDebugLog('insertCSS error', { tabId, error: message });
  }

  try {
    await EEDBrowser.scripting.executeScript({ target: { tabId }, files: EED_CONTENT_JS });
    eedBackgroundDebugLog('executeScript ok', { tabId, files: EED_CONTENT_JS });
    return { ok: true, errors };
  } catch (error) {
    const message = String(error?.message || error);
    eedBackgroundDebugLog('executeScript error', { tabId, url, error: message });
    return { ok: false, error: message, errors };
  }
}

function watchTabsForContentInjection() {
  if (!eedIsFirefoxBackground()) return;

  const tabsApi = EEDBrowser.raw?.tabs || null;
  tabsApi?.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    injectContentIfMissing(tabId, tab?.url).then((result) => {
      eedBackgroundDebugLog('tab complete inject', { tabId, url: tab?.url, result });
    });
  });
}

async function injectIntoOpenTabs() {
  if (!eedIsFirefoxBackground()) return;
  try {
    const tabs = await EEDBrowser.tabs.query({});
    await Promise.all(
      (tabs || []).map((tab) => (tab?.id ? injectContentIfMissing(tab.id, tab.url) : Promise.resolve()))
    );
  } catch {
    /* ignore */
  }
}

watchTabsForContentInjection();

EEDBrowser.runtime.onInstalled.addListener((details) => {
  injectIntoOpenTabs();
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

  if (message.action === 'injectContent') {
    const tabId = Number(message.tabId);
    const force = Boolean(message.force);
    eedBackgroundDebugLog('injectContent message', { tabId, force });
    EEDBrowser.tabs
      .get(tabId)
      .then((tab) => injectContentIfMissing(tabId, tab?.url, { force }))
      .then((result) => {
        const payload = {
          ok: Boolean(result?.ok),
          already: Boolean(result?.already),
          error: result?.error || '',
        };
        eedBackgroundDebugLog('injectContent result', payload);
        sendResponse(payload);
      })
      .catch((error) => {
        eedBackgroundDebugLog('injectContent handler error', String(error?.message || error));
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message.action === 'fetchHtml') {
    const url = String(message.url || '');
    eedBackgroundDebugLog('fetchHtml', url);
    if (!eedUrlLooksInjectable(url)) {
      eedBackgroundDebugLog('fetchHtml rejected', url);
      sendResponse({ ok: false, error: 'url not allowed' });
      return false;
    }

    fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        eedBackgroundDebugLog('fetchHtml ok', { url, length: html.length });
        sendResponse({ ok: true, html });
      })
      .catch((error) => {
        eedBackgroundDebugLog('fetchHtml error', { url, error: String(error?.message || error) });
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  return false;
});

injectIntoOpenTabs();
