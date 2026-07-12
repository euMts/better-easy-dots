const EED_CHANGELOG_STORAGE_KEY = 'eedLastSeenChangelogVersion';

const EED_CHANGELOG_ENTRIES = [
  {
    version: '1.1.1',
    items: [
      'changelogV111Item1',
    ],
  },
  {
    version: '1.1.0',
    items: [
      'changelogV110Item1',
      'changelogV110Item2',
      'changelogV110Item3',
    ],
  },
  {
    version: '1.0.0',
    items: [
      'changelogV100Item1',
      'changelogV100Item2',
      'changelogV100Item3',
    ],
  },
  {
    version: '0.1.2',
    items: [
      'changelogV012Item1',
      'changelogV012Item2',
      'changelogV012Item3',
      'changelogV012Item4',
      'changelogV012Item5',
    ],
  },
  {
    version: '0.1.1',
    items: [
      'changelogV011Item1',
      'changelogV011Item2',
      'changelogV011Item3',
      'changelogV011Item4',
    ],
  },
  {
    version: '0.1.0',
    items: [
      'changelogV010Item1',
      'changelogV010Item2',
      'changelogV010Item3',
      'changelogV010Item4',
      'changelogV010Item5',
      'changelogV010Item6',
    ],
  },
];

function eedGetCurrentVersion() {
  try {
    return chrome.runtime?.getManifest?.()?.version || '1.1.1';
  } catch {
    return '1.1.1';
  }
}

function eedGetChangelogUrl() {
  try {
    return chrome.runtime.getURL('changelog.html');
  } catch {
    return 'changelog.html';
  }
}

async function eedGetLastSeenChangelogVersion() {
  try {
    const result = await chrome.storage.local.get(EED_CHANGELOG_STORAGE_KEY);
    return result[EED_CHANGELOG_STORAGE_KEY] ?? null;
  } catch {
    return null;
  }
}

async function eedMarkChangelogSeen(version = eedGetCurrentVersion()) {
  try {
    await chrome.storage.local.set({ [EED_CHANGELOG_STORAGE_KEY]: version });
  } catch {
    /* storage unavailable */
  }
}

async function eedShouldOpenChangelog() {
  const currentVersion = eedGetCurrentVersion();
  const lastSeenVersion = await eedGetLastSeenChangelogVersion();
  return currentVersion !== lastSeenVersion;
}

function eedGetLatestChangelogVersion() {
  return EED_CHANGELOG_ENTRIES[0]?.version ?? eedGetCurrentVersion();
}

function eedRenderChangelogEntries(root) {
  if (!root) return;

  const latestVersion = eedGetLatestChangelogVersion();
  const newBadge = typeof t === 'function' ? t('changelogNewBadge') : 'New';
  const translate = typeof t === 'function' ? t : (key) => key;

  root.innerHTML = EED_CHANGELOG_ENTRIES.map((entry) => {
    const isLatest = entry.version === latestVersion;
    const items = entry.items
      .map((itemKey) => `<li class="eed-changelog-item">${translate(itemKey)}</li>`)
      .join('');

    return `
      <section class="eed-changelog-version${isLatest ? ' eed-changelog-version--latest' : ''}">
        <div class="eed-changelog-version-head">
          <h2 class="eed-changelog-version-label">v${entry.version}</h2>
          ${isLatest ? `<span class="eed-changelog-badge">${newBadge}</span>` : ''}
        </div>
        <ul class="eed-changelog-list">${items}</ul>
      </section>
    `;
  }).join('');
}

function eedInitChangelogPage() {
  try {
    document.documentElement.lang = chrome.i18n.getUILanguage();
    document.title = `${t('changelogTitle')} — ${t('popupTitle')}`;
    applyI18n();

    const currentVersion = eedGetCurrentVersion();
    const latestVersion = eedGetLatestChangelogVersion();
    const subtitle = document.getElementById('eed-changelog-subtitle');
    const versionLine = document.getElementById('eed-changelog-version-line');
    const entriesRoot = document.getElementById('eed-changelog-entries');
    const reviewBtn = document.getElementById('eed-changelog-review');
    const settingsBtn = document.getElementById('eed-changelog-settings');

    if (subtitle) {
      subtitle.textContent = t('changelogUpdatedSubtitle', [latestVersion]);
    }

    if (versionLine) {
      versionLine.textContent = `${t('changelogCurrentVersion')} ${currentVersion} · ${t('changelogSeeWhatChanged')}`;
    }

    eedRenderChangelogEntries(entriesRoot);
    eedMarkChangelogSeen(currentVersion);

    reviewBtn?.addEventListener('click', () => {
      eedMarkChangelogSeen(currentVersion);
      chrome.tabs.create({ url: EED_EXTENSION_URL });
    });

    settingsBtn?.addEventListener('click', () => {
      eedMarkChangelogSeen(currentVersion);
      chrome.runtime.sendMessage({ action: 'openSettings' }, () => {
        window.close();
      });
    });
  } catch {
    /* fail silently */
  }
}

if (typeof document !== 'undefined' && document.getElementById('eed-changelog-entries')) {
  eedInitChangelogPage();
}

if (typeof self !== 'undefined') {
  self.EED_CHANGELOG_STORAGE_KEY = EED_CHANGELOG_STORAGE_KEY;
  self.eedGetCurrentVersion = eedGetCurrentVersion;
  self.eedGetChangelogUrl = eedGetChangelogUrl;
  self.eedGetLastSeenChangelogVersion = eedGetLastSeenChangelogVersion;
  self.eedMarkChangelogSeen = eedMarkChangelogSeen;
  self.eedShouldOpenChangelog = eedShouldOpenChangelog;
}
