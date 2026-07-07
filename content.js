const GEAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M24 14.187v-4.374c-2.148-.766-2.726-.802-3.027-1.529-.303-.729.083-1.169 1.059-3.223l-3.093-3.093c-2.026.963-2.488 1.364-3.224 1.059-.727-.302-.768-.889-1.527-3.027h-4.375c-.764 2.144-.8 2.725-1.529 3.027-.752.313-1.203-.1-3.223-1.059l-3.093 3.093c.977 2.055 1.362 2.493 1.059 3.224-.302.727-.881.764-3.027 1.528v4.375c2.139.76 2.725.8 3.027 1.528.304.734-.081 1.167-1.059 3.223l3.093 3.093c1.999-.95 2.47-1.373 3.223-1.059.728.302.764.88 1.529 3.027h4.374c.758-2.131.799-2.723 1.537-3.031.745-.308 1.186.099 3.215 1.062l3.093-3.093c-.975-2.05-1.362-2.492-1.059-3.223.3-.726.88-.763 3.027-1.528zm-4.875.764c-.577 1.394-.068 2.458.488 3.578l-1.084 1.084c-1.093-.543-2.161-1.076-3.573-.49-1.396.581-1.79 1.693-2.188 2.877h-1.534c-.398-1.185-.791-2.297-2.183-2.875-1.419-.588-2.507-.045-3.579.488l-1.083-1.084c.557-1.118 1.066-2.18.487-3.58-.579-1.391-1.691-1.784-2.876-2.182v-1.533c1.185-.398 2.297-.791 2.875-2.184.578-1.394.068-2.459-.488-3.579l1.084-1.084c1.082.538 2.162 1.077 3.58.488 1.392-.577 1.785-1.69 2.183-2.875h1.534c.398 1.185.792 2.297 2.184 2.875 1.419.588 2.506.045 3.579-.488l1.084 1.084c-.556 1.121-1.065 2.187-.488 3.58.577 1.391 1.689 1.784 2.875 2.183v1.534c-1.188.398-2.302.791-2.877 2.183zm-7.125-5.951c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.762 0-5 2.238-5 5s2.238 5 5 5 5-2.238 5-5-2.238-5-5-5z"/></svg>`;

const EASydots = {
  SELECTORS: {
    navbar: 'ul.navbar-nav.navbar-right.pull-right',
    registerButton: '#btnRegister',
    recordsTable: '#table_registro_horario',
    clock: '.clock',
    deviceType: '#deviceType',
    settingsMenuItem: '#eed-navbar-settings',
  },

  isUpdating: false,
  updateTimer: null,
  lastViewState: '',

  getRegisterButtonHtml() {
    return `<button type="button" id="btnRegister" class="btn waves-effect m-l-5 loading" style="background-color: #8234e8; color: white; height: 85px; width: 240px; font-size: 1.3em; font-weight: bold;"><i class="md-alarm"></i> ${t('contentRegisterButton')}</button>`;
  },

  getRecords() {
    const rows = document.querySelectorAll(`${this.SELECTORS.recordsTable} tr`);
    return Array.from(rows).map((row) => {
      if (row.id === 'eed-day-balance-row' || row.classList.contains('eed-suggestion-row')) {
        return null;
      }

      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return null;
      return {
        type: cells[0].textContent.trim(),
        source: cells[1].textContent.trim(),
        time: cells[3].textContent.trim(),
        timeCell: cells[3],
      };
    }).filter(Boolean);
  },

  isEntrada(type) {
    return type.toLowerCase().includes('entrada');
  },

  isSaida(type) {
    const lower = type.toLowerCase();
    return lower.includes('saida') || lower.includes('saída');
  },

  timeToSeconds(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 3600 + parts[1] * 60;
    }
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  },

  formatBalance(totalSeconds) {
    if (totalSeconds === 0) {
      return { text: '00:00:00', sign: 'neutral' };
    }

    const signChar = totalSeconds < 0 ? '-' : '+';
    const abs = Math.abs(totalSeconds);
    const hours = Math.floor(abs / 3600);
    const minutes = Math.floor((abs % 3600) / 60);
    const seconds = abs % 60;
    const formatted = [hours, minutes, seconds]
      .map((unit) => String(unit).padStart(2, '0'))
      .join(':');

    return {
      text: `${signChar} ${formatted}`,
      sign: totalSeconds < 0 ? 'negative' : 'positive',
    };
  },

  calculateExpectedDailyWork(settings) {
    const workSpan = this.timeToSeconds(settings.saida) - this.timeToSeconds(settings.entrada);
    const breakSpan =
      this.timeToSeconds(settings.intervaloFim) - this.timeToSeconds(settings.intervaloInicio);
    return Math.max(0, workSpan - breakSpan);
  },

  calculateWorkedSeconds(records) {
    let total = 0;
    let lastEntrada = null;

    records.forEach((record) => {
      if (this.isEntrada(record.type)) {
        lastEntrada = this.timeToSeconds(record.time);
        return;
      }

      if (this.isSaida(record.type) && lastEntrada !== null) {
        total += this.timeToSeconds(record.time) - lastEntrada;
        lastEntrada = null;
      }
    });

    return total;
  },

  calculatePunctualityDelta(records, settings) {
    let entradaIndex = 0;
    let saidaIndex = 0;
    const totalSaidas = records.filter((record) => this.isSaida(record.type)).length;
    let totalSeconds = 0;

    records.forEach((record) => {
      const expectedTime = this.getExpectedTime(
        record.type,
        entradaIndex,
        saidaIndex,
        totalSaidas,
        settings
      );

      const recordedSeconds = this.timeToSeconds(record.time);
      const expectedSeconds = this.timeToSeconds(expectedTime);

      if (this.isEntrada(record.type)) {
        totalSeconds += expectedSeconds - recordedSeconds;
        entradaIndex += 1;
      } else {
        totalSeconds += recordedSeconds - expectedSeconds;
        saidaIndex += 1;
      }
    });

    return totalSeconds;
  },

  hasInterval(settings) {
    return (
      this.timeToSeconds(settings.intervaloFim) > this.timeToSeconds(settings.intervaloInicio)
    );
  },

  isWorkDayComplete(records, settings) {
    if (!records.length) return false;

    const lastRecord = records[records.length - 1];
    if (!this.isSaida(lastRecord.type)) return false;

    const entradas = records.filter((record) => this.isEntrada(record.type)).length;
    const saidas = records.filter((record) => this.isSaida(record.type)).length;

    if (entradas === 0 || entradas !== saidas) return false;

    if (this.hasInterval(settings)) {
      return entradas >= 2 && saidas >= 2;
    }

    return true;
  },

  calculateDayBalance(records, settings) {
    const expectedDaily = this.calculateExpectedDailyWork(settings);
    const worked = this.calculateWorkedSeconds(records);

    if (!this.isWorkDayComplete(records, settings)) {
      return -(expectedDaily - worked);
    }

    const punctuality = this.calculatePunctualityDelta(records, settings);
    return worked - expectedDaily + punctuality;
  },

  timeToMinutes(timeStr) {
    return this.timeToSeconds(timeStr) / 60;
  },

  getEntradaStatus(recordedTime, expectedTime, toleranceMinutes) {
    const diff = this.timeToMinutes(recordedTime) - this.timeToMinutes(expectedTime);

    if (diff <= 0) return 'eed-time-ok';
    if (diff <= toleranceMinutes) return 'eed-time-warning';
    return 'eed-time-late';
  },

  getSaidaStatus(recordedTime, expectedTime, toleranceMinutes) {
    const diff = this.timeToMinutes(expectedTime) - this.timeToMinutes(recordedTime);

    if (diff <= 0) return 'eed-time-ok';
    if (diff <= toleranceMinutes) return 'eed-time-warning';
    return 'eed-time-late';
  },

  getRecordStatus(type, recordedTime, expectedTime, toleranceMinutes) {
    if (this.isEntrada(type)) {
      return this.getEntradaStatus(recordedTime, expectedTime, toleranceMinutes);
    }
    return this.getSaidaStatus(recordedTime, expectedTime, toleranceMinutes);
  },

  getRecordsFingerprint(records) {
    return records.map((record) => `${record.type}|${record.time}`).join(';');
  },

  getViewStateFingerprint(settings, records) {
    return JSON.stringify({
      records: this.getRecordsFingerprint(records),
      settings,
    });
  },

  scheduleUpdateRecordsView(force = false) {
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.updateRecordsView(force);
    }, 50);
  },

  setTimeCellStatus(timeCell, status) {
    const statusClasses = ['eed-time-ok', 'eed-time-warning', 'eed-time-late'];
    if (timeCell.classList.contains(status)) return;

    timeCell.classList.remove(...statusClasses);
    timeCell.classList.add(status);
  },

  secondsToTimeString(totalSeconds) {
    const seconds = ((totalSeconds % 86400) + 86400) % 86400;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return [hours, minutes, secs].map((unit) => String(unit).padStart(2, '0')).join(':');
  },

  getExpectedDaySequence(settings) {
    if (this.hasInterval(settings)) {
      return [
        { type: 'entrada', label: t('contentPunchEntry'), expected: settings.entrada, icon: 'icon-login' },
        { type: 'saida', label: t('contentPunchExit'), expected: settings.intervaloInicio, icon: 'icon-logout' },
        { type: 'entrada', label: t('contentPunchEntry'), expected: settings.intervaloFim, icon: 'icon-login' },
        { type: 'saida', label: t('contentPunchExit'), expected: settings.saida, icon: 'icon-logout' },
      ];
    }

    return [
      { type: 'entrada', label: t('contentPunchEntry'), expected: settings.entrada, icon: 'icon-login' },
      { type: 'saida', label: t('contentPunchExit'), expected: settings.saida, icon: 'icon-logout' },
    ];
  },

  getRemainingExpectedPunches(records, settings) {
    const sequence = this.getExpectedDaySequence(settings);
    let sequenceIndex = 0;

    records.forEach((record) => {
      if (sequenceIndex >= sequence.length) return;

      const expected = sequence[sequenceIndex];
      const matchesEntrada = this.isEntrada(record.type) && expected.type === 'entrada';
      const matchesSaida = this.isSaida(record.type) && expected.type === 'saida';

      if (matchesEntrada || matchesSaida) {
        sequenceIndex += 1;
      }
    });

    return sequence.slice(sequenceIndex);
  },

  getSuggestionShift(records, settings) {
    const firstEntrada = records.find((record) => this.isEntrada(record.type));
    if (!firstEntrada) return 0;

    return this.timeToSeconds(firstEntrada.time) - this.timeToSeconds(settings.entrada);
  },

  clearSuggestionRows(table) {
    table.querySelectorAll('.eed-suggestion-row').forEach((row) => row.remove());
  },

  renderSuggestionRows(settings, table, records) {
    this.clearSuggestionRows(table);

    if (
      !EEDSettings.isScheduleConfigured(settings) ||
      !records.length ||
      this.isWorkDayComplete(records, settings)
    ) {
      return;
    }

    const remaining = this.getRemainingExpectedPunches(records, settings);
    if (!remaining.length) return;

    const shift = this.getSuggestionShift(records, settings);
    const balanceRow = table.querySelector('#eed-day-balance-row');
    const sourceLabel = records[records.length - 1]?.source || t('contentSourceFallback');

    remaining.forEach((punch) => {
      const row = document.createElement('tr');
      row.className = 'eed-suggestion-row';
      const suggestedTime = this.secondsToTimeString(this.timeToSeconds(punch.expected) + shift);

      row.innerHTML = `
        <td><span class="eed-suggestion-tag">${t('contentSuggestionTag')}</span> ${punch.label}</td>
        <td>${sourceLabel}</td>
        <td><i class="${punch.icon} eed-suggestion-icon"></i></td>
        <td>${suggestedTime}</td>
      `;

      if (balanceRow) {
        table.insertBefore(row, balanceRow);
      } else {
        table.appendChild(row);
      }
    });
  },

  getExpectedTime(type, entradaIndex, saidaIndex, totalSaidas, settings) {
    if (this.isEntrada(type)) {
      return entradaIndex === 0 ? settings.entrada : settings.intervaloFim;
    }

    if (!this.hasInterval(settings)) {
      return settings.saida;
    }

    if (saidaIndex >= totalSaidas - 1 && totalSaidas >= 2) {
      return settings.saida;
    }

    return settings.intervaloInicio;
  },

  async applyRecordColors() {
    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (!table || typeof EEDSettings === 'undefined') return;

    const settings = await EEDSettings.load();
    await this.applyRecordColorsWithState(settings, table);
  },

  async applyRecordColorsWithState(settings, table) {
    const rows = table.querySelectorAll('tr');

    if (!EEDSettings.isScheduleConfigured(settings)) {
      rows.forEach((row) => {
        if (row.id === 'eed-day-balance-row' || row.classList.contains('eed-suggestion-row')) return;
        const timeCell = row.querySelectorAll('td')[3];
        timeCell?.classList.remove('eed-time-ok', 'eed-time-warning', 'eed-time-late');
      });
      this.clearSuggestionRows(table);
      await this.renderDayBalance(settings, table);
      return;
    }

    const records = this.getRecords();

    let entradaIndex = 0;
    let saidaIndex = 0;

    const totalSaidas = records.filter((record) => this.isSaida(record.type)).length;

    rows.forEach((row) => {
      if (row.id === 'eed-day-balance-row' || row.classList.contains('eed-suggestion-row')) return;

      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      const type = cells[0].textContent.trim();
      const timeCell = cells[3];
      const recordedTime = timeCell.textContent.trim();

      if (!this.isEntrada(type) && !this.isSaida(type)) {
        timeCell.classList.remove('eed-time-ok', 'eed-time-warning', 'eed-time-late');
        return;
      }

      const expectedTime = this.getExpectedTime(
        type,
        entradaIndex,
        saidaIndex,
        totalSaidas,
        settings
      );

      if (this.isEntrada(type)) entradaIndex += 1;
      else saidaIndex += 1;

      const status = this.getRecordStatus(
        type,
        recordedTime,
        expectedTime,
        settings.toleranciaAtraso
      );
      this.setTimeCellStatus(timeCell, status);
    });

    this.renderSuggestionRows(settings, table, records);
    await this.renderDayBalance(settings, table);
  },

  adjustRecordsContainer(scrollContainer, hasBalance) {
    if (!scrollContainer) return;

    if (!scrollContainer.dataset.eedOriginalHeight) {
      scrollContainer.dataset.eedOriginalHeight = scrollContainer.style.height || '';
      scrollContainer.dataset.eedOriginalOverflow = scrollContainer.style.overflow || '';
    }

    if (hasBalance) {
      scrollContainer.style.height = 'auto';
      scrollContainer.style.minHeight = scrollContainer.dataset.eedOriginalHeight || '13em';
      scrollContainer.style.overflow = 'visible';
      return;
    }

    scrollContainer.style.height = scrollContainer.dataset.eedOriginalHeight;
    scrollContainer.style.minHeight = '';
    scrollContainer.style.overflow = scrollContainer.dataset.eedOriginalOverflow || '';
  },

  async renderDayBalance(settings, tableEl) {
    const table = tableEl || document.querySelector(this.SELECTORS.recordsTable);
    if (!table) return;

    const scrollContainer = table.closest('.table-responsive');
    const panelBody = scrollContainer?.closest('.panel-body');
    panelBody?.querySelector('#eed-day-balance')?.remove();

    const records = this.getRecords();
    let balanceRow = table.querySelector('#eed-day-balance-row');

    if (!records.length) {
      balanceRow?.remove();
      this.adjustRecordsContainer(scrollContainer, false);
      return;
    }

    const loadedSettings = settings || await EEDSettings.load();
    const scheduleConfigured = EEDSettings.isScheduleConfigured(loadedSettings);

    if (balanceRow && !balanceRow.querySelector('.eed-day-balance-card')) {
      balanceRow.remove();
      balanceRow = null;
    }

    if (!balanceRow) {
      balanceRow = document.createElement('tr');
      balanceRow.id = 'eed-day-balance-row';
      balanceRow.className = 'eed-day-balance-row';
      balanceRow.innerHTML = `
        <td colspan="4" class="eed-day-balance-wrap">
          <div class="eed-day-balance-card fadeInUp animated">
            <div class="eed-day-balance-main">
              <span class="eed-day-balance-label">${t('contentDayBalanceLabel')}</span>
              <button type="button" class="eed-day-balance-credit">
                <img src="${chrome.runtime.getURL('icons/easy-easy-dots.png')}" alt="" class="eed-day-balance-credit-icon" aria-hidden="true">
                ${t('contentCreditByline')}
              </button>
            </div>
            <div class="eed-day-balance-value"></div>
          </div>
        </td>
      `;
      balanceRow.querySelector('.eed-day-balance-credit')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(EED_EXTENSION_URL, '_blank', 'noopener');
      });
      table.appendChild(balanceRow);
    }

    const valueEl = balanceRow.querySelector('.eed-day-balance-value');

    if (!scheduleConfigured) {
      const hintText = t('contentScheduleHint');
      const hintClass = 'eed-day-balance-value eed-day-balance-hint';

      if (valueEl.textContent !== hintText) {
        valueEl.textContent = hintText;
      }

      if (valueEl.className !== hintClass) {
        valueEl.className = hintClass;
      }

      this.adjustRecordsContainer(scrollContainer, true);
      return;
    }

    const totalSeconds = this.calculateDayBalance(records, loadedSettings);
    const { text, sign } = this.formatBalance(totalSeconds);
    const nextClass = `eed-day-balance-value eed-day-balance-${sign}`;

    if (valueEl.textContent !== text) {
      valueEl.textContent = text;
    }

    if (valueEl.className !== nextClass) {
      valueEl.className = nextClass;
    }

    this.adjustRecordsContainer(scrollContainer, true);
  },

  async updateRecordsView(force = false) {
    if (this.isUpdating) return;

    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (!table || typeof EEDSettings === 'undefined') return;

    const settings = await EEDSettings.load();
    const records = this.getRecords();
    const nextState = this.getViewStateFingerprint(settings, records);

    if (!force && nextState === this.lastViewState) return;

    this.isUpdating = true;

    try {
      await this.applyRecordColorsWithState(settings, table);
      this.lastViewState = nextState;
    } finally {
      this.isUpdating = false;
    }
  },

  observeRecordsTable() {
    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (!table || table.dataset.eedObserved) return;

    table.dataset.eedObserved = 'true';

    const observer = new MutationObserver((mutations) => {
      if (this.isUpdating) return;

      const isRelevant = mutations.some((mutation) => {
        const target = mutation.target;

        if (target.nodeType === Node.TEXT_NODE) {
          const row = target.parentElement?.closest('tr');
          return (
            row?.id !== 'eed-day-balance-row' &&
            !row?.classList.contains('eed-suggestion-row') &&
            Boolean(row?.closest('#table_registro_horario'))
          );
        }

        if (target.id === 'eed-day-balance-row' || target.closest?.('#eed-day-balance-row')) {
          return false;
        }

        if (target.classList?.contains('eed-suggestion-row') || target.closest?.('.eed-suggestion-row')) {
          return false;
        }

        return Boolean(target.closest?.('#table_registro_horario'));
      });

      if (isRelevant) {
        this.scheduleUpdateRecordsView();
      }
    });

    observer.observe(table, { childList: true, subtree: true, characterData: true });
    this.updateRecordsView(true);
  },

  getClock() {
    const el = document.querySelector(this.SELECTORS.clock);
    return el ? el.textContent.trim() : null;
  },

  getLastRecord() {
    const records = this.getRecords();
    return records.length > 0 ? records[records.length - 1] : null;
  },

  isLoggedIn() {
    return Boolean(
      document.querySelector(this.SELECTORS.registerButton) ||
      document.querySelector(this.SELECTORS.recordsTable)
    );
  },

  ensureRegisterButton() {
    const deviceType = document.querySelector(this.SELECTORS.deviceType);
    const registerButton = document.querySelector(this.SELECTORS.registerButton);

    if (!deviceType || registerButton) return;

    const isMobileMessage = deviceType.textContent.includes('dispositivo móvel');
    if (isMobileMessage) {
      deviceType.innerHTML = this.getRegisterButtonHtml();
      deviceType.style.color = '';
    }
  },

  registerTime() {
    this.ensureRegisterButton();

    const button = document.querySelector(this.SELECTORS.registerButton);
    if (!button) {
      return { success: false, error: t('contentErrorRegisterNotFound') };
    }

    button.click();
    return { success: true };
  },

  getPageData() {
    return {
      loggedIn: this.isLoggedIn(),
      clock: this.getClock(),
      records: this.getRecords(),
      lastRecord: this.getLastRecord(),
      url: window.location.href,
    };
  },

  injectNavbarItem() {
    if (document.querySelector(this.SELECTORS.settingsMenuItem)) return;

    const navbar = document.querySelector(this.SELECTORS.navbar);
    if (!navbar) return;

    const li = document.createElement('li');
    li.id = 'eed-navbar-settings';
    li.className = 'dropdown top-menu-item-xs hidden-xs hidden-sm';
    li.innerHTML = `
      <a href="#" class="dropdown-toggle eed-navbar-settings-link waves-effect waves-light" title="${t('contentNavbarTitle')}">
        ${GEAR_ICON_SVG}
        <span class="eed-navbar-settings-label">${t('contentNavbarLabel')}</span>
      </a>
    `;

    li.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({ action: 'openSettings' });
    });

    navbar.insertBefore(li, navbar.firstChild);

    const settingsLink = li.querySelector('a.waves-effect');
    if (settingsLink && typeof Waves !== 'undefined' && typeof Waves.attach === 'function') {
      Waves.attach(settingsLink);
    }
  },
};

function init() {
  EEDSettings.rememberSiteUrl(window.location.href).catch(() => {});

  EASydots.injectNavbarItem();
  EASydots.ensureRegisterButton();
  EASydots.observeRecordsTable();

  const observer = new MutationObserver(() => {
    EASydots.injectNavbarItem();
    EASydots.ensureRegisterButton();
    EASydots.observeRecordsTable();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['eed-settings']) {
    EASydots.lastViewState = '';
    EASydots.scheduleUpdateRecordsView(true);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getPageData') {
    sendResponse(EASydots.getPageData());
    return true;
  }

  if (message.action === 'registerTime') {
    sendResponse(EASydots.registerTime());
    return true;
  }

  return false;
});

init();
