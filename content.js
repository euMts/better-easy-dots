const EXTERNAL_LINK_ICON_SVG = `<svg class="eed-sidebar-settings-external" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polyline points="17 3 21 3 21 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><line x1="11" y1="13" x2="21" y2="3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M19,13.89V20a1,1,0,0,1-1,1H4a1,1,0,0,1-1-1V6A1,1,0,0,1,4,5h6.11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>`;

const EASydots = {
  SELECTORS: {
    registerButton: '#btnRegister',
    recordsTable: '#table_registro_horario',
    clock: '.clock',
    deviceType: '#deviceType',
    sidebarMenu: '#sidebar-menu > ul',
    settingsMenuItem: '#eed-sidebar-settings',
    jornadaInput: '#inputHorario',
    jornadaImport: '#eed-jornada-import',
  },

  isUpdating: false,
  updateTimer: null,
  cachedSettings: null,
  lastViewState: '',
  jornadaImportBusy: false,
  jornadaFeedbackTimeout: null,
  jornadaImportReady: false,
  jornadaSyncTimer: null,

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

  formatDuration(totalSeconds) {
    const abs = Math.abs(Math.round(totalSeconds));
    const hours = Math.floor(abs / 3600);
    const minutes = Math.floor((abs % 3600) / 60);
    const seconds = abs % 60;

    return [hours, minutes, seconds]
      .map((unit) => String(unit).padStart(2, '0'))
      .join(':');
  },

  getDayBalanceTooltip(records, settings) {
    if (!EEDSettings.isScheduleConfigured(settings)) {
      return t('contentDayBalanceTooltipNotConfigured');
    }

    const expectedDaily = this.calculateExpectedDailyWork(settings);
    const worked = this.calculateWorkedSeconds(records);
    const workedText = this.formatDuration(worked);
    const expectedText = this.formatDuration(expectedDaily);

    if (!this.isWorkDayComplete(records, settings)) {
      const remaining = Math.max(0, expectedDaily - worked);
      return t('contentDayBalanceTooltipIncomplete', [
        workedText,
        expectedText,
        this.formatDuration(remaining),
      ]);
    }

    const balance = this.calculateDayBalance(records, settings);
    const balanceText = this.formatDuration(balance);

    if (balance === 0) {
      return t('contentDayBalanceTooltipCompleteNeutral', [expectedText]);
    }

    if (balance > 0) {
      return t('contentDayBalanceTooltipCompletePositive', [balanceText, expectedText]);
    }

    return t('contentDayBalanceTooltipCompleteNegative', [balanceText, expectedText]);
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

    return worked - expectedDaily;
  },

  timeToMinutes(timeStr) {
    return this.timeToSeconds(timeStr) / 60;
  },

  getEntradaStatus(recordedTime, expectedTime, toleranceMinutes) {
    const lateSeconds = this.timeToSeconds(recordedTime) - this.timeToSeconds(expectedTime);

    if (lateSeconds <= 0) return 'eed-time-ok';
    if (lateSeconds <= toleranceMinutes * 60) return 'eed-time-warning';
    return 'eed-time-late';
  },

  getSaidaStatus(recordedTime, expectedTime, toleranceMinutes) {
    const earlySeconds = this.timeToSeconds(expectedTime) - this.timeToSeconds(recordedTime);

    if (earlySeconds <= 0) return 'eed-time-ok';
    if (earlySeconds <= toleranceMinutes * 60) return 'eed-time-warning';
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

  TIME_STATUS_CLASSES: ['eed-time-ok', 'eed-time-warning', 'eed-time-late'],

  setTimeCellStatus(timeCell, status) {
    if (timeCell.classList.contains(status)) return;

    timeCell.classList.remove(...this.TIME_STATUS_CLASSES);
    timeCell.classList.add(status);
  },

  getRecordKind(type, entradaIndex, saidaIndex, totalSaidas, settings) {
    if (this.isEntrada(type)) {
      return entradaIndex === 0 ? 'workEntry' : 'breakEnd';
    }

    if (!this.hasInterval(settings)) {
      return 'workExit';
    }

    if (saidaIndex >= totalSaidas - 1 && totalSaidas >= 2) {
      return 'workExit';
    }

    return 'breakStart';
  },

  calculateDifferenceSeconds(type, recordedTime, expectedTime) {
    const recorded = this.timeToSeconds(recordedTime);
    const expected = this.timeToSeconds(expectedTime);

    if (this.isEntrada(type)) {
      return expected - recorded;
    }

    return recorded - expected;
  },

  formatDifferenceText(diffSeconds) {
    if (diffSeconds === 0) return '00:00:00';

    const sign = diffSeconds > 0 ? '+' : '-';
    const abs = Math.abs(diffSeconds);
    const hours = Math.floor(abs / 3600);
    const minutes = Math.floor((abs % 3600) / 60);
    const seconds = abs % 60;

    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  },

  formatExpectedTimeForTooltip(expectedTime) {
    return this.secondsToTimeString(this.timeToSeconds(expectedTime));
  },

  getDifferenceTooltip(kind, diffSeconds, expectedTime) {
    const expectedLabel = this.formatExpectedTimeForTooltip(expectedTime);
    const absSeconds = Math.abs(diffSeconds);
    if (absSeconds === 0) return t('contentDiffTooltipOnTime', [expectedLabel]);

    const isEntradaKind = kind === 'workEntry' || kind === 'breakEnd';
    const isEarly = isEntradaKind ? diffSeconds > 0 : diffSeconds < 0;
    const useSeconds = absSeconds < 60;
    const keyMap = {
      workEntry: {
        early: {
          second: ['contentDiffTooltipWorkEntryEarlySecondsOne', 'contentDiffTooltipWorkEntryEarlySeconds'],
          minute: ['contentDiffTooltipWorkEntryEarlyOne', 'contentDiffTooltipWorkEntryEarly'],
        },
        late: {
          second: ['contentDiffTooltipWorkEntryLateSecondsOne', 'contentDiffTooltipWorkEntryLateSeconds'],
          minute: ['contentDiffTooltipWorkEntryLateOne', 'contentDiffTooltipWorkEntryLate'],
        },
      },
      breakStart: {
        early: {
          second: ['contentDiffTooltipBreakStartEarlySecondsOne', 'contentDiffTooltipBreakStartEarlySeconds'],
          minute: ['contentDiffTooltipBreakStartEarlyOne', 'contentDiffTooltipBreakStartEarly'],
        },
        late: {
          second: ['contentDiffTooltipBreakStartLateSecondsOne', 'contentDiffTooltipBreakStartLateSeconds'],
          minute: ['contentDiffTooltipBreakStartLateOne', 'contentDiffTooltipBreakStartLate'],
        },
      },
      breakEnd: {
        early: {
          second: ['contentDiffTooltipBreakEndEarlySecondsOne', 'contentDiffTooltipBreakEndEarlySeconds'],
          minute: ['contentDiffTooltipBreakEndEarlyOne', 'contentDiffTooltipBreakEndEarly'],
        },
        late: {
          second: ['contentDiffTooltipBreakEndLateSecondsOne', 'contentDiffTooltipBreakEndLateSeconds'],
          minute: ['contentDiffTooltipBreakEndLateOne', 'contentDiffTooltipBreakEndLate'],
        },
      },
      workExit: {
        early: {
          second: ['contentDiffTooltipWorkExitEarlySecondsOne', 'contentDiffTooltipWorkExitEarlySeconds'],
          minute: ['contentDiffTooltipWorkExitEarlyOne', 'contentDiffTooltipWorkExitEarly'],
        },
        late: {
          second: ['contentDiffTooltipWorkExitLateSecondsOne', 'contentDiffTooltipWorkExitLateSeconds'],
          minute: ['contentDiffTooltipWorkExitLateOne', 'contentDiffTooltipWorkExitLate'],
        },
      },
    };

    const unit = useSeconds ? 'second' : 'minute';
    const amount = useSeconds ? absSeconds : Math.floor(absSeconds / 60);
    const [oneKey, manyKey] = keyMap[kind][isEarly ? 'early' : 'late'][unit];
    return t(amount === 1 ? oneKey : manyKey, amount === 1 ? [expectedLabel] : [String(amount), expectedLabel]);
  },

  ensureDiffColumnHeader(recordsRoot) {
    const tableEl = recordsRoot?.closest?.('table') || recordsRoot;
    const headerRow =
      tableEl.querySelector('thead tr') || tableEl.querySelector('th')?.closest('tr');
    if (!headerRow || headerRow.querySelector('.eed-diff-header')) return;

    const headerCell = document.createElement('th');
    headerCell.className = 'eed-diff-header';
    headerCell.scope = 'col';
    headerCell.textContent = t('contentDiffColumnHeader');
    headerRow.appendChild(headerCell);
  },

  ensureDiffCell(row) {
    if (row.id === 'eed-day-balance-row') return null;

    if (row.classList.contains('eed-suggestion-row')) {
      while (row.querySelectorAll('td').length < 5) {
        row.appendChild(document.createElement('td'));
      }
      return null;
    }

    let diffCell = row.querySelector('.eed-diff-cell');
    if (!diffCell) {
      diffCell = document.createElement('td');
      diffCell.className = 'eed-diff-cell';
      row.appendChild(diffCell);
    }

    return diffCell;
  },

  setTooltipTarget(el, tooltip) {
    if (tooltip) {
      el.setAttribute('data-eed-tooltip', tooltip);
      if (el.title !== tooltip) {
        el.title = tooltip;
      }
    } else {
      el.removeAttribute('data-eed-tooltip');
      el.removeAttribute('title');
      if (this.diffTooltipAnchor === el) {
        this.hideDiffTooltip();
      }
    }
  },

  setDiffCell(diffCell, text, status, tooltip) {
    if (diffCell.textContent !== text) {
      diffCell.textContent = text;
    }

    this.setTooltipTarget(diffCell, tooltip);

    if (!status) {
      diffCell.classList.remove(...this.TIME_STATUS_CLASSES);
      return;
    }

    if (diffCell.classList.contains(status)) return;

    diffCell.classList.remove(...this.TIME_STATUS_CLASSES);
    diffCell.classList.add(status);
  },

  clearDiffCell(diffCell) {
    diffCell.textContent = '';
    this.setTooltipTarget(diffCell, null);
    diffCell.classList.remove(...this.TIME_STATUS_CLASSES);
  },

  getDiffTooltipEl() {
    if (!this.diffTooltipEl) {
      this.diffTooltipEl = document.createElement('div');
      this.diffTooltipEl.id = 'eed-diff-tooltip';
      this.diffTooltipEl.className = 'eed-diff-tooltip';
      this.diffTooltipEl.hidden = true;
      this.diffTooltipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(this.diffTooltipEl);
    }

    return this.diffTooltipEl;
  },

  positionDiffTooltip(cell) {
    const tip = this.getDiffTooltipEl();
    const rect = cell.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top}px`;
  },

  showDiffTooltip(cell) {
    const tooltip = cell.getAttribute('data-eed-tooltip');
    if (!tooltip) {
      this.hideDiffTooltip();
      return;
    }

    const tip = this.getDiffTooltipEl();
    tip.textContent = tooltip;
    tip.hidden = false;
    this.diffTooltipAnchor = cell;
    cell.setAttribute('aria-describedby', 'eed-diff-tooltip');
    this.positionDiffTooltip(cell);
  },

  hideDiffTooltip() {
    if (!this.diffTooltipEl) return;

    this.diffTooltipEl.hidden = true;
    this.diffTooltipAnchor?.removeAttribute('aria-describedby');
    this.diffTooltipAnchor = null;
  },

  installDiffTooltips(recordsRoot) {
    const tableEl = recordsRoot?.closest?.('table') || recordsRoot;
    if (!tableEl || tableEl.dataset.eedDiffTooltipsReady) return;

    tableEl.dataset.eedDiffTooltipsReady = 'true';

    tableEl.addEventListener('mouseover', (event) => {
      const target = event.target.closest('[data-eed-tooltip]');
      if (!target || !tableEl.contains(target)) return;
      this.showDiffTooltip(target);
    });

    tableEl.addEventListener('mouseout', (event) => {
      const target = event.target.closest('[data-eed-tooltip]');
      if (!target) return;

      const related = event.relatedTarget;
      if (related && target.contains(related)) return;

      if (this.diffTooltipAnchor === target) {
        this.hideDiffTooltip();
      }
    });

    this.handleDiffTooltipReposition = () => {
      if (this.diffTooltipAnchor) {
        this.positionDiffTooltip(this.diffTooltipAnchor);
      }
    };

    window.addEventListener('scroll', this.handleDiffTooltipReposition, true);
    window.addEventListener('resize', this.handleDiffTooltipReposition);
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
        <td></td>
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
    this.ensureDiffColumnHeader(table);
    this.installDiffTooltips(table);

    const rows = table.querySelectorAll('tr');
    const balanceRow = table.querySelector('#eed-day-balance-row');
    balanceRow?.querySelector('.eed-day-balance-wrap')?.setAttribute('colspan', '5');

    if (!EEDSettings.isScheduleConfigured(settings)) {
      rows.forEach((row) => {
        if (row.id === 'eed-day-balance-row' || row.classList.contains('eed-suggestion-row')) return;
        const timeCell = row.querySelectorAll('td')[3];
        timeCell?.classList.remove(...this.TIME_STATUS_CLASSES);
        const diffCell = this.ensureDiffCell(row);
        if (diffCell) this.clearDiffCell(diffCell);
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
      const diffCell = this.ensureDiffCell(row);

      if (!this.isEntrada(type) && !this.isSaida(type)) {
        timeCell.classList.remove(...this.TIME_STATUS_CLASSES);
        if (diffCell) this.clearDiffCell(diffCell);
        return;
      }

      const expectedTime = this.getExpectedTime(
        type,
        entradaIndex,
        saidaIndex,
        totalSaidas,
        settings
      );
      const recordKind = this.getRecordKind(
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

      if (diffCell) {
        const diffSeconds = this.calculateDifferenceSeconds(type, recordedTime, expectedTime);
        this.setDiffCell(
          diffCell,
          this.formatDifferenceText(diffSeconds),
          status,
          this.getDifferenceTooltip(recordKind, diffSeconds, expectedTime)
        );
      }
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
        <td colspan="5" class="eed-day-balance-wrap">
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

      this.setTooltipTarget(valueEl, t('contentDayBalanceTooltipNotConfigured'));

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

    this.setTooltipTarget(valueEl, this.getDayBalanceTooltip(records, loadedSettings));

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
      this.syncBadge();
    } finally {
      this.isUpdating = false;
    }
  },

  syncBadge() {
    if (!chrome.runtime?.sendMessage) return;

    const recordCount = this.getRecords().length;
    chrome.runtime.sendMessage({ action: 'syncBadge', recordCount }).catch(() => {});
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
          if (target.parentElement?.classList?.contains('eed-diff-cell')) {
            return false;
          }

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

        if (
          target.classList?.contains('eed-diff-cell') ||
          target.classList?.contains('eed-diff-header') ||
          target.closest?.('.eed-diff-cell') ||
          target.closest?.('.eed-diff-header')
        ) {
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

  getJornadaImportButtonParts(button) {
    return {
      iconEl: button.querySelector('.eed-jornada-import-icon'),
      spinnerEl: button.querySelector('.eed-jornada-import-spinner'),
      checkEl: button.querySelector('.eed-jornada-import-check'),
      labelEl: button.querySelector('.eed-jornada-import-label'),
    };
  },

  setJornadaImportVisualState(button, state) {
    if (!button) return;

    if (button.dataset.eedVisualState === state) return;
    button.dataset.eedVisualState = state;

    const { iconEl, spinnerEl, checkEl, labelEl } = this.getJornadaImportButtonParts(button);

    button.classList.remove(
      'eed-jornada-import--loading',
      'eed-jornada-import--success',
      'eed-jornada-import--error',
      'eed-jornada-import--flash',
      'eed-jornada-import--saved'
    );

    if (iconEl) iconEl.hidden = state !== 'idle' && state !== 'saved';
    if (spinnerEl) spinnerEl.hidden = state !== 'loading';
    if (checkEl) checkEl.hidden = state !== 'success' && state !== 'saved';

    if (state === 'loading') {
      button.disabled = true;
      button.classList.add('eed-jornada-import--loading');
      if (labelEl) labelEl.textContent = t('contentJornadaImportSaving');
      return;
    }

    if (state === 'success') {
      button.disabled = false;
      button.classList.add('eed-jornada-import--success', 'eed-jornada-import--flash');
      if (labelEl) labelEl.textContent = t('contentJornadaImportSuccess');
      return;
    }

    if (state === 'error') {
      button.disabled = false;
      button.classList.add('eed-jornada-import--error');
      if (iconEl) iconEl.hidden = false;
      if (labelEl) labelEl.textContent = t('contentJornadaImportFail');
      return;
    }

    if (state === 'saved') {
      button.disabled = false;
      button.classList.add('eed-jornada-import--saved');
      if (labelEl) labelEl.textContent = t('contentJornadaImportSaved');
      return;
    }

    button.disabled = false;
    if (iconEl) iconEl.hidden = false;
    if (labelEl) labelEl.textContent = t('contentJornadaImport');
  },

  formatJornadaImportDetail(parsed) {
    const hasInterval = this.timeToSeconds(parsed.intervaloFim) > this.timeToSeconds(parsed.intervaloInicio);

    if (hasInterval) {
      return t('contentJornadaImportSuccessDetail', [
        parsed.entrada,
        parsed.intervaloInicio,
        parsed.intervaloFim,
        parsed.saida,
      ]);
    }

    return t('contentJornadaImportSuccessSimple', [parsed.entrada, parsed.saida]);
  },

  showJornadaImportToast(column, type, parsed = null) {
    if (!column) return;

    let toast = column.querySelector('#eed-jornada-feedback');
    if (!toast) return;

    if (this.jornadaFeedbackTimeout) {
      clearTimeout(this.jornadaFeedbackTimeout);
      this.jornadaFeedbackTimeout = null;
    }

    toast.classList.remove(
      'eed-jornada-feedback--visible',
      'eed-jornada-feedback--success',
      'eed-jornada-feedback--error'
    );
    void toast.offsetWidth;

    if (type === 'success' && parsed) {
      toast.innerHTML = `
        <span class="eed-jornada-feedback-icon" aria-hidden="true">✓</span>
        <span class="eed-jornada-feedback-copy">
          <strong>${t('contentJornadaImportSuccess')}</strong>
          <span>${this.formatJornadaImportDetail(parsed)}</span>
        </span>
      `;
      toast.classList.add('eed-jornada-feedback--success', 'eed-jornada-feedback--visible');
    } else {
      toast.innerHTML = `
        <span class="eed-jornada-feedback-icon" aria-hidden="true">!</span>
        <span class="eed-jornada-feedback-copy">
          <strong>${t('contentJornadaImportFail')}</strong>
        </span>
      `;
      toast.classList.add('eed-jornada-feedback--error', 'eed-jornada-feedback--visible');
    }

    this.jornadaFeedbackTimeout = window.setTimeout(() => {
      toast.classList.remove('eed-jornada-feedback--visible');
    }, 4200);
  },

  scheduleJornadaImportSync() {
    clearTimeout(this.jornadaSyncTimer);
    this.jornadaSyncTimer = window.setTimeout(() => {
      this.syncJornadaImportState().catch(() => {});
    }, 80);
  },

  async syncJornadaImportState() {
    if (this.jornadaImportBusy) return;

    const importButton = document.querySelector(this.SELECTORS.jornadaImport);
    const input = document.querySelector(this.SELECTORS.jornadaInput);
    if (!importButton || !input || typeof EEDSettings === 'undefined') return;

    const parsed = EEDSettings.parseEasydotsJornada(input.value);

    if (!parsed) {
      importButton.disabled = true;
      this.setJornadaImportVisualState(importButton, 'idle');
      importButton.querySelector('.eed-jornada-import-label').textContent = t('contentJornadaImportError');
      return;
    }

    const settings = this.cachedSettings || (await EEDSettings.load());
    const isSaved = EEDSettings.scheduleMatchesJornada(settings, input.value);
    this.setJornadaImportVisualState(importButton, isSaved ? 'saved' : 'idle');
  },

  async importJornadaFromInput() {
    if (this.jornadaImportBusy) return;

    const input = document.querySelector(this.SELECTORS.jornadaInput);
    const importButton = document.querySelector(this.SELECTORS.jornadaImport);
    const column = input?.closest('.col-sm-12, .col-md-6, [class*="col-"]');
    if (!input || !importButton || typeof EEDSettings === 'undefined') return;

    const parsed = EEDSettings.parseEasydotsJornada(input.value);
    this.jornadaImportBusy = true;
    delete importButton.dataset.eedVisualState;
    this.setJornadaImportVisualState(importButton, 'loading');

    await new Promise((resolve) => window.setTimeout(resolve, 280));

    if (!parsed) {
      this.setJornadaImportVisualState(importButton, 'error');
      this.showJornadaImportToast(column, 'error');
      window.setTimeout(() => {
        this.jornadaImportBusy = false;
        this.syncJornadaImportState().catch(() => {});
      }, 1800);
      return;
    }

    try {
      const current = await EEDSettings.load();
      const saved = await EEDSettings.save({ ...current, ...parsed });
      this.cachedSettings = saved;
      this.lastViewState = '';
      this.scheduleUpdateRecordsView(true);

      delete importButton.dataset.eedVisualState;
      this.setJornadaImportVisualState(importButton, 'success');
      this.showJornadaImportToast(column, 'success', parsed);

      window.setTimeout(() => {
        this.jornadaImportBusy = false;
        delete importButton.dataset.eedVisualState;
        this.setJornadaImportVisualState(importButton, 'saved');
      }, 2200);
    } catch {
      delete importButton?.dataset.eedVisualState;
      this.setJornadaImportVisualState(importButton, 'error');
      this.showJornadaImportToast(column, 'error');
      window.setTimeout(() => {
        this.jornadaImportBusy = false;
        this.syncJornadaImportState().catch(() => {});
      }, 1800);
    }
  },

  ensureJornadaImport() {
    if (this.jornadaImportReady) return;

    const input = document.querySelector(this.SELECTORS.jornadaInput);
    if (!input) return;

    if (document.querySelector(this.SELECTORS.jornadaImport)) {
      this.jornadaImportReady = true;
      return;
    }

    const column = input.closest('.col-sm-12, .col-md-6, [class*="col-"]');
    if (!column) return;

    const existingLabel = column.querySelector('label.control-label');
    if (!existingLabel) return;

    const labelRow = document.createElement('div');
    labelRow.className = 'eed-jornada-label-row';
    existingLabel.replaceWith(labelRow);
    labelRow.appendChild(existingLabel);

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.id = 'eed-jornada-import';
    importButton.className = 'eed-jornada-import';
    importButton.title = t('contentJornadaImportTitle');
    importButton.innerHTML = `
      <img src="${chrome.runtime.getURL('icons/easy-easy-dots.png')}" alt="" class="eed-jornada-import-icon" aria-hidden="true">
      <span class="eed-jornada-import-spinner" hidden aria-hidden="true"></span>
      <span class="eed-jornada-import-check" hidden aria-hidden="true">✓</span>
      <span class="eed-jornada-import-label">${t('contentJornadaImport')}</span>
    `;
    importButton.addEventListener('click', (event) => {
      event.preventDefault();
      this.importJornadaFromInput().catch(() => {});
    });
    labelRow.appendChild(importButton);

    let toast = column.querySelector('#eed-jornada-feedback');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'eed-jornada-feedback';
      toast.className = 'eed-jornada-feedback';
      toast.setAttribute('aria-live', 'polite');
      column.querySelector('.input-group')?.insertAdjacentElement('afterend', toast);
    }

    this.jornadaImportReady = true;
    this.scheduleJornadaImportSync();
  },

  removeLegacyNavbarItem() {
    document.querySelector('#eed-navbar-settings')?.remove();
  },

  injectSidebarSettingsItem() {
    this.removeLegacyNavbarItem();

    if (document.querySelector(this.SELECTORS.settingsMenuItem)) return;

    const menuList = document.querySelector(this.SELECTORS.sidebarMenu);
    if (!menuList) return;

    const iconUrl = chrome.runtime.getURL('icons/easy-easy-dots.png');
    const li = document.createElement('li');
    li.id = 'eed-sidebar-settings';
    li.innerHTML = `
      <a href="#" class="waves-effect eed-sidebar-settings-link" title="${t('contentSidebarSettingsTitle')}">
        <span class="eed-sidebar-settings-main">
          <img src="${iconUrl}" alt="" class="eed-sidebar-settings-icon" aria-hidden="true">
          <span class="eed-sidebar-settings-label">${t('contentSidebarSettingsLabel')}</span>
        </span>
        ${EXTERNAL_LINK_ICON_SVG}
      </a>
    `;

    li.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({ action: 'openSettings' });
    });

    menuList.appendChild(li);

    const settingsLink = li.querySelector('a.waves-effect');
    if (settingsLink && typeof Waves !== 'undefined' && typeof Waves.attach === 'function') {
      Waves.attach(settingsLink);
    }
  },
};

function init() {
  EEDSettings.rememberSiteUrl(window.location.href).catch(() => {});

  EASydots.injectSidebarSettingsItem();
  EASydots.ensureRegisterButton();
  EASydots.observeRecordsTable();
  EASydots.ensureJornadaImport();

  const observer = new MutationObserver(() => {
    EASydots.injectSidebarSettingsItem();
    EASydots.ensureRegisterButton();
    EASydots.observeRecordsTable();

    if (
      !EASydots.jornadaImportReady &&
      document.querySelector(EASydots.SELECTORS.jornadaInput) &&
      !document.querySelector(EASydots.SELECTORS.jornadaImport)
    ) {
      EASydots.ensureJornadaImport();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  EASydots.syncBadge();
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['eed-settings']) {
      EASydots.cachedSettings = null;
      EASydots.lastViewState = '';
      EASydots.scheduleUpdateRecordsView(true);
      EASydots.scheduleJornadaImportSync();
    }
  });
}

init();
