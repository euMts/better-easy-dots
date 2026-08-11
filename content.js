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

  EED_DEBUG: false,
  isUpdating: false,
  updateTimer: null,
  enhanceTimer: null,
  phase2Timer: null,
  phase3Timer: null,
  cachedSettings: null,
  lastViewState: '',
  jornadaImportBusy: false,
  jornadaFeedbackTimeout: null,
  jornadaImportReady: false,
  jornadaSyncTimer: null,
  pageObserver: null,
  pageObserverRoot: null,
  tableObserver: null,
  hourBankObservers: [],
  extensionDead: false,
  initOnceDone: false,
  ENHANCE_DEBOUNCE_MS: 150,
  UPDATE_DEBOUNCE_MS: 150,
  SIM_SAVE_DEBOUNCE_MS: 1000,
  SIMULATOR_STORAGE_KEY: 'eedSimulatorValues',
  SIMULATOR_TIME_FIELDS: ['entrada', 'intervaloInicio', 'intervaloFim', 'saida'],
  simSaveTimer: null,

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

  debugLog(...args) {
    if (this.isDebugEnabled()) console.log('[Better Easy Dots]', ...args);
  },

  isDebugEnabled() {
    if (this.EED_DEBUG) return true;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('eedDebug') === '1') {
        return true;
      }
    } catch {
      /* private mode / blocked storage */
    }
    try {
      return new URLSearchParams(window.location.search).get('eedDebug') === '1';
    } catch {
      return false;
    }
  },

  warnFeature(name, error) {
    if (this.isContextInvalidatedError(error)) {
      this.markExtensionDead();
      return;
    }
    console.warn(`[Better Easy Dots] Erro em ${name}:`, error);
  },

  runIdle(callback, timeout = 1500) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(callback, { timeout });
    }
    return window.setTimeout(callback, 250);
  },

  cancelIdle(handle) {
    if (handle == null) return;
    if (typeof window.cancelIdleCallback === 'function') {
      try {
        window.cancelIdleCallback(handle);
        return;
      } catch {
        /* fall through to clearTimeout */
      }
    }
    clearTimeout(handle);
  },

  markExtensionDead() {
    if (this.extensionDead) return;
    this.extensionDead = true;

    clearTimeout(this.updateTimer);
    clearTimeout(this.enhanceTimer);
    clearTimeout(this.phase2Timer);
    clearTimeout(this.jornadaSyncTimer);
    clearTimeout(this.jornadaFeedbackTimeout);
    clearTimeout(this.simSaveTimer);
    clearTimeout(this.pendingImpactTimer);
    this.cancelIdle(this.phase3Timer);
    this.updateTimer = null;
    this.enhanceTimer = null;
    this.phase2Timer = null;
    this.phase3Timer = null;
    this.jornadaSyncTimer = null;
    this.jornadaFeedbackTimeout = null;
    this.simSaveTimer = null;
    this.pendingImpactTimer = null;
    this.pendingImpactRunId = (this.pendingImpactRunId || 0) + 1;

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
    this.pageObserverRoot = null;
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
    const overtimeView = this.buildDayBalanceOvertimeStartView(records, settings, analysis);
    return this.buildDayBalanceTooltipText(analysis, settings, overtimeView);
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
    if (totalSeconds === 0) return '00:00:00';
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

  getDayBalanceEstimatedBankSeconds(analysis) {
    if (!analysis || !Number.isFinite(analysis.considered)) return null;
    const currentBankSeconds = this.getCurrentHourBankBalanceSeconds();
    return this.calculateProjectedTimeBank(currentBankSeconds, analysis.considered);
  },

  buildDayBalanceAfterDayCompactLabel(estimatedBankSeconds) {
    if (!Number.isFinite(estimatedBankSeconds)) return '';
    return t('contentDayBalanceAfterDayCompact', [
      this.formatSignedBalanceText(estimatedBankSeconds),
    ]);
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

    const afterDay = this.buildDayBalanceAfterDayCompactLabel(
      this.getDayBalanceEstimatedBankSeconds(analysis)
    );
    if (afterDay) {
      parts.push(afterDay);
    }

    return parts.join(' · ');
  },

  /**
   * Reference final-exit clock time used to project when valid overtime would start.
   * Incomplete days use the configured exit (same as balance projection); complete days use the last punch.
   */
  getDayBalanceOvertimeReferenceExitSeconds(records, settings, analysis) {
    if (analysis?.complete) {
      const last = records?.[records.length - 1];
      if (last && this.isSaida(last.type)) {
        return this.timeToSeconds(last.time);
      }
    }

    return this.timeToSeconds(settings.saida);
  },

  buildDayBalanceOvertimeStartView(records, settings, analysis) {
    if (!analysis || !settings) return null;

    return this.buildOvertimeStartLabel(
      analysis.rawProjected,
      analysis.toleranceSeconds,
      this.getDayBalanceOvertimeReferenceExitSeconds(records, settings, analysis)
    );
  },

  ensureDayBalanceOvertimeStartEl(balanceRow) {
    let overtimeEl = balanceRow?.querySelector('.eed-day-balance-overtime-start');
    if (overtimeEl) return overtimeEl;

    const left = balanceRow?.querySelector('.eed-day-balance-left');
    if (!left) return null;

    overtimeEl = document.createElement('div');
    overtimeEl.className = 'eed-day-balance-overtime-start';
    overtimeEl.hidden = true;
    left.appendChild(overtimeEl);
    return overtimeEl;
  },

  updateDayBalanceOvertimeStartLabel(overtimeEl, overtimeView) {
    if (!overtimeEl) return;

    if (!overtimeView) {
      overtimeEl.hidden = true;
      overtimeEl.textContent = '';
      overtimeEl.classList.remove('eed-day-balance-overtime-start--counting');
      this.setTooltipTarget(overtimeEl, null);
      return;
    }

    overtimeEl.hidden = false;
    overtimeEl.textContent = overtimeView.text;
    overtimeEl.classList.toggle(
      'eed-day-balance-overtime-start--counting',
      overtimeView.alreadyCounting
    );
    this.setTooltipTarget(overtimeEl, overtimeView.tooltip);
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

  buildDayBalanceTooltipText(analysis, settings, overtimeView = null) {
    const parts = [t('contentDayBalanceTooltipExplain')];

    const meta = this.buildDayBalanceMetaLine(analysis);
    if (meta) {
      parts.push(meta);
    }

    if (overtimeView?.text) {
      parts.push(overtimeView.text);
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

    const estimatedBankSeconds = this.getDayBalanceEstimatedBankSeconds(analysis);
    if (Number.isFinite(estimatedBankSeconds)) {
      parts.push(t('contentDayBalanceAfterDayTooltipExplain'));
      parts.push(
        t('contentDayBalanceAfterDayTooltip', [
          this.formatSignedBalanceText(estimatedBankSeconds),
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
      this.updateTimer = null;
      this.updateRecordsView(force);
    }, this.UPDATE_DEBOUNCE_MS);
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
    if (!headerRow) return;

    const existing = headerRow.querySelector('.eed-diff-header');
    if (existing) {
      existing.textContent = t('contentDiffColumnHeader');
      return;
    }

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

  installSimulatorTooltips(card) {
    if (!card || card.dataset.eedSimTooltipsReady === 'true') return;
    card.dataset.eedSimTooltipsReady = 'true';

    card.addEventListener('mouseover', (event) => {
      const target = event.target.closest('[data-eed-tooltip]');
      if (!target || !card.contains(target)) return;
      this.showDiffTooltip(target);
    });

    card.addEventListener('mouseout', (event) => {
      const target = event.target.closest('[data-eed-tooltip]');
      if (!target) return;

      const related = event.relatedTarget;
      if (related && target.contains(related)) return;

      if (this.diffTooltipAnchor === target) {
        this.hideDiffTooltip();
      }
    });
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
    try {
      this.ensureDiffColumnHeader(table);
      this.installDiffTooltips(table);
    } catch (error) {
      this.warnFeature('diff/tooltips', error);
      if (!this.isExtensionAlive()) return;
    }

    const rows = table.querySelectorAll('tr');
    const balanceRow = table.querySelector('#eed-day-balance-row');
    balanceRow?.querySelector('.eed-day-balance-wrap')?.setAttribute('colspan', '5');

    if (!EEDSettings.isScheduleConfigured(settings)) {
      try {
        rows.forEach((row) => {
          if (row.id === 'eed-day-balance-row' || row.classList.contains('eed-suggestion-row')) return;
          const timeCell = row.querySelectorAll('td')[3];
          timeCell?.classList.remove(...this.TIME_STATUS_CLASSES);
          const diffCell = this.ensureDiffCell(row);
          if (diffCell) this.clearDiffCell(diffCell);
        });
        this.clearSuggestionRows(table);
      } catch (error) {
        this.warnFeature('cores (sem jornada)', error);
      }

      try {
        await this.renderDayBalance(settings, table);
      } catch (error) {
        this.warnFeature('saldo do dia', error);
      }
      return;
    }

    const records = this.getRecords();

    try {
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
    } catch (error) {
      this.warnFeature('cores dos registros', error);
      if (!this.isExtensionAlive()) return;
    }

    try {
      this.renderSuggestionRows(settings, table, records);
    } catch (error) {
      this.warnFeature('sugestões de saída', error);
    }

    try {
      await this.renderDayBalance(settings, table);
    } catch (error) {
      this.warnFeature('saldo do dia', error);
    }
  },

  adjustRecordsContainer(scrollContainer, hasBalance) {
    if (!scrollContainer) return;

    if (!scrollContainer.dataset.eedOriginalHeight) {
      scrollContainer.dataset.eedOriginalHeight = scrollContainer.style.height || '';
      scrollContainer.dataset.eedOriginalOverflow = scrollContainer.style.overflow || '';
      scrollContainer.dataset.eedOriginalOverflowX = scrollContainer.style.overflowX || '';
      scrollContainer.dataset.eedOriginalOverflowY = scrollContainer.style.overflowY || '';
    }

    if (hasBalance) {
      scrollContainer.style.height = 'auto';
      scrollContainer.style.minHeight = scrollContainer.dataset.eedOriginalHeight || '13em';
      // Grow vertically for the balance card, but keep horizontal scroll when needed
      scrollContainer.style.overflow = 'auto';
      scrollContainer.style.overflowX = 'auto';
      scrollContainer.style.overflowY = 'auto';
      scrollContainer.classList.add('eed-records-scroll');
      return;
    }

    scrollContainer.classList.remove('eed-records-scroll');
    scrollContainer.style.height = scrollContainer.dataset.eedOriginalHeight;
    scrollContainer.style.minHeight = '';
    scrollContainer.style.overflow = scrollContainer.dataset.eedOriginalOverflow || '';
    scrollContainer.style.overflowX = scrollContainer.dataset.eedOriginalOverflowX || '';
    scrollContainer.style.overflowY = scrollContainer.dataset.eedOriginalOverflowY || '';
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
              <div class="eed-day-balance-overtime-start" hidden></div>
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
    const overtimeEl = this.ensureDayBalanceOvertimeStartEl(balanceRow);
    const titleEl = balanceRow.querySelector('.eed-day-balance-title');
    const creditBtn = balanceRow.querySelector('.eed-day-balance-credit');

    if (titleEl) {
      titleEl.textContent = t('contentDayBalanceLabel');
    }

    if (creditBtn) {
      const icon = creditBtn.querySelector('img');
      creditBtn.replaceChildren();
      if (icon) creditBtn.appendChild(icon);
      creditBtn.append(document.createTextNode(t('contentCreditByline')));
    }

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
      this.updateDayBalanceOvertimeStartLabel(overtimeEl, null);
      this.renderScheduleHint(valueEl);
      this.setTooltipTarget(card || valueEl, t('contentDayBalanceTooltipNotConfigured'));

      this.adjustRecordsContainer(scrollContainer, true);
      return;
    }

    delete valueEl.dataset.eedScheduleHint;

    const analysis = this.buildDayBalanceAnalysis(records, loadedSettings);
    const overtimeView = this.buildDayBalanceOvertimeStartView(
      records,
      loadedSettings,
      analysis
    );
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

    this.updateDayBalanceOvertimeStartLabel(overtimeEl, overtimeView);

    this.setTooltipTarget(
      card || valueEl,
      this.buildDayBalanceTooltipText(analysis, loadedSettings, overtimeView)
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
    importButton.dataset.eedListenerAttached = 'true';
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

  getCurrentHourBankBalanceSeconds() {
    try {
      const card = this.findHourBankCard();
      if (!card) return null;

      const valueEl =
        card.querySelector('.eed-hour-bank-front h2 b') ||
        card.querySelector('.eed-hour-bank-front h2') ||
        card.querySelector('.bar-widget h2 b') ||
        card.querySelector('h2 b') ||
        card.querySelector('h2');

      if (!valueEl) return null;
      return this.parseSignedHHMMSSToSeconds(valueEl.textContent);
    } catch (error) {
      this.warnFeature('leitura do banco de horas', error);
      return null;
    }
  },

  calculateProjectedTimeBank(currentBankSeconds, simulatedAfterToleranceSeconds) {
    if (!Number.isFinite(currentBankSeconds) || !Number.isFinite(simulatedAfterToleranceSeconds)) {
      return null;
    }
    return currentBankSeconds + simulatedAfterToleranceSeconds;
  },

  buildTimeBankProjectionView(currentBankSeconds, simulatedAfterToleranceSeconds) {
    if (!Number.isFinite(currentBankSeconds) || !Number.isFinite(simulatedAfterToleranceSeconds)) {
      return {
        visible: true,
        missing: true,
        line: t('contentSimBankNotFound'),
        tone: 'missing',
        tooltip: t('contentSimBankNotFound'),
      };
    }

    const projected = this.calculateProjectedTimeBank(
      currentBankSeconds,
      simulatedAfterToleranceSeconds
    );
    const projectedText = this.formatSignedBalanceText(projected);
    const impactAbsText = this.formatSecondsToHHMMSS(
      Math.abs(simulatedAfterToleranceSeconds)
    );
    const afterAbsFriendly = this.formatFriendlyDuration(
      Math.abs(simulatedAfterToleranceSeconds)
    );
    const projectedAbsFriendly = this.formatFriendlyDuration(Math.abs(projected));

    if (simulatedAfterToleranceSeconds === 0) {
      return {
        visible: true,
        missing: false,
        line: t('contentSimBankCompactLine', [
          projectedText,
          t('contentSimBankNoChange'),
        ]),
        tone: 'unchanged',
        tooltip: t('contentSimBankTooltipNoEffect'),
      };
    }

    if (simulatedAfterToleranceSeconds < 0) {
      return {
        visible: true,
        missing: false,
        line: t('contentSimBankCompactLine', [
          projectedText,
          t('contentSimBankDetailIncrease', [impactAbsText]),
        ]),
        tone: 'worse',
        tooltip: t('contentSimBankTooltipIncreasesDebt', [afterAbsFriendly]),
      };
    }

    // Positive after-tolerance: reduces debt or increases surplus
    let tooltip;
    let tone = 'better';

    if (currentBankSeconds < 0) {
      if (projected < 0) {
        tooltip = t('contentSimBankTooltipPartialPay', [
          afterAbsFriendly,
          projectedAbsFriendly,
        ]);
      } else if (projected === 0) {
        tone = 'balanced';
        tooltip = t('contentSimBankTooltipClearsDebt', [afterAbsFriendly]);
      } else {
        tone = 'surplus';
        tooltip = t('contentSimBankTooltipTurnsPositive', [projectedAbsFriendly]);
      }
    } else {
      tone = 'surplus';
      tooltip = t('contentSimBankTooltipStaysPositive', [projectedAbsFriendly]);
    }

    return {
      visible: true,
      missing: false,
      line: t('contentSimBankCompactLine', [
        projectedText,
        t('contentSimBankDetailReduce', [impactAbsText]),
      ]),
      tone,
      tooltip,
    };
  },

  updateSimulatorBankProjection(back, analysis) {
    const bankEl = back.querySelector('.eed-sim-bank');
    if (!bankEl) return;

    const lineEl = bankEl.querySelector('.eed-sim-bank-line');

    if (!analysis) {
      bankEl.hidden = true;
      bankEl.className = 'eed-sim-bank';
      this.setTooltipTarget(bankEl, null);
      return;
    }

    try {
      const currentBankSeconds = this.getCurrentHourBankBalanceSeconds();
      const view = this.buildTimeBankProjectionView(
        currentBankSeconds,
        analysis.afterTolerance
      );

      bankEl.hidden = !view.visible;
      bankEl.className = `eed-sim-bank eed-sim-bank--${view.tone}`;
      if (lineEl) lineEl.textContent = view.line || '';
      this.setTooltipTarget(bankEl, view.tooltip);
    } catch (error) {
      this.warnFeature('projeção do banco', error);
      bankEl.hidden = true;
      this.setTooltipTarget(bankEl, null);
    }
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

  mountCardFrontActionHint(barWidget, className, text) {
    if (!barWidget) return null;

    const existing = barWidget.querySelector(`.${className}`);
    if (existing) return existing;

    const hint = document.createElement('span');
    hint.className = `eed-card-front-action-hint ${className}`;
    hint.textContent = text;
    hint.setAttribute('aria-hidden', 'true');

    // Place the badge in a row immediately above the <hr> so both cards
    // share the same visual anchor (above the horizontal rule).
    const hr = barWidget.querySelector(':scope > hr') || barWidget.querySelector('hr');
    const row = document.createElement('div');
    row.className = 'eed-front-hint-row';
    row.appendChild(hint);

    if (hr && hr.parentNode === barWidget) {
      barWidget.insertBefore(row, hr);
    } else if (hr) {
      hr.parentNode.insertBefore(row, hr);
    } else {
      barWidget.appendChild(row);
    }

    return hint;
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
      this.mountCardFrontActionHint(
        barWidget,
        'eed-hour-bank-hover-hint',
        t('contentHourBankHoverHint')
      );

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

  EMPLOYER_CARD_LABEL: 'Informações do empregador',

  findEmployerCard() {
    const enhanced = document.querySelector('[data-eed-employer-sim-enhanced="true"]');
    if (enhanced) return enhanced;

    const cards = document.querySelectorAll('.card-box--dashboard');
    for (const card of cards) {
      const labels = Array.from(card.querySelectorAll('h5, h4, .text-white'))
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase())
        .join(' | ');

      if (
        labels.includes('informações do empregador') ||
        labels.includes('informacoes do empregador') ||
        labels.includes('employer information')
      ) {
        return card;
      }

      const style = (card.getAttribute('style') || '').toLowerCase();
      if (
        (style.includes('#47c5ef') || style.includes('rgb(71, 197, 239)')) &&
        card.querySelector('.fa-building-o, .fa-building, .mdi-domain, .md-business')
      ) {
        return card;
      }
    }

    return null;
  },

  normalizeSimulatedTimeInput(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const full = text.match(/^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)$/);
    if (full) {
      return [
        String(full[1]).padStart(2, '0'),
        full[2],
        full[3],
      ].join(':');
    }

    const short = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (short) {
      return `${String(short[1]).padStart(2, '0')}:${short[2]}:00`;
    }

    return null;
  },

  getSimulatorSeedTimes(records, settings) {
    const seeds = {
      entrada: this.formatExpectedTimeForTooltip(settings.entrada),
      intervaloInicio: this.formatExpectedTimeForTooltip(settings.intervaloInicio),
      intervaloFim: this.formatExpectedTimeForTooltip(settings.intervaloFim),
      saida: this.formatExpectedTimeForTooltip(settings.saida),
    };

    if (!this.hasInterval(settings)) {
      seeds.intervaloInicio = seeds.entrada;
      seeds.intervaloFim = seeds.entrada;
    }

    const fieldByIndex = this.hasInterval(settings)
      ? ['entrada', 'intervaloInicio', 'intervaloFim', 'saida']
      : ['entrada', 'saida'];

    let index = 0;
    records.forEach((record) => {
      if (index >= fieldByIndex.length) return;

      const field = fieldByIndex[index];
      const expectsEntrada = field === 'entrada' || field === 'intervaloFim';
      const matches =
        (expectsEntrada && this.isEntrada(record.type)) ||
        (!expectsEntrada && this.isSaida(record.type));

      if (!matches) return;

      const normalized = this.normalizeSimulatedTimeInput(record.time);
      if (normalized) {
        seeds[field] = normalized;
      }
      index += 1;
    });

    return seeds;
  },

  calculateSimulatedWorkedSeconds(times, settings) {
    const entrada = this.timeToSeconds(times.entrada);
    const saida = this.timeToSeconds(times.saida);

    if (!this.hasInterval(settings)) {
      return Math.max(0, saida - entrada);
    }

    const lunchOut = this.timeToSeconds(times.intervaloInicio);
    const lunchIn = this.timeToSeconds(times.intervaloFim);
    return Math.max(0, lunchOut - entrada) + Math.max(0, saida - lunchIn);
  },

  buildSimulatorAnalysis(times, settings) {
    const expected = this.calculateExpectedDailyWork(settings);
    const worked = this.calculateSimulatedWorkedSeconds(times, settings);
    const raw = worked - expected;
    const toleranceSeconds = this.getToleranceSeconds(settings);
    const safetyMarginSeconds = this.getSafetyMarginSeconds(settings);
    const safeLimitSeconds = this.getToleranceSafeLimitSeconds(
      toleranceSeconds,
      safetyMarginSeconds
    );
    const afterTolerance = this.applyDailyTolerance(raw, toleranceSeconds);
    const status = this.classifyDailyBalanceStatus(raw, toleranceSeconds, safeLimitSeconds);
    const estimatedOvertimeSeconds = raw > toleranceSeconds ? raw : 0;

    return {
      raw,
      afterTolerance,
      status,
      estimatedOvertimeSeconds,
      toleranceSeconds,
    };
  },

  /**
   * Overtime only counts after raw balance exceeds daily tolerance (+1s past the limit).
   * Returns clock time of the simulated final exit when that threshold is reached.
   */
  calculateOvertimeStartExitTime(
    rawBalanceSeconds,
    toleranceSeconds,
    simulatedFinalExitSeconds
  ) {
    if (
      !Number.isFinite(rawBalanceSeconds) ||
      !Number.isFinite(toleranceSeconds) ||
      !Number.isFinite(simulatedFinalExitSeconds)
    ) {
      return null;
    }

    if (rawBalanceSeconds > toleranceSeconds) {
      return { alreadyCounting: true, exitSeconds: null, exitTime: null };
    }

    const secondsToStartOvertime = toleranceSeconds - rawBalanceSeconds + 1;
    const overtimeStartExitSeconds = simulatedFinalExitSeconds + secondsToStartOvertime;

    return {
      alreadyCounting: false,
      exitSeconds: overtimeStartExitSeconds,
      exitTime: this.secondsToTimeString(overtimeStartExitSeconds),
    };
  },

  buildOvertimeStartLabel(rawBalanceSeconds, toleranceSeconds, simulatedFinalExitSeconds) {
    const start = this.calculateOvertimeStartExitTime(
      rawBalanceSeconds,
      toleranceSeconds,
      simulatedFinalExitSeconds
    );
    if (!start) return null;

    const toleranceFriendly = this.formatFriendlyDuration(toleranceSeconds);

    if (start.alreadyCounting) {
      return {
        text: t('contentSimOvertimeAlreadyCounting'),
        shortText: t('contentSimOvertimeAlreadyCounting'),
        tooltip: t('contentSimOvertimeAlreadyCountingTooltip', [toleranceFriendly]),
        alreadyCounting: true,
      };
    }

    const exitTime = start.exitTime;
    return {
      text: t('contentSimOvertimeStartsAfter', [exitTime]),
      shortText: t('contentSimOvertimeStartsAfterShort', [exitTime]),
      tooltip: t('contentSimOvertimeStartsAfterTooltip', [toleranceFriendly, exitTime]),
      alreadyCounting: false,
      exitTime,
    };
  },

  readSimulatorTimesFromBack(back) {
    const times = {};

    for (const field of this.SIMULATOR_TIME_FIELDS) {
      const input = back.querySelector(`[data-eed-sim-field="${field}"]`);
      const normalized = this.normalizeSimulatedTimeInput(input?.value);
      if (!normalized) return null;
      times[field] = normalized;
    }

    return times;
  },

  getSimulatorLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  getAutomaticSimulatorValues(records, settings) {
    return this.getSimulatorSeedTimes(records, settings);
  },

  getCurrentSimulatorValues(back) {
    const automatic = back?._eedAutomaticSimulatorValues || {};
    const times = {};
    let allValid = true;

    for (const field of this.SIMULATOR_TIME_FIELDS) {
      const input = back?.querySelector(`[data-eed-sim-field="${field}"]`);
      const normalized = this.normalizeSimulatedTimeInput(input?.value);
      if (normalized) {
        times[field] = normalized;
        continue;
      }

      allValid = false;
      const lastValid = this.normalizeSimulatedTimeInput(input?.dataset?.eedLastValid);
      times[field] = lastValid || automatic[field] || null;
    }

    return { times, allValid };
  },

  loadSavedSimulatorValues() {
    try {
      const raw = localStorage.getItem(this.SIMULATOR_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const date = typeof parsed.date === 'string' ? parsed.date : null;
      if (!date || date !== this.getSimulatorLocalDateKey()) return null;

      const source =
        parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed;
      const values = {};

      for (const field of this.SIMULATOR_TIME_FIELDS) {
        const normalized = this.normalizeSimulatedTimeInput(source[field]);
        if (normalized) values[field] = normalized;
      }

      return Object.keys(values).length > 0 ? values : null;
    } catch {
      return null;
    }
  },

  saveSimulatorValues(values) {
    if (!values) return false;

    const normalizedValues = {};
    for (const field of this.SIMULATOR_TIME_FIELDS) {
      const normalized = this.normalizeSimulatedTimeInput(values[field]);
      if (!normalized) return false;
      normalizedValues[field] = normalized;
    }

    try {
      localStorage.setItem(
        this.SIMULATOR_STORAGE_KEY,
        JSON.stringify({
          date: this.getSimulatorLocalDateKey(),
          values: normalizedValues,
          updatedAt: new Date().toISOString(),
        })
      );
      return true;
    } catch {
      return false;
    }
  },

  clearSavedSimulatorValues() {
    clearTimeout(this.simSaveTimer);
    this.simSaveTimer = null;

    try {
      localStorage.removeItem(this.SIMULATOR_STORAGE_KEY);
    } catch {
      /* ignore quota / privacy mode */
    }
  },

  scheduleSaveSimulatorValues(back) {
    clearTimeout(this.simSaveTimer);
    this.simSaveTimer = window.setTimeout(() => {
      this.simSaveTimer = null;
      this.flushSaveSimulatorValues(back);
    }, this.SIM_SAVE_DEBOUNCE_MS);
  },

  flushSaveSimulatorValues(back) {
    clearTimeout(this.simSaveTimer);
    this.simSaveTimer = null;
    if (!back) return;

    const current = this.readSimulatorTimesFromBack(back);
    if (!current) return;

    const automatic = back._eedAutomaticSimulatorValues;
    if (automatic && !this.hasManualSimulatorValues(current, automatic)) {
      this.clearSavedSimulatorValues();
      return;
    }

    this.saveSimulatorValues(current);
  },

  hasManualSimulatorValues(currentValues, automaticValues) {
    if (!currentValues || !automaticValues) return false;

    return this.SIMULATOR_TIME_FIELDS.some((field) => {
      const current = this.normalizeSimulatedTimeInput(currentValues[field]);
      const automatic = this.normalizeSimulatedTimeInput(automaticValues[field]);
      return Boolean(current && automatic && current !== automatic);
    });
  },

  mergeSavedIntoSimulatorValues(automaticValues, savedValues) {
    const merged = { ...automaticValues };
    if (!savedValues) return merged;

    for (const field of this.SIMULATOR_TIME_FIELDS) {
      const normalized = this.normalizeSimulatedTimeInput(savedValues[field]);
      if (normalized) merged[field] = normalized;
    }

    return merged;
  },

  applySimulatorTimesToBack(back, times) {
    if (!back || !times) return;

    for (const field of this.SIMULATOR_TIME_FIELDS) {
      const input = back.querySelector(`[data-eed-sim-field="${field}"]`);
      if (!input) continue;

      const normalized = this.normalizeSimulatedTimeInput(times[field]);
      if (!normalized) continue;

      input.value = normalized;
      input.dataset.eedLastValid = normalized;
    }
  },

  updateSimulatorResetButtonVisibility(back) {
    const button = back?.querySelector('.eed-sim-reset-button');
    if (!button) return;

    const automatic = back._eedAutomaticSimulatorValues;
    const { times } = this.getCurrentSimulatorValues(back);
    const show = this.hasManualSimulatorValues(times, automatic);
    button.hidden = !show;
  },

  restoreAutomaticSimulatorValues(back, settings) {
    if (!back) return;

    const automatic = back._eedAutomaticSimulatorValues;
    if (!automatic) return;

    this.clearSavedSimulatorValues();
    this.applySimulatorTimesToBack(back, automatic);
    this.updateSimulatorResult(back, settings);
    this.updateSimulatorResetButtonVisibility(back);
  },

  getEmployerSimResetButtonHtml() {
    const label = t('contentSimResetAutomatic');
    return `<button type="button" class="eed-sim-reset-button" hidden aria-label="${label}" data-eed-tooltip="${label}"><svg class="eed-sim-reset-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>`;
  },

  getSimulatorResultView(analysis) {
    const rawText = this.formatSignedBalanceText(analysis.raw);
    const afterText = this.formatSignedBalanceText(analysis.afterTolerance);
    const friendlyRaw = this.formatFriendlyDuration(Math.abs(analysis.raw));
    const after = analysis.afterTolerance;

    // Title and primary value follow after-tolerance impact, not raw balance.
    if (after === 0) {
      let tooltip = t('contentSimTooltipBalanced');
      if (analysis.raw > 0) {
        tooltip = t('contentSimTooltipWithinPositive', [friendlyRaw, afterText]);
      } else if (analysis.raw < 0) {
        tooltip = t('contentSimTooltipWithinNegative', [friendlyRaw, afterText]);
      }

      return {
        label: t('contentSimStatusWithin'),
        value: afterText,
        meta: analysis.raw === 0 ? '' : t('contentSimMetaRawOnly', [rawText]),
        consequence: t('contentSimConsequenceNoBankChange'),
        tone: 'within',
        tooltip,
      };
    }

    if (after > 0) {
      return {
        label: t('contentSimOvertimeToday'),
        value: afterText,
        // Bank + overtime-start cover the secondary detail; keep primary uncluttered.
        meta: '',
        consequence: '',
        tone: 'overtime',
        tooltip: t('contentSimTooltipOutsidePositive', [friendlyRaw]),
      };
    }

    return {
      label: t('contentSimStatusMissing'),
      value: afterText,
      meta: '',
      consequence: t('contentSimConsequenceMayDeduct'),
      tone: 'missing',
      tooltip: t('contentSimTooltipOutsideNegative', [friendlyRaw]),
    };
  },

  updateSimulatorOvertimeStartLabel(back, analysis, times) {
    const overtimeEl = back?.querySelector('.eed-sim-overtime-start');
    if (!overtimeEl) return;

    if (!analysis || !times) {
      overtimeEl.hidden = true;
      overtimeEl.textContent = '';
      this.setTooltipTarget(overtimeEl, null);
      return;
    }

    const exitSeconds = this.timeToSeconds(times.saida);
    const overtimeView = this.buildOvertimeStartLabel(
      analysis.raw,
      analysis.toleranceSeconds,
      exitSeconds
    );

    if (!overtimeView) {
      overtimeEl.hidden = true;
      overtimeEl.textContent = '';
      this.setTooltipTarget(overtimeEl, null);
      return;
    }

    // Preferred sentence on the card; fall back to short if truncated. Tooltip has the full explanation.
    overtimeEl.hidden = false;
    overtimeEl.textContent = overtimeView.text;
    overtimeEl.classList.toggle(
      'eed-sim-overtime-start--counting',
      overtimeView.alreadyCounting
    );
    this.setTooltipTarget(overtimeEl, overtimeView.tooltip);

    requestAnimationFrame(() => {
      if (!overtimeEl.isConnected || overtimeEl.hidden) return;
      if (overtimeEl.scrollWidth > overtimeEl.clientWidth + 1) {
        overtimeEl.textContent = overtimeView.shortText;
      }
    });
  },

  updateSimulatorResult(back, settings) {
    const resultEl = back.querySelector('.eed-sim-result');
    if (!resultEl) return;

    const labelEl = resultEl.querySelector('.eed-sim-result-label');
    const valueEl = resultEl.querySelector('.eed-sim-result-value');
    const metaEl = resultEl.querySelector('.eed-sim-result-meta');
    const consequenceEl = resultEl.querySelector('.eed-sim-result-consequence');

    const times = this.readSimulatorTimesFromBack(back);
    if (!times) {
      resultEl.className = 'eed-sim-result eed-sim-result--invalid';
      if (labelEl) labelEl.textContent = t('contentSimInvalidTimes');
      if (valueEl) valueEl.textContent = '--:--:--';
      if (metaEl) metaEl.textContent = '';
      if (consequenceEl) consequenceEl.textContent = '';
      this.setTooltipTarget(resultEl, t('contentSimInvalidTimes'));
      this.updateSimulatorBankProjection(back, null);
      this.updateSimulatorOvertimeStartLabel(back, null, null);
      return;
    }

    const analysis = this.buildSimulatorAnalysis(times, settings);
    const view = this.getSimulatorResultView(analysis);

    resultEl.className = `eed-sim-result eed-sim-result--${view.tone}`;

    if (labelEl) labelEl.textContent = view.label;
    if (valueEl) valueEl.textContent = view.value;
    if (metaEl) metaEl.textContent = view.meta;
    if (consequenceEl) consequenceEl.textContent = view.consequence;

    this.setTooltipTarget(resultEl, view.tooltip);
    this.updateSimulatorBankProjection(back, analysis);
    this.updateSimulatorOvertimeStartLabel(back, analysis, times);
  },

  getEmployerSimCloseButtonHtml() {
    return `<button type="button" class="eed-employer-sim-close" aria-label="${t('contentSimClose')}"><span aria-hidden="true">×</span></button>`;
  },

  renderEmployerSimulatorBack(back, settings, records) {
    if (!back) return;

    delete back.dataset.eedSimInputsBound;
    back._eedAutomaticSimulatorValues = null;

    if (!EEDSettings.isScheduleConfigured(settings)) {
      back.className = 'eed-hour-bank-face eed-employer-sim-back eed-employer-sim-back--hint';
      back.innerHTML = `
        ${this.getEmployerSimCloseButtonHtml()}
        <div class="eed-sim-content">
          <div class="eed-sim-header">
            <p class="eed-sim-title">${t('contentSimTitle')}</p>
          </div>
          <p class="eed-sim-hint">${t('contentSimScheduleRequired')}</p>
        </div>
      `;
      return;
    }

    const automatic = this.getAutomaticSimulatorValues(records, settings);
    const displayTimes = this.mergeSavedIntoSimulatorValues(
      automatic,
      this.loadSavedSimulatorValues()
    );
    const hasInterval = this.hasInterval(settings);

    back._eedAutomaticSimulatorValues = { ...automatic };
    back.className = 'eed-hour-bank-face eed-employer-sim-back';
    back.innerHTML = `
      ${this.getEmployerSimCloseButtonHtml()}
      ${this.getEmployerSimResetButtonHtml()}
      <div class="eed-sim-content">
        <div class="eed-sim-header">
          <p class="eed-sim-title">${t('contentSimTitle')}</p>
        </div>
        <div class="eed-sim-fields ${hasInterval ? '' : 'eed-sim-fields--simple'}">
          <label class="eed-sim-field">
            <span>${t('contentSimLabelEntry')}</span>
            <input type="text" data-eed-sim-field="entrada" data-eed-last-valid="${displayTimes.entrada}" inputmode="numeric" maxlength="8" value="${displayTimes.entrada}" autocomplete="off">
          </label>
          ${
            hasInterval
              ? `
          <label class="eed-sim-field">
            <span>${t('contentSimLabelLunchOut')}</span>
            <input type="text" data-eed-sim-field="intervaloInicio" data-eed-last-valid="${displayTimes.intervaloInicio}" inputmode="numeric" maxlength="8" value="${displayTimes.intervaloInicio}" autocomplete="off">
          </label>
          <label class="eed-sim-field">
            <span>${t('contentSimLabelLunchIn')}</span>
            <input type="text" data-eed-sim-field="intervaloFim" data-eed-last-valid="${displayTimes.intervaloFim}" inputmode="numeric" maxlength="8" value="${displayTimes.intervaloFim}" autocomplete="off">
          </label>
          `
              : `
          <input type="hidden" data-eed-sim-field="intervaloInicio" data-eed-last-valid="${displayTimes.intervaloInicio}" value="${displayTimes.intervaloInicio}">
          <input type="hidden" data-eed-sim-field="intervaloFim" data-eed-last-valid="${displayTimes.intervaloFim}" value="${displayTimes.intervaloFim}">
          `
          }
          <label class="eed-sim-field">
            <span>${t('contentSimLabelExit')}</span>
            <input type="text" data-eed-sim-field="saida" data-eed-last-valid="${displayTimes.saida}" inputmode="numeric" maxlength="8" value="${displayTimes.saida}" autocomplete="off">
          </label>
        </div>
        <div class="eed-sim-result">
          <span class="eed-sim-result-label"></span>
          <span class="eed-sim-result-value"></span>
          <span class="eed-sim-result-meta"></span>
          <div class="eed-sim-bank" hidden>
            <span class="eed-sim-bank-line"></span>
          </div>
          <span class="eed-sim-overtime-start" hidden></span>
          <span class="eed-sim-result-consequence"></span>
        </div>
      </div>
    `;

    this.updateSimulatorResult(back, settings);
    this.updateSimulatorResetButtonVisibility(back);
  },

  bindEmployerSimulatorInputs(flip, card, settings) {
    const back = flip.querySelector('.eed-employer-sim-back');
    if (!back || back.dataset.eedSimInputsBound === 'true') return;
    back.dataset.eedSimInputsBound = 'true';

    const stop = (event) => event.stopPropagation();
    const automatic = back._eedAutomaticSimulatorValues || {};

    const resetButton = back.querySelector('.eed-sim-reset-button');
    if (resetButton) {
      ['click', 'mousedown', 'pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
        resetButton.addEventListener(eventName, stop);
      });

      resetButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.restoreAutomaticSimulatorValues(back, settings);
      });
    }

    back.querySelectorAll('[data-eed-sim-field]').forEach((input) => {
      if (input.type === 'hidden') return;

      const field = input.getAttribute('data-eed-sim-field');
      if (!input.dataset.eedLastValid) {
        const seed =
          this.normalizeSimulatedTimeInput(input.value) ||
          this.normalizeSimulatedTimeInput(automatic[field]);
        if (seed) input.dataset.eedLastValid = seed;
      }

      input.addEventListener('click', stop);
      input.addEventListener('mousedown', stop);
      input.addEventListener('pointerdown', stop);
      input.addEventListener('touchstart', stop);
      input.addEventListener('keydown', stop);
      input.addEventListener('keyup', stop);
      input.addEventListener('focus', stop);

      input.addEventListener('input', (event) => {
        event.stopPropagation();
        this.updateSimulatorResult(back, settings);
        this.updateSimulatorResetButtonVisibility(back);
        this.scheduleSaveSimulatorValues(back);
      });

      input.addEventListener('change', (event) => {
        event.stopPropagation();
        this.flushSaveSimulatorValues(back);
        this.updateSimulatorResetButtonVisibility(back);
      });

      input.addEventListener('blur', (event) => {
        event.stopPropagation();

        const normalized = this.normalizeSimulatedTimeInput(input.value);
        if (normalized) {
          input.value = normalized;
          input.dataset.eedLastValid = normalized;
        } else {
          const fallback =
            this.normalizeSimulatedTimeInput(input.dataset.eedLastValid) ||
            this.normalizeSimulatedTimeInput(automatic[field]);
          if (fallback) input.value = fallback;
        }

        this.updateSimulatorResult(back, settings);
        this.flushSaveSimulatorValues(back);
        this.updateSimulatorResetButtonVisibility(back);
      });
    });
  },

  setEmployerSimFlipped(flip, card, flipped) {
    const inner = flip.querySelector('.eed-employer-sim-flip-inner');
    if (!inner) return;

    const wasFlipped = flip.dataset.eedFlipped === 'true';
    if (wasFlipped === flipped) return;

    flip.dataset.eedFlipped = flipped ? 'true' : 'false';
    inner.classList.toggle('eed-employer-sim-flipped', flipped);
    card.classList.toggle('eed-employer-sim-is-flipped', flipped);
    card.setAttribute('aria-expanded', flipped ? 'true' : 'false');

    if (flipped) {
      this.ensureEmployerSimulatorBack(flip).catch(() => {});
      window.setTimeout(() => {
        if (flip.dataset.eedFlipped === 'true') {
          document.addEventListener('click', flip._eedEmployerOutsideClick, true);
        }
      }, 0);
      return;
    }

    document.removeEventListener('click', flip._eedEmployerOutsideClick, true);
  },

  bindEmployerSimEvents(flip, card) {
    if (card.dataset.eedEmployerEventsBound === 'true') return;
    card.dataset.eedEmployerEventsBound = 'true';

    flip._eedEmployerOutsideClick = (event) => {
      if (flip.dataset.eedFlipped !== 'true') return;
      if (card.contains(event.target)) return;
      this.setEmployerSimFlipped(flip, card, false);
    };

    // Same pattern as hour-bank, plus capture so #btnLocal cannot swallow the click.
    const onActivate = (event) => {
      if (event.target.closest('.eed-employer-sim-close')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.setEmployerSimFlipped(flip, card, false);
        return;
      }

      if (event.target.closest('.eed-sim-reset-button')) {
        return;
      }

      if (event.target.closest('[data-eed-sim-field], .eed-sim-field, .eed-sim-content input')) {
        return;
      }

      if (flip.dataset.eedFlipped === 'true') return;

      event.preventDefault();
      event.stopImmediatePropagation();
      this.setEmployerSimFlipped(flip, card, true);
    };

    card.addEventListener('click', onActivate, true);
    card.addEventListener('click', onActivate);

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && flip.dataset.eedFlipped === 'true') {
        event.preventDefault();
        this.setEmployerSimFlipped(flip, card, false);
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (flip.dataset.eedFlipped === 'true') return;
      if (event.target.closest('[data-eed-sim-field]')) return;

      event.preventDefault();
      this.setEmployerSimFlipped(flip, card, true);
    });
  },

  async ensureEmployerSimulatorBack(flip) {
    const back = flip.querySelector('.eed-employer-sim-back');
    if (!back || back.dataset.eedSimReady === 'true') return;
    if (flip._eedEmployerBackPromise) return flip._eedEmployerBackPromise;
    if (!this.isExtensionAlive()) return;

    flip._eedEmployerBackPromise = (async () => {
      try {
        const settings = await EEDSettings.load();
        if (!this.isExtensionAlive() || !document.body.contains(back)) return;

        const records = this.getRecords();
        this.renderEmployerSimulatorBack(back, settings, records);
        this.bindEmployerSimulatorInputs(
          flip,
          flip.closest('.eed-employer-sim-card'),
          settings
        );
        back.dataset.eedSimReady = 'true';
      } catch (error) {
        if (this.isContextInvalidatedError(error)) {
          this.markExtensionDead();
          return;
        }
        console.warn('[Better Easy Dots] Erro ao montar verso do simulador:', error);
      } finally {
        flip._eedEmployerBackPromise = null;
      }
    })();

    return flip._eedEmployerBackPromise;
  },

  initEmployerSimulator() {
    if (!this.isExtensionAlive()) return;

    try {
      const card = this.findEmployerCard();
      if (!card) return;

      if (card.dataset.eedEmployerSimInitialized === 'true') {
        const flip = card.querySelector('.eed-employer-sim-flip');
        if (flip && card.dataset.eedEmployerEventsBound !== 'true') {
          this.bindEmployerSimEvents(flip, card);
        }
        return;
      }

      const barWidget = card.querySelector('.bar-widget');
      if (!barWidget) return;

      card.dataset.eedEmployerSimInitialized = 'true';
      card.dataset.eedEmployerSimEnhanced = 'true';
      card.classList.add('eed-employer-sim-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', t('contentSimFlipAriaLabel'));
      card.setAttribute('aria-expanded', 'false');

      const flip = document.createElement('div');
      flip.className = 'eed-employer-sim-flip';
      flip.dataset.eedFlipped = 'false';

      flip.innerHTML = `
        <div class="eed-employer-sim-flip-inner">
          <div class="eed-hour-bank-face eed-employer-sim-front"></div>
          <div class="eed-hour-bank-face eed-employer-sim-back">
            ${this.getEmployerSimCloseButtonHtml()}
            <div class="eed-sim-content">
              <div class="eed-sim-header">
                <p class="eed-sim-title">${t('contentSimTitle')}</p>
              </div>
              <p class="eed-sim-hint">…</p>
            </div>
          </div>
        </div>
      `;

      const front = flip.querySelector('.eed-employer-sim-front');
      front.appendChild(barWidget);

      // Keep layout, but do not let the site's #btnLocal eat pointer events.
      front.querySelectorAll('#btnLocal, [id="btnLocal"]').forEach((el) => {
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
      });

      this.mountCardFrontActionHint(
        barWidget,
        'eed-employer-sim-hover-hint',
        t('contentSimHoverHint')
      );

      card.appendChild(flip);

      // Lock height after the front hint row is in place so both faces share it.
      const lockedHeight = Math.ceil(card.getBoundingClientRect().height);
      if (lockedHeight > 0) {
        card.style.height = `${lockedHeight}px`;
        card.dataset.eedSimHeightLocked = 'true';
      }

      this.bindEmployerSimEvents(flip, card);
      this.installSimulatorTooltips(card);
      this.ensureEmployerSimulatorBack(flip).catch(() => {});
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        this.markExtensionDead();
        return;
      }
      console.warn('[Better Easy Dots] Erro ao inicializar simulador:', error);
      const card = this.findEmployerCard();
      if (card) {
        delete card.dataset.eedEmployerSimInitialized;
        delete card.dataset.eedEmployerSimEnhanced;
        delete card.dataset.eedEmployerEventsBound;
        delete card.dataset.eedSimHeightLocked;
        card.style.height = '';
      }
    }
  },

  ensureEmployerSimulator() {
    if (!this.isExtensionAlive()) return;
    this.initEmployerSimulator();
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

    const settingsAnchor = li.querySelector('a');
    if (settingsAnchor && settingsAnchor.dataset.eedListenerAttached !== 'true') {
      settingsAnchor.dataset.eedListenerAttached = 'true';
      settingsAnchor.addEventListener('click', (event) => {
        event.preventDefault();
        this.sendRuntimeMessage({ action: 'openSettings' });
      });
    }

    menuList.appendChild(li);

    const settingsLink = li.querySelector('a.waves-effect');
    if (settingsLink && typeof Waves !== 'undefined' && typeof Waves.attach === 'function') {
      Waves.attach(settingsLink);
    }
  },

  findDashboardRoot() {
    const table = document.querySelector(this.SELECTORS.recordsTable);
    if (table) {
      return (
        table.closest('.content-page, .content, #wrapper, .container-fluid, main, #content') ||
        table.parentElement ||
        null
      );
    }

    const dashboardCard = document.querySelector('.card-box--dashboard');
    if (dashboardCard) {
      return (
        dashboardCard.closest(
          '.content-page, .content, #wrapper, .container-fluid, main, #content'
        ) ||
        dashboardCard.parentElement ||
        null
      );
    }

    const solicitacao = document.querySelector('#solicitacao');
    if (solicitacao) {
      return (
        solicitacao.closest(
          '.content-page, .content, #wrapper, .container-fluid, main, #content'
        ) ||
        solicitacao.parentElement ||
        null
      );
    }

    return null;
  },

  hasCoreTargets() {
    return Boolean(
      document.querySelector(this.SELECTORS.recordsTable) ||
        document.querySelector('.card-box--dashboard') ||
        document.querySelector(this.SELECTORS.sidebarMenu) ||
        document.querySelector('#solicitacao .grid-view')
    );
  },

  scheduleEnhance(reason = 'mutation') {
    if (!this.isExtensionAlive()) return;

    this.debugLog('scheduleEnhance', reason);
    clearTimeout(this.enhanceTimer);
    this.enhanceTimer = setTimeout(() => {
      this.enhanceTimer = null;
      this.updateBetterEasyDots(reason);
    }, this.ENHANCE_DEBOUNCE_MS);
  },

  schedulePhase2() {
    if (!this.isExtensionAlive() || this.jornadaImportReady) return;
    if (this.phase2Timer) return;

    this.phase2Timer = setTimeout(() => {
      this.phase2Timer = null;
      if (!this.isExtensionAlive() || this.jornadaImportReady) return;

      try {
        this.ensureJornadaImport();
      } catch (error) {
        this.warnFeature('importar jornada', error);
      }
    }, 50);
  },

  schedulePhase3() {
    if (!this.isExtensionAlive()) return;

    const hourBankReady = Boolean(
      document.querySelector('[data-eed-planner-initialized="true"]')
    );
    const simReady = Boolean(
      document.querySelector('[data-eed-employer-sim-initialized="true"]')
    );
    if (hourBankReady && simReady) return;
    if (this.phase3Timer != null) return;

    this.phase3Timer = this.runIdle(() => {
      this.phase3Timer = null;
      if (!this.isExtensionAlive()) return;

      try {
        this.ensureHourBankCard();
      } catch (error) {
        this.warnFeature('banco de horas', error);
      }

      try {
        this.ensureEmployerSimulator();
      } catch (error) {
        this.warnFeature('simulador', error);
      }
    });
  },

  maybeNarrowPageObserver() {
    if (!this.isExtensionAlive() || !this.pageObserver) return;

    if (this.pageObserverRoot && this.pageObserverRoot !== document.body) {
      if (!document.body.contains(this.pageObserverRoot)) {
        this.debugLog('observed root detached, fallback to body');
        this.attachPageObserver(document.body);
      }
      return;
    }

    const root = this.findDashboardRoot();
    if (root && root !== document.body) {
      this.debugLog('narrow page observer to dashboard root');
      this.attachPageObserver(root);
    }
  },

  attachPageObserver(root = document.body) {
    if (!this.isExtensionAlive() || !root) return;

    if (this.pageObserver && this.pageObserverRoot === root) return;

    try {
      this.pageObserver?.disconnect();
    } catch {
      /* ignore */
    }

    const observer = new MutationObserver((mutations) => {
      try {
        if (!this.isExtensionAlive()) return;

        const hasExternalMutation = mutations.some(
          (mutation) => !mutationOriginatesFromEnhancedCard(mutation)
        );
        if (!hasExternalMutation) return;

        this.scheduleEnhance('dom');
      } catch (error) {
        if (this.isContextInvalidatedError(error)) {
          this.markExtensionDead();
        }
      }
    });

    this.pageObserver = observer;
    this.pageObserverRoot = root;
    observer.observe(root, { childList: true, subtree: true });
    this.debugLog('page observer attached', root === document.body ? 'body' : root);
  },

  initBetterEasyDotsOnce() {
    if (this.initOnceDone || !this.isExtensionAlive()) return;
    this.initOnceDone = true;
    this.debugLog('initOnce');

    this.attachPageObserver(document.body);
  },

  updateBetterEasyDots(reason = 'manual') {
    if (!this.isExtensionAlive()) return;
    this.debugLog('updateBetterEasyDots', reason);

    // Phase 1 — critical path: table colors + balance
    try {
      this.injectSidebarSettingsItem();
    } catch (error) {
      this.warnFeature('sidebar', error);
    }

    try {
      this.ensureRegisterButton();
    } catch (error) {
      this.warnFeature('botão registrar', error);
    }

    try {
      this.observeRecordsTable();
    } catch (error) {
      this.warnFeature('tabela de registros', error);
    }

    try {
      if (typeof this.schedulePendingRequestsSummary === 'function') {
        this.schedulePendingRequestsSummary(reason);
      } else {
        console.warn(
          '[Better Easy Dots] schedulePendingRequestsSummary ausente — pending-requests-impact.js não carregou?'
        );
      }
    } catch (error) {
      this.warnFeature('impacto solicitações pendentes', error);
    }

    if (!this.hasCoreTargets()) {
      this.debugLog('core targets missing, waiting for DOM');
      if (this.pageObserverRoot !== document.body) {
        this.attachPageObserver(document.body);
      }
      return;
    }

    // Phase 2 — suggestions-related UI (jornada import feeds schedule)
    this.schedulePhase2();

    // Phase 3 — heavier visual extras when idle
    this.schedulePhase3();

    this.maybeNarrowPageObserver();
  },
};

// Content script files don't share top-level `const` across files — expose for patches.
globalThis.EASydots = EASydots;

function mutationOriginatesFromEnhancedCard(mutation) {
  const target = mutation.target;
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return Boolean(
    element?.closest?.('.eed-hour-bank-card') ||
      element?.closest?.('.eed-employer-sim-card') ||
      element?.closest?.('.eed-pending-requests-summary')
  );
}

async function init() {
  if (!EASydots.isExtensionAlive()) return;

  try {
    await initI18nFromStorage();
  } catch {
    /* keep chrome.i18n fallback */
  }

  EEDSettings.rememberSiteUrl(window.location.href).catch(() => {});

  try {
    EASydots.initBetterEasyDotsOnce();
    EASydots.updateBetterEasyDots('boot');
  } catch (error) {
    if (EASydots.isContextInvalidatedError(error)) {
      EASydots.markExtensionDead();
      return;
    }
    console.warn('[Better Easy Dots] Erro na inicialização:', error);
  }

  EASydots.syncBadge();
}

try {
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (!EASydots.isExtensionAlive()) return;

        if (area === 'local' && changes['eed-settings']) {
          const previousLanguage = changes['eed-settings'].oldValue?.language;
          const nextLanguage = changes['eed-settings'].newValue?.language;

          const applySettingsChange = async () => {
            if (previousLanguage !== nextLanguage) {
              await initI18n(nextLanguage);
              document.querySelector(EASydots.SELECTORS.settingsMenuItem)?.remove();
              document.querySelector('#eed-day-balance-row')?.remove();
              document.querySelector('.eed-pending-requests-summary')?.remove();
              EASydots.injectSidebarSettingsItem();
            }

            EASydots.cachedSettings = null;
            EASydots.lastViewState = '';
            EASydots.scheduleUpdateRecordsView(true);
            EASydots.scheduleJornadaImportSync();
            EASydots.schedulePendingRequestsSummary?.('language');
          };

          applySettingsChange().catch((error) => {
            if (EASydots.isContextInvalidatedError(error)) {
              EASydots.markExtensionDead();
            }
          });
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

// Boot continues in pending-requests-impact.js after methods are attached.
// Fallback: if that file is missing from a broken package, still start core features.
globalThis.__eedBooted = false;
globalThis.__eedBoot = function eedBoot() {
  if (globalThis.__eedBooted) return;
  if (typeof init !== 'function') return;
  globalThis.__eedBooted = true;
  init();
};

setTimeout(() => {
  globalThis.__eedBoot?.();
}, 0);

try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'getPageStatus') return false;

    try {
      sendResponse({
        ok: true,
        hasCoreTargets: Boolean(EASydots?.hasCoreTargets?.()),
        href: String(location.href || ''),
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: String(error?.message || error),
      });
    }

    return false;
  });
} catch {
  /* Extension context may already be invalidated */
}
