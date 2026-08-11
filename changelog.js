const EED_CHANGELOG_STORAGE_KEY = 'eedLastSeenChangelogVersion';

/** Last version already on the Chrome Web Store. Every newer entry gets the New badge. */
const EED_CHANGELOG_LAST_SHIPPED_VERSION = '1.4.0';

const EED_CHANGELOG_ENTRIES = [
  {
    version: '1.7.0',
    items: [
      'changelogV170Item1',
      'changelogV170Item2',
    ],
  },
  {
    version: '1.6.0',
    items: [
      'changelogV160Item1',
      'changelogV160Item2',
    ],
  },
  {
    version: '1.5.0',
    items: [
      'changelogV150Item1',
      'changelogV150Item2',
      'changelogV150Item3',
    ],
  },
  {
    version: '1.4.0',
    items: [
      'changelogV140Item1',
      'changelogV140Item2',
      'changelogV140Item3',
      'changelogV140Item4',
      'changelogV140Item5',
    ],
  },
  {
    version: '1.3.1',
    items: [
      'changelogV131Item1',
      'changelogV131Item2',
    ],
  },
  {
    version: '1.3.0',
    items: [
      'changelogV130Item1',
    ],
  },
  {
    version: '1.2.0',
    items: [
      'changelogV120Item1',
      'changelogV120Item2',
      'changelogV120Item3',
      'changelogV120Item4',
      'changelogV120Item5',
      'changelogV120Item6',
      'changelogV120Item7',
    ],
  },
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
    return chrome.runtime?.getManifest?.()?.version || '1.7.0';
  } catch {
    return '1.5.0';
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

function eedCompareSemver(a, b) {
  const parse = (value) =>
    String(value || '0')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}

function eedIsChangelogVersionNew(version) {
  return eedCompareSemver(version, EED_CHANGELOG_LAST_SHIPPED_VERSION) > 0;
}

function eedRenderChangelogEntries(root) {
  if (!root) return;

  const latestVersion = eedGetLatestChangelogVersion();
  const newBadge = typeof t === 'function' ? t('changelogNewBadge') : 'New';
  const translate = typeof t === 'function' ? t : (key) => key;

  root.innerHTML = EED_CHANGELOG_ENTRIES.map((entry) => {
    const isLatest = entry.version === latestVersion;
    const isNew = eedIsChangelogVersionNew(entry.version);
    const items = entry.items
      .map((itemKey) => `<li class="eed-changelog-item">${translate(itemKey)}</li>`)
      .join('');

    return `
      <section class="eed-changelog-version${isLatest || isNew ? ' eed-changelog-version--latest' : ''}">
        <div class="eed-changelog-version-head">
          <h2 class="eed-changelog-version-label">v${entry.version}</h2>
          ${isNew ? `<span class="eed-changelog-badge">${newBadge}</span>` : ''}
        </div>
        <ul class="eed-changelog-list">${items}</ul>
      </section>
    `;
  }).join('');
}

async function eedInitChangelogPage() {
  try {
    await initI18nFromStorage();

    document.documentElement.lang = getActiveDocumentLang();
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
