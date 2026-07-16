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
  pageObserver: null,
  tableObserver: null,
  hourBankObservers: [],
  extensionDead: false,

  isExtensionAlive() {
    if (this.extensionDead) return false;

    try {
      // Accessing chrome.runtime after reload throws in some Chrome versions.
      const runtime = chrome?.runtime;
      if (!runtime || !runtime.id) {
        this.markExtensionDead();
        return false;
      }
      return true;
    } catch {
      this.markExtensionDead();
      return false;
    }
  },

  markExtensionDead() {
    if (this.extensionDead) return;
    this.extensionDead = true;

    clearTimeout(this.updateTimer);
    clearTimeout(this.jornadaSyncTimer);
    clearTimeout(this.jornadaFeedbackTimeout);
    this.updateTimer = null;
    this.jornadaSyncTimer = null;
    this.jornadaFeedbackTimeout = null;

    try {
      this.pageObserver?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.tableObserver?.disconnect();
    } catch {
      /* ignore */
    }

    (this.hourBankObservers || []).forEach((observer) => {
      try {
        observer.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.hourBankObservers = [];
    this.pageObserver = null;
    this.tableObserver = null;
  },

  getExtensionAssetUrl(path) {
    try {
      if (!this.isExtensionAlive()) return '';
      return chrome.runtime.getURL(path);
    } catch {
      this.markExtensionDead();
      return '';
    }
  },

  sendRuntimeMessage(message) {
    try {
      if (!this.isExtensionAlive()) return;

      const sendMessage = chrome?.runtime?.sendMessage;
      if (typeof sendMessage !== 'function') return;

      const result = sendMessage.call(chrome.runtime, message);
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          this.markExtensionDead();
        });
      }
    } catch {
      this.markExtensionDead();
    }
  },

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

  parseSignedHHMMSSToSeconds(text) {
    if (!text || typeof text !== 'string') return null;

    const normalized = text.trim().replace(/\s+/g, '');
    if (!normalized) return null;

    const sign = normalized.startsWith('-') ? -1 : 1;
    const clean = normalized.replace(/^[-+]/, '');
    const parts = clean.split(':').map(Number);

    if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) {
      return null;
    }

    const [hours, minutes, seconds = 0] = parts;
    return sign * (hours * 3600 + minutes * 60 + seconds);
  },

  formatSecondsToHHMMSS(seconds) {
    return this.formatDuration(seconds);
  },

  calculateExtraPerDay(totalSeconds, days) {
    const abs = Math.abs(totalSeconds);
    if (days <= 0 || abs === 0) return 0;
    return Math.ceil(abs / days);
  },

  getDayBalanceTooltip(records, settings) {
    if (!EEDSettings.isScheduleConfigured(settings)) {
      return t('contentDayBalanceTooltipNotConfigured');
    }

    const analysis = this.buildDayBalanceAnalysis(records, settings);
    return this.buildDayBalanceTooltipText(analysis, settings);
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

  applyDailyTolerance(balanceSeconds, toleranceSeconds) {
    if (Math.abs(balanceSeconds) <= toleranceSeconds) {
      return 0;
    }

    return balanceSeconds;
  },

  getToleranceSafeLimitSeconds(toleranceSeconds, safetyMarginSeconds) {
    return Math.max(0, toleranceSeconds - safetyMarginSeconds);
  },

  calculateNegativeCompensationOptions(projectedBalanceSeconds, toleranceSeconds, safetyMarginSeconds) {
    const missingSeconds = Math.abs(projectedBalanceSeconds);
    const theoreticalLimit = toleranceSeconds;
    const safeLimit = this.getToleranceSafeLimitSeconds(toleranceSeconds, safetyMarginSeconds);

    return {
      secondsToToleranceLimit: Math.max(0, missingSeconds - theoreticalLimit),
      secondsToSafeLimit: Math.max(0, missingSeconds - safeLimit),
      secondsToZero: missingSeconds,
    };
  },

  getToleranceSeconds(settings) {
    return Math.max(0, Number(settings.toleranciaAtraso) * 60);
  },

  getSafetyMarginSeconds(settings) {
    const margin = Number(settings.margemSegurancaTolerancia);
    return Math.max(0, (Number.isFinite(margin) ? margin : 1) * 60);
  },

  classifyDailyBalanceStatus(rawBalanceSeconds, toleranceSeconds, safeLimitSeconds) {
    const abs = Math.abs(rawBalanceSeconds);

    if (abs <= safeLimitSeconds) return 'within_safe';
    if (abs <= toleranceSeconds) return 'at_limit';
    if (rawBalanceSeconds < 0) return 'outside_negative';
    return 'outside_positive';
  },

  projectDayBalanceWithConfiguredSchedule(records, settings) {
    const remaining = this.getRemainingExpectedPunches(records, settings);
    if (!remaining.length) {
      return this.calculateDayBalance(records, settings);
    }

    const simulated = records.map((record) => ({
      type: record.type,
      time: record.time,
    }));

    remaining.forEach((punch) => {
      simulated.push({
        type: punch.type,
        time: this.formatExpectedTimeForTooltip(punch.expected),
      });
    });

    return this.calculateDayBalance(simulated, settings);
  },

  isFinalExitPunch(punch, settings) {
    return punch.type === 'saida' && punch.expected === settings.saida;
  },

  buildExitOptions(rawBalanceSeconds, settings) {
    if (rawBalanceSeconds >= 0) return null;

    const toleranceSeconds = this.getToleranceSeconds(settings);
    const safetyMarginSeconds = this.getSafetyMarginSeconds(settings);
    const compensation = this.calculateNegativeCompensationOptions(
      rawBalanceSeconds,
      toleranceSeconds,
      safetyMarginSeconds
    );
    const baseExitSeconds = this.timeToSeconds(settings.saida);

    return {
      compensation,
      configured: this.formatExpectedTimeForTooltip(settings.saida),
      minTolerance: this.secondsToTimeString(
        baseExitSeconds + compensation.secondsToToleranceLimit
      ),
      safe: this.secondsToTimeString(baseExitSeconds + compensation.secondsToSafeLimit),
      zero: this.secondsToTimeString(baseExitSeconds + compensation.secondsToZero),
    };
  },

  buildDayBalanceAnalysis(records, settings) {
    const complete = this.isWorkDayComplete(records, settings);
    const rawCurrent = this.calculateDayBalance(records, settings);
    const rawProjected = complete
      ? rawCurrent
      : this.projectDayBalanceWithConfiguredSchedule(records, settings);

    const toleranceSeconds = this.getToleranceSeconds(settings);
    const safetyMarginSeconds = this.getSafetyMarginSeconds(settings);
    const safeLimitSeconds = this.getToleranceSafeLimitSeconds(
      toleranceSeconds,
      safetyMarginSeconds
    );
    const considered = this.applyDailyTolerance(rawProjected, toleranceSeconds);
    const status = this.classifyDailyBalanceStatus(
      rawProjected,
      toleranceSeconds,
      safeLimitSeconds
    );
    const exits = this.buildExitOptions(rawProjected, settings);
    const estimatedOvertimeSeconds =
      rawProjected > toleranceSeconds ? rawProjected : 0;

    return {
      complete,
      rawCurrent,
      rawProjected,
      considered,
      status,
      toleranceSeconds,
      safetyMarginSeconds,
      safeLimitSeconds,
      exits,
      estimatedOvertimeSeconds,
    };
  },

  formatSignedBalanceText(totalSeconds) {
    const { text } = this.formatBalance(totalSeconds);
    return text.replace(/\s+/g, '');
  },

  buildDayBalanceStatusLabel(status) {
    if (status === 'within_safe') return t('contentDayBalanceStatusWithinSafe');
    if (status === 'at_limit') return t('contentDayBalanceStatusAtLimit');
    if (status === 'outside_negative') return t('contentDayBalanceStatusOutside');
    return t('contentDayBalanceStatusOvertime');
  },

  buildDayBalanceStatusCompactLabel(status) {
    if (status === 'within_safe') return t('contentDayBalanceStatusCompactWithinSafe');
    if (status === 'at_limit') return t('contentDayBalanceStatusCompactAtLimit');
    if (status === 'outside_negative') return t('contentDayBalanceStatusCompactOutside');
    return t('contentDayBalanceStatusCompactOvertime');
  },

  buildDayBalanceMetaLine(analysis) {
    const parts = [
      t('contentDayBalanceRawLabel', [
        this.formatSignedBalanceText(analysis.rawProjected),
      ]),
      this.buildDayBalanceStatusCompactLabel(analysis.status),
    ];

    if (analysis.estimatedOvertimeSeconds > 0) {
      parts.push(
        t('contentDayBalanceOvertimeCompact', [
          this.formatSignedBalanceText(analysis.estimatedOvertimeSeconds),
        ])
      );
    }

    if (
      !analysis.complete &&
      analysis.exits &&
      (analysis.status === 'outside_negative' || analysis.status === 'at_limit')
    ) {
      parts.push(t('contentDayBalanceSafeSuggestion', [analysis.exits.safe]));
    }

    return parts.join(' · ');
  },

  buildDayBalanceCreativeMessage(analysis, settings) {
    const configuredExit = this.formatExpectedTimeForTooltip(settings.saida);
    const amount = this.formatFriendlyDuration(Math.abs(analysis.rawProjected));

    if (analysis.status === 'within_safe') {
      return t('contentDayBalanceMsgWithinSafe', [configuredExit]);
    }

    if (analysis.status === 'at_limit') {
      const safeExit = analysis.exits?.safe || configuredExit;
      return t('contentDayBalanceMsgAtLimit', [configuredExit, safeExit]);
    }

    if (analysis.status === 'outside_negative') {
      const safeExit = analysis.exits?.safe || configuredExit;
      return t('contentDayBalanceMsgOutsideNeg', [configuredExit, amount, safeExit]);
    }

    return t('contentDayBalanceMsgOutsidePos', [configuredExit, amount]);
  },

  buildDayBalanceDetailsLine(analysis) {
    if (!analysis.exits || analysis.status === 'within_safe') return '';

    return t('contentDayBalanceMsgExitDetails', [
      analysis.exits.minTolerance,
      analysis.exits.safe,
      analysis.exits.zero,
    ]);
  },

  buildDayBalanceTooltipText(analysis, settings) {
    const parts = [t('contentDayBalanceTooltipExplain')];

    const meta = this.buildDayBalanceMetaLine(analysis);
    if (meta) {
      parts.push(meta);
    }

    if (settings) {
      parts.push(this.buildDayBalanceCreativeMessage(analysis, settings));
    }

    if (analysis.status === 'at_limit') {
      parts.push(t('contentDayBalanceTooltipAtLimitExtra'));
    }

    if (analysis.exits && (analysis.status === 'outside_negative' || analysis.status === 'at_limit')) {
      parts.push(this.buildDayBalanceDetailsLine(analysis));
    }

    if (analysis.estimatedOvertimeSeconds > 0) {
      parts.push(
        t('contentDayBalanceOvertimeToday', [
          this.formatSignedBalanceText(analysis.estimatedOvertimeSeconds),
        ])
      );
    }

    return parts.filter(Boolean).join(' ');
  },

  getSuggestionTooltipForPunch(punch, settings, analysis, suggestedTime) {
    if (this.isFinalExitPunch(punch, settings)) {
      if (analysis.status === 'within_safe') {
        return t('contentSuggestionTooltipKept');
      }

      if (analysis.status === 'outside_positive') {
        return t('contentSuggestionTooltipOvertime');
      }

      if (analysis.exits) {
        const configuredExit = analysis.exits.configured;
        const amount = this.formatFriendlyDuration(Math.abs(analysis.rawProjected));
        return [
          t('contentSuggestionTooltipSafeExit', [configuredExit, amount]),
          t('contentSuggestionTooltipExitOptions', [
            analysis.exits.minTolerance,
            analysis.exits.safe,
            analysis.exits.zero,
          ]),
        ].join(' ');
      }

      return t('contentSuggestionTooltipSafeExit', [
        this.formatExpectedTimeForTooltip(settings.saida),
        this.formatFriendlyDuration(Math.abs(analysis.rawProjected)),
      ]);
    }

    return t('contentSuggestionTooltipConfigured');
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
    if (!this.isExtensionAlive()) return;

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
    if (absSeconds === 0) {
      return `${t('contentDiffTooltipOnTime', [expectedLabel])} ${t('contentDiffTooltipDailyNote')}`;
    }

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
    const base = t(
      amount === 1 ? oneKey : manyKey,
      amount === 1 ? [expectedLabel] : [String(amount), expectedLabel]
    );
    return `${base} ${t('contentDiffTooltipDailyNote')}`;
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

  renderScheduleHint(valueEl) {
    const hintClass = 'eed-day-balance-value eed-day-balance-hint';

    if (valueEl.className !== hintClass) {
      valueEl.className = hintClass;
    }

    if (valueEl.dataset.eedScheduleHint === 'true') return;

    valueEl.dataset.eedScheduleHint = 'true';
    valueEl.innerHTML = `${t('contentScheduleHintBefore')} <button type="button" class="eed-day-balance-hint-link">${t('contentScheduleHintLink')}</button>`;

    valueEl.querySelector('.eed-day-balance-hint-link')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sendRuntimeMessage({ action: 'openSettings' });
    });
  },

  setTooltipTarget(el, tooltip) {
    if (!el) return;

    // Never set `title` — it triggers the native browser tooltip after a delay.
    el.removeAttribute('title');

    if (tooltip) {
      el.setAttribute('data-eed-tooltip', tooltip);
      el.setAttribute('aria-label', tooltip);
      return;
    }

    el.removeAttribute('data-eed-tooltip');
    el.removeAttribute('aria-label');
    if (this.diffTooltipAnchor === el) {
      this.hideDiffTooltip();
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

  isLunchExitPunch(punch, settings) {
    return (
      this.hasInterval(settings) &&
      punch.type === 'saida' &&
      punch.expected === settings.intervaloInicio
    );
  },

  getSuggestedTimeForPunch(records, settings, punch, analysis = null) {
    const configuredTime = this.formatExpectedTimeForTooltip(punch.expected);

    if (!this.isFinalExitPunch(punch, settings)) {
      return configuredTime;
    }

    if (
      analysis &&
      (analysis.status === 'outside_negative' || analysis.status === 'at_limit') &&
      analysis.exits?.safe
    ) {
      return analysis.exits.safe;
    }

    return configuredTime;
  },

  getSuggestedPunchTimes(records, settings) {
    const remaining = this.getRemainingExpectedPunches(records, settings);
    const analysis = this.buildDayBalanceAnalysis(records, settings);
    const suggestions = [];

    remaining.forEach((punch) => {
      const suggestedTime = this.getSuggestedTimeForPunch(records, settings, punch, analysis);
      suggestions.push({
        punch,
        suggestedTime,
        tooltip: this.getSuggestionTooltipForPunch(punch, settings, analysis, suggestedTime),
      });
    });

    return suggestions;
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

    const suggestions = this.getSuggestedPunchTimes(records, settings);
    if (!suggestions.length) return;

    const balanceRow = table.querySelector('#eed-day-balance-row');
    const sourceLabel = records[records.length - 1]?.source || t('contentSourceFallback');

    suggestions.forEach(({ punch, suggestedTime, tooltip }) => {
      const row = document.createElement('tr');
      row.className = 'eed-suggestion-row';

      row.innerHTML = `
        <td><span class="eed-suggestion-tag">${t('contentSuggestionTag')}</span> ${punch.label}</td>
        <td>${sourceLabel}</td>
        <td><i class="${punch.icon} eed-suggestion-icon"></i></td>
        <td class="eed-suggestion-time">${suggestedTime}</td>
        <td></td>
      `;

      const timeCell = row.querySelector('.eed-suggestion-time');
      if (timeCell && tooltip) {
        this.setTooltipTarget(timeCell, tooltip);
      }

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
    if (!this.isExtensionAlive()) return;

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

    if (
      balanceRow &&
      (!balanceRow.querySelector('.eed-day-balance-card') ||
        !balanceRow.querySelector('.eed-day-balance-meta'))
    ) {
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
            <div class="eed-day-balance-left">
              <span class="eed-day-balance-title">${t('contentDayBalanceLabel')}</span>
              <button type="button" class="eed-day-balance-credit">
                <img src="${this.getExtensionAssetUrl('icons/easy-easy-dots.png')}" alt="" class="eed-day-balance-credit-icon" aria-hidden="true">
                ${t('contentCreditByline')}
              </button>
              <div class="eed-day-balance-meta"></div>
            </div>
            <div class="eed-day-balance-right">
              <div class="eed-day-balance-value"></div>
              <div class="eed-day-balance-considered-label"></div>
            </div>
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

    const card = balanceRow.querySelector('.eed-day-balance-card');
    const valueEl = balanceRow.querySelector('.eed-day-balance-value');
    const consideredLabelEl = balanceRow.querySelector('.eed-day-balance-considered-label');
    const metaEl = balanceRow.querySelector('.eed-day-balance-meta');

    const clearStatusClasses = () => {
      card?.classList.remove(
        'eed-day-balance-card--within-safe',
        'eed-day-balance-card--at-limit',
        'eed-day-balance-card--outside-negative',
        'eed-day-balance-card--outside-positive'
      );
    };

    if (!scheduleConfigured) {
      clearStatusClasses();
      if (consideredLabelEl) consideredLabelEl.textContent = '';
      if (metaEl) {
        metaEl.textContent = '';
        metaEl.hidden = true;
      }
      this.renderScheduleHint(valueEl);
      this.setTooltipTarget(card || valueEl, t('contentDayBalanceTooltipNotConfigured'));

      this.adjustRecordsContainer(scrollContainer, true);
      return;
    }

    delete valueEl.dataset.eedScheduleHint;

    const analysis = this.buildDayBalanceAnalysis(records, loadedSettings);
    const { text } = this.formatBalance(analysis.considered);
    const statusClass = {
      within_safe: 'within-safe',
      at_limit: 'at-limit',
      outside_negative: 'outside-negative',
      outside_positive: 'outside-positive',
    }[analysis.status];

    const nextValueClass = `eed-day-balance-value eed-day-balance-${statusClass}`;
    if (valueEl.textContent !== text) {
      valueEl.textContent = text;
    }
    if (valueEl.className !== nextValueClass) {
      valueEl.className = nextValueClass;
    }

    clearStatusClasses();
    card?.classList.add(`eed-day-balance-card--${statusClass}`);

    if (consideredLabelEl) {
      consideredLabelEl.textContent = t('contentDayBalanceConsideredLabel');
    }

    if (metaEl) {
      const metaText = this.buildDayBalanceMetaLine(analysis);
      metaEl.textContent = metaText;
      metaEl.hidden = !metaText;
      metaEl.className = `eed-day-balance-meta eed-day-balance-meta--${statusClass}`;
    }

    this.setTooltipTarget(
      card || valueEl,
      this.buildDayBalanceTooltipText(analysis, loadedSettings)
    );

    this.adjustRecordsContainer(scrollContainer, true);
  },

  async updateRecordsView(force = false) {
    if (this.isUpdating || !this.isExtensionAlive()) return;

    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (!table || typeof EEDSettings === 'undefined') return;

    const settings = await EEDSettings.load();
    if (!this.isExtensionAlive()) return;

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
    if (!this.isExtensionAlive()) return;

    const recordCount = this.getRecords().length;
    this.sendRuntimeMessage({ action: 'syncBadge', recordCount });
  },

  observeRecordsTable() {
    if (!this.isExtensionAlive()) return;

    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (!table || table.dataset.eedObserved) return;

    table.dataset.eedObserved = 'true';

    const observer = new MutationObserver((mutations) => {
      if (!this.isExtensionAlive() || this.isUpdating) return;

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

    this.tableObserver = observer;
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
    if (!this.isExtensionAlive()) return;

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
    if (this.jornadaImportReady || !this.isExtensionAlive()) return;

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
    importButton.setAttribute('aria-label', t('contentJornadaImportTitle'));
    importButton.innerHTML = `
      <img src="${this.getExtensionAssetUrl('icons/easy-easy-dots.png')}" alt="" class="eed-jornada-import-icon" aria-hidden="true">
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

  HOUR_BANK_LABEL: 'Saldo no banco de horas',
  HOUR_BANK_MAX_DAYS: 90,

  findHourBankCard() {
    const enhanced = document.querySelector('[data-eed-hour-bank-enhanced="true"]');
    if (enhanced) return enhanced;

    const cards = document.querySelectorAll('.card-box--dashboard');
    for (const card of cards) {
      const label = card.querySelector('h5');
      if (label?.textContent?.includes(this.HOUR_BANK_LABEL)) {
        return card;
      }

      const style = card.getAttribute('style') || '';
      if (style.includes('#8234e8') && card.querySelector('.md-access-alarms')) {
        return card;
      }
    }

    return null;
  },

  getHourBankBalanceSeconds(flip) {
    const valueEl =
      flip.querySelector('.eed-hour-bank-front h2 b') ||
      flip.querySelector('.eed-hour-bank-front h2');
    if (!valueEl) return null;
    return this.parseSignedHHMMSSToSeconds(valueEl.textContent);
  },

  getHourBankCloseButtonHtml() {
    return `<button type="button" class="eed-hour-bank-close" aria-label="${t('contentHourBankClose')}"><span aria-hidden="true">×</span></button>`;
  },

  getHourBankBalanceVariant(balanceSeconds) {
    if (balanceSeconds < 0) return 'deficit';
    if (balanceSeconds > 0) return 'surplus';
    return 'balanced';
  },

  setHourBankBackVariant(back, variant) {
    back.classList.remove(
      'eed-hour-bank-back--deficit',
      'eed-hour-bank-back--surplus',
      'eed-hour-bank-back--balanced'
    );
    back.classList.add(`eed-hour-bank-back--${variant}`);
    back.dataset.eedBalanceVariant = variant;

    const card = back.closest('.eed-hour-bank-card');
    if (!card) return;

    card.classList.remove(
      'eed-hour-bank-state-deficit',
      'eed-hour-bank-state-surplus',
      'eed-hour-bank-state-balanced'
    );
    card.classList.add(`eed-hour-bank-state-${variant}`);
  },

  formatPositiveBalanceDisplay(balanceSeconds) {
    return `+${this.formatSecondsToHHMMSS(balanceSeconds)}`;
  },

  getHourBankSummaryText(days, extraText) {
    const count = Number(days);
    if (count === 1) return t('contentHourBankSummarySingular', [extraText]);
    return t('contentHourBankSummaryPlural', [String(count), extraText]);
  },

  formatFriendlyDuration(totalSeconds) {
    const total = Math.max(0, Math.floor(Math.abs(totalSeconds)));

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const parts = [];

    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}min`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
  },

  getHourBankForecastText(extraPerDaySeconds, days) {
    const count = Number(days);
    const duration = this.formatFriendlyDuration(extraPerDaySeconds);

    if (count === 1) {
      return t('contentHourBankForecastSingular', [duration]);
    }

    return t('contentHourBankForecastPlural', [duration, String(count)]);
  },

  renderNegativeBalancePlanner(back, flip, balanceSeconds) {
    this.setHourBankBackVariant(back, 'deficit');

    const days = parseInt(flip.dataset.eedDays, 10) || 5;
    const deficit = this.formatSecondsToHHMMSS(balanceSeconds);
    const extraPerDay = this.calculateExtraPerDay(balanceSeconds, days);
    const extraText = this.formatSecondsToHHMMSS(extraPerDay);
    const sliderId = flip.dataset.eedSliderId || `eed-hour-bank-days-${Date.now()}`;
    flip.dataset.eedSliderId = sliderId;

    back.innerHTML = `
      ${this.getHourBankCloseButtonHtml()}
      <div class="eed-hour-bank-back-content eed-hour-bank-back-deficit">
        <p class="eed-hour-bank-back-title">${t('contentHourBankPlanTitle')}</p>
        <div class="eed-hour-bank-back-row eed-hour-bank-back-deficit-row">
          <span class="eed-hour-bank-back-label">${t('contentHourBankDeficitLabel')}</span>
          <span class="eed-hour-bank-back-value">${deficit}</span>
        </div>
        <div class="eed-hour-bank-slider-wrap">
          <label class="eed-hour-bank-sr-label" for="${sliderId}">${t('contentHourBankDaysLabel')}</label>
          <input
            type="range"
            id="${sliderId}"
            class="eed-hour-bank-slider"
            min="1"
            max="${this.HOUR_BANK_MAX_DAYS}"
            value="${days}"
            aria-valuemin="1"
            aria-valuemax="${this.HOUR_BANK_MAX_DAYS}"
            aria-valuenow="${days}"
          >
        </div>
        <p class="eed-hour-bank-summary">${this.getHourBankSummaryText(days, extraText)}</p>
        <p class="eed-hour-bank-forecast">${this.getHourBankForecastText(extraPerDay, days)}</p>
      </div>
    `;
  },

  renderPositiveBalanceState(back, balanceSeconds) {
    this.setHourBankBackVariant(back, 'surplus');

    const balanceText = this.formatSecondsToHHMMSS(balanceSeconds);
    const balanceDisplay = this.formatPositiveBalanceDisplay(balanceSeconds);

    back.innerHTML = `
      ${this.getHourBankCloseButtonHtml()}
      <div class="eed-hour-bank-back-content eed-hour-bank-back-surplus">
        <span class="eed-hour-bank-status-badge">${t('contentHourBankPositiveBadge')}</span>
        <p class="eed-hour-bank-back-heading">${t('contentHourBankPositiveTitle')}</p>
        <p class="eed-hour-bank-balance-hero">${balanceDisplay}</p>
        <p class="eed-hour-bank-back-message">${t('contentHourBankPositiveMessage')}</p>
        <p class="eed-hour-bank-back-submessage">${t('contentHourBankNoCompensationNeeded')}</p>
        <p class="eed-hour-bank-available">${t('contentHourBankAvailableLabel', [balanceText])}</p>
      </div>
    `;
  },

  renderZeroBalanceState(back) {
    this.setHourBankBackVariant(back, 'balanced');

    back.innerHTML = `
      ${this.getHourBankCloseButtonHtml()}
      <div class="eed-hour-bank-back-content eed-hour-bank-back-balanced">
        <p class="eed-hour-bank-back-heading">${t('contentHourBankZeroTitle')}</p>
        <p class="eed-hour-bank-balance-hero">00:00:00</p>
        <p class="eed-hour-bank-back-message">${t('contentHourBankZeroMessage')}</p>
        <p class="eed-hour-bank-back-submessage">${t('contentHourBankNoCompensationNeeded')}</p>
      </div>
    `;
  },

  setHourBankFlipped(flip, card, flipped) {
    const inner = flip.querySelector('.eed-hour-bank-flip-inner');
    if (!inner) return;

    const wasFlipped = flip.dataset.eedFlipped === 'true';
    if (wasFlipped === flipped) return;

    flip.dataset.eedFlipped = flipped ? 'true' : 'false';
    inner.classList.toggle('eed-hour-bank-flipped', flipped);
    card.classList.toggle('eed-hour-bank-is-flipped', flipped);
    card.setAttribute('aria-expanded', flipped ? 'true' : 'false');

    if (flipped) {
      const back = flip.querySelector('.eed-hour-bank-back');
      this.renderHourBankBack(back, flip);
      if (this.getHourBankBalanceSeconds(flip) < 0) {
        this.bindHourBankSlider(flip);
      }
      window.setTimeout(() => {
        if (flip.dataset.eedFlipped === 'true') {
          document.addEventListener('click', flip._eedHourBankOutsideClick, true);
        }
      }, 0);
      return;
    }

    document.removeEventListener('click', flip._eedHourBankOutsideClick, true);
    card.classList.remove(
      'eed-hour-bank-state-deficit',
      'eed-hour-bank-state-surplus',
      'eed-hour-bank-state-balanced'
    );
  },

  renderHourBankBack(back, flip) {
    if (!back) return;

    const balanceSeconds = this.getHourBankBalanceSeconds(flip);

    if (balanceSeconds === null || !Number.isFinite(balanceSeconds)) {
      console.warn(
        '[Better Easy Dots] Saldo inválido para planejador:',
        flip.querySelector('.eed-hour-bank-front h2')?.textContent
      );
      return;
    }

    if (balanceSeconds < 0) {
      this.renderNegativeBalancePlanner(back, flip, balanceSeconds);
      return;
    }

    if (balanceSeconds > 0) {
      this.renderPositiveBalanceState(back, balanceSeconds);
      return;
    }

    this.renderZeroBalanceState(back);
  },

  updateHourBankBackValues(flip) {
    const back = flip.querySelector('.eed-hour-bank-back');
    if (!back) return;

    const balanceSeconds = this.getHourBankBalanceSeconds(flip);
    if (balanceSeconds === null || !Number.isFinite(balanceSeconds)) return;

    const nextVariant = this.getHourBankBalanceVariant(balanceSeconds);
    if (back.dataset.eedBalanceVariant !== nextVariant) {
      this.renderHourBankBack(back, flip);
      if (balanceSeconds < 0) {
        this.bindHourBankSlider(flip);
      }
      return;
    }

    if (balanceSeconds >= 0) return;

    const days = parseInt(flip.dataset.eedDays, 10) || 5;
    const deficit = this.formatSecondsToHHMMSS(balanceSeconds);
    const extraPerDay = this.calculateExtraPerDay(balanceSeconds, days);
    const extraText = this.formatSecondsToHHMMSS(extraPerDay);

    const deficitEl = back.querySelector('.eed-hour-bank-back-value');
    const summaryEl = back.querySelector('.eed-hour-bank-summary');
    const forecastEl = back.querySelector('.eed-hour-bank-forecast');
    const slider = back.querySelector('.eed-hour-bank-slider');

    if (deficitEl) deficitEl.textContent = deficit;
    if (summaryEl) summaryEl.textContent = this.getHourBankSummaryText(days, extraText);
    if (forecastEl) forecastEl.textContent = this.getHourBankForecastText(extraPerDay, days);
    if (slider) {
      slider.value = String(days);
      slider.setAttribute('aria-valuenow', String(days));
    }
  },

  updateHourBankSliderDisplay(flip, slider) {
    const back = flip.querySelector('.eed-hour-bank-back');
    if (!back) return;

    const balanceSeconds = this.getHourBankBalanceSeconds(flip);
    if (balanceSeconds === null || !Number.isFinite(balanceSeconds) || balanceSeconds >= 0) return;

    const days = Number(slider.value);
    if (!Number.isFinite(days) || days <= 0) return;

    flip.dataset.eedDays = String(days);
    const extraPerDay = this.calculateExtraPerDay(balanceSeconds, days);
    const extraText = this.formatSecondsToHHMMSS(extraPerDay);

    const summaryEl = back.querySelector('.eed-hour-bank-summary');
    const forecastEl = back.querySelector('.eed-hour-bank-forecast');

    if (summaryEl) summaryEl.textContent = this.getHourBankSummaryText(days, extraText);
    if (forecastEl) forecastEl.textContent = this.getHourBankForecastText(extraPerDay, days);
    slider.setAttribute('aria-valuenow', String(days));
  },

  bindHourBankSlider(flip) {
    const slider = flip.querySelector('.eed-hour-bank-slider');
    if (!slider || slider.dataset.eedBound) return;

    slider.dataset.eedBound = 'true';
    slider.addEventListener('input', (event) => {
      event.stopPropagation();
      this.updateHourBankSliderDisplay(flip, slider);
    });
    slider.addEventListener('click', (event) => event.stopPropagation());
    slider.addEventListener('mousedown', (event) => event.stopPropagation());
    slider.addEventListener('pointerdown', (event) => event.stopPropagation());
  },

  bindHourBankEvents(flip, card) {
    if (card.dataset.eedEventsBound) return;
    card.dataset.eedEventsBound = 'true';

    flip._eedHourBankOutsideClick = (event) => {
      if (flip.dataset.eedFlipped !== 'true') return;
      if (card.contains(event.target)) return;
      this.setHourBankFlipped(flip, card, false);
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('.eed-hour-bank-close')) {
        event.stopPropagation();
        this.setHourBankFlipped(flip, card, false);
        return;
      }

      if (flip.dataset.eedFlipped === 'true') return;

      if (event.target.closest('.eed-hour-bank-slider, .eed-hour-bank-sr-label')) return;

      this.setHourBankFlipped(flip, card, true);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && flip.dataset.eedFlipped === 'true') {
        event.preventDefault();
        this.setHourBankFlipped(flip, card, false);
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (flip.dataset.eedFlipped === 'true') return;
      if (event.target.closest('.eed-hour-bank-slider')) return;

      event.preventDefault();
      this.setHourBankFlipped(flip, card, true);
    });
  },

  observeHourBankBalance(flip) {
    if (flip.dataset.eedBalanceObserved === 'true') return;

    const valueEl =
      flip.querySelector('.eed-hour-bank-front h2 b') ||
      flip.querySelector('.eed-hour-bank-front h2');
    if (!valueEl) return;

    flip.dataset.eedBalanceObserved = 'true';
    let lastText = valueEl.textContent;

    const observer = new MutationObserver(() => {
      if (!this.isExtensionAlive()) return;
      if (flip.dataset.eedFlipped !== 'true') return;

      const nextText = valueEl.textContent;
      if (nextText === lastText) return;
      lastText = nextText;

      try {
        this.updateHourBankBackValues(flip);
      } catch (error) {
        if (this.isContextInvalidatedError(error)) {
          this.markExtensionDead();
          return;
        }
        console.warn('[Better Easy Dots] Erro ao atualizar planejador:', error);
      }
    });

    this.hourBankObservers.push(observer);
    observer.observe(valueEl, { characterData: true, subtree: true, childList: true });
  },

  isContextInvalidatedError(error) {
    const message = String(error?.message || error || '');
    return message.includes('Extension context invalidated');
  },

  initBalanceCardPlanner() {
    if (!this.isExtensionAlive()) return;

    try {
      const card = this.findHourBankCard();
      if (!card) return;

      if (card.dataset.eedPlannerInitialized === 'true') return;

      const barWidget = card.querySelector('.bar-widget');
      if (!barWidget) return;

      card.dataset.eedPlannerInitialized = 'true';
      card.dataset.eedHourBankEnhanced = 'true';
      card.classList.add('eed-hour-bank-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', t('contentHourBankFlipAriaLabel'));
      card.setAttribute('aria-expanded', 'false');

      const flip = document.createElement('div');
      flip.className = 'eed-hour-bank-flip';
      flip.dataset.eedFlipped = 'false';
      flip.dataset.eedDays = '5';

      flip.innerHTML = `
        <div class="eed-hour-bank-flip-inner">
          <div class="eed-hour-bank-face eed-hour-bank-front"></div>
          <div class="eed-hour-bank-face eed-hour-bank-back"></div>
        </div>
      `;

      const front = flip.querySelector('.eed-hour-bank-front');

      front.appendChild(barWidget);

      const hint = document.createElement('span');
      hint.className = 'eed-hour-bank-hover-hint';
      hint.textContent = t('contentHourBankHoverHint');
      hint.setAttribute('aria-hidden', 'true');
      front.appendChild(hint);

      card.appendChild(flip);
      this.bindHourBankEvents(flip, card);
      this.observeHourBankBalance(flip);
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        this.markExtensionDead();
        return;
      }
      console.warn('[Better Easy Dots] Erro ao inicializar planejador:', error);
    }
  },

  ensureHourBankCard() {
    if (!this.isExtensionAlive()) return;
    this.initBalanceCardPlanner();
  },

  injectSidebarSettingsItem() {
    if (!this.isExtensionAlive()) return;

    this.removeLegacyNavbarItem();

    if (document.querySelector(this.SELECTORS.settingsMenuItem)) return;

    const menuList = document.querySelector(this.SELECTORS.sidebarMenu);
    if (!menuList) return;

    const iconUrl = this.getExtensionAssetUrl('icons/easy-easy-dots.png');
    if (!iconUrl) return;

    const li = document.createElement('li');
    li.id = 'eed-sidebar-settings';
    li.innerHTML = `
      <a href="#" class="waves-effect eed-sidebar-settings-link" aria-label="${t('contentSidebarSettingsTitle')}">
        <span class="eed-sidebar-settings-main">
          <img src="${iconUrl}" alt="" class="eed-sidebar-settings-icon" aria-hidden="true">
          <span class="eed-sidebar-settings-label">${t('contentSidebarSettingsLabel')}</span>
        </span>
        ${EXTERNAL_LINK_ICON_SVG}
      </a>
    `;

    li.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      this.sendRuntimeMessage({ action: 'openSettings' });
    });

    menuList.appendChild(li);

    const settingsLink = li.querySelector('a.waves-effect');
    if (settingsLink && typeof Waves !== 'undefined' && typeof Waves.attach === 'function') {
      Waves.attach(settingsLink);
    }
  },
};

function mutationOriginatesFromHourBankCard(mutation) {
  const target = mutation.target;
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return Boolean(element?.closest?.('.eed-hour-bank-card'));
}

function init() {
  if (!EASydots.isExtensionAlive()) return;

  EEDSettings.rememberSiteUrl(window.location.href).catch(() => {});

  try {
    EASydots.injectSidebarSettingsItem();
    EASydots.ensureRegisterButton();
    EASydots.observeRecordsTable();
    EASydots.ensureJornadaImport();
    EASydots.ensureHourBankCard();
  } catch (error) {
    if (EASydots.isContextInvalidatedError(error)) {
      EASydots.markExtensionDead();
      return;
    }
    throw error;
  }

  const observer = new MutationObserver((mutations) => {
    try {
      if (!EASydots.isExtensionAlive()) return;

      EASydots.injectSidebarSettingsItem();
      EASydots.ensureRegisterButton();
      EASydots.observeRecordsTable();

      const hasExternalMutation = mutations.some(
        (mutation) => !mutationOriginatesFromHourBankCard(mutation)
      );
      if (hasExternalMutation) {
        EASydots.ensureHourBankCard();
      }

      if (
        !EASydots.jornadaImportReady &&
        document.querySelector(EASydots.SELECTORS.jornadaInput) &&
        !document.querySelector(EASydots.SELECTORS.jornadaImport)
      ) {
        EASydots.ensureJornadaImport();
      }
    } catch (error) {
      if (EASydots.isContextInvalidatedError(error)) {
        EASydots.markExtensionDead();
      }
    }
  });

  EASydots.pageObserver = observer;
  observer.observe(document.body, { childList: true, subtree: true });
  EASydots.syncBadge();
}

try {
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (!EASydots.isExtensionAlive()) return;

        if (area === 'local' && changes['eed-settings']) {
          EASydots.cachedSettings = null;
          EASydots.lastViewState = '';
          EASydots.scheduleUpdateRecordsView(true);
          EASydots.scheduleJornadaImportSync();
        }
      } catch (error) {
        if (EASydots.isContextInvalidatedError(error)) {
          EASydots.markExtensionDead();
        }
      }
    });
  }
} catch {
  /* Extension context may already be invalidated */
}

init();
