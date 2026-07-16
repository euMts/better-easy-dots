const EEDSettingsUI = {
  root: null,
  toastEl: null,
  toastTimeout: null,
  savedSettings: null,
  eventsBound: false,
  options: {},

  fieldFocusSelectors: {
    entrada: '[data-time-id="entrada"] [data-part="hours"]',
    saida: '[data-time-id="saida"] [data-part="hours"]',
    intervaloInicio: '[data-time-id="intervalo-inicio"] [data-part="hours"]',
    intervaloFim: '[data-time-id="intervalo-fim"] [data-part="hours"]',
    toleranciaAtraso: '#eed-input-tolerancia',
    easydotsUrl: '#eed-input-easydots-url',
  },

  getMarkup(options = {}) {
    const { showHeader = false, includeCancel = false } = options;

    return `
      ${showHeader ? `
        <div class="eed-settings-header fadeIn animated">
          <div class="eed-settings-header-text">
            <h2>${t('settingsHeaderTitle')}</h2>
            <p>${t('settingsHeaderSubtitle')}</p>
          </div>
        </div>
      ` : ''}

      <form id="eed-settings-form" class="eed-settings-body" autocomplete="off">
        <div class="eed-settings-section fadeInUp animated">
          <h3 class="eed-settings-section-title">${t('settingsWorkHoursTitle')}</h3>
          <p class="eed-settings-section-hint">${t('settingsWorkHoursHint')}</p>
          <div class="eed-settings-grid">
            <label class="eed-settings-field" data-field="entrada">
              <span class="eed-settings-label">${t('settingsLabelEntry')}</span>
              <div class="eed-settings-time-input" data-time-id="entrada">
                <input type="text" class="eed-settings-time-part" data-part="hours" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaEntryHours')}" placeholder="08">
                <span class="eed-settings-time-sep">:</span>
                <input type="text" class="eed-settings-time-part" data-part="minutes" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaEntryMinutes')}" placeholder="00">
              </div>
              <span class="eed-settings-error" data-error-for="entrada" role="alert" hidden></span>
            </label>
            <label class="eed-settings-field" data-field="saida">
              <span class="eed-settings-label">${t('settingsLabelExit')}</span>
              <div class="eed-settings-time-input" data-time-id="saida">
                <input type="text" class="eed-settings-time-part" data-part="hours" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaExitHours')}" placeholder="18">
                <span class="eed-settings-time-sep">:</span>
                <input type="text" class="eed-settings-time-part" data-part="minutes" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaExitMinutes')}" placeholder="00">
              </div>
              <span class="eed-settings-error" data-error-for="saida" role="alert" hidden></span>
            </label>
          </div>
        </div>

        <div class="eed-settings-section fadeInUp animated eed-animate-delay-1">
          <h3 class="eed-settings-section-title">${t('settingsBreakTitle')}</h3>
          <p class="eed-settings-section-hint">${t('settingsBreakHint')}</p>
          <div class="eed-settings-grid">
            <label class="eed-settings-field" data-field="intervaloInicio">
              <span class="eed-settings-label">${t('settingsLabelBreakStart')}</span>
              <div class="eed-settings-time-input" data-time-id="intervalo-inicio">
                <input type="text" class="eed-settings-time-part" data-part="hours" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaBreakStartHours')}" placeholder="12">
                <span class="eed-settings-time-sep">:</span>
                <input type="text" class="eed-settings-time-part" data-part="minutes" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaBreakStartMinutes')}" placeholder="00">
              </div>
              <span class="eed-settings-error" data-error-for="intervaloInicio" role="alert" hidden></span>
            </label>
            <label class="eed-settings-field" data-field="intervaloFim">
              <span class="eed-settings-label">${t('settingsLabelBreakEnd')}</span>
              <div class="eed-settings-time-input" data-time-id="intervalo-fim">
                <input type="text" class="eed-settings-time-part" data-part="hours" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaBreakEndHours')}" placeholder="13">
                <span class="eed-settings-time-sep">:</span>
                <input type="text" class="eed-settings-time-part" data-part="minutes" inputmode="numeric" maxlength="2" aria-label="${t('settingsAriaBreakEndMinutes')}" placeholder="00">
              </div>
              <span class="eed-settings-error" data-error-for="intervaloFim" role="alert" hidden></span>
            </label>
          </div>
        </div>

        <div class="eed-settings-section fadeInUp animated eed-animate-delay-2">
          <h3 class="eed-settings-section-title">${t('settingsToleranceTitle')}</h3>
          <p class="eed-settings-section-hint">${t('settingsToleranceHint')}</p>
          <div class="eed-settings-grid">
            <label class="eed-settings-field" data-field="toleranciaAtraso">
              <span class="eed-settings-label">${t('settingsLabelDailyTolerance')}</span>
              <input type="text" id="eed-input-tolerancia" class="eed-settings-input" inputmode="numeric" placeholder="10" maxlength="2" aria-label="${t('settingsAriaTolerance')}">
              <span class="eed-settings-error" data-error-for="toleranciaAtraso" role="alert" hidden></span>
            </label>
            <label class="eed-settings-field" data-field="margemSegurancaTolerancia">
              <span class="eed-settings-label">${t('settingsLabelSafetyMargin')}</span>
              <input type="text" id="eed-input-margem-seguranca" class="eed-settings-input" inputmode="numeric" placeholder="1" maxlength="2" aria-label="${t('settingsAriaSafetyMargin')}">
              <span class="eed-settings-error" data-error-for="margemSegurancaTolerancia" role="alert" hidden></span>
            </label>
          </div>
          <p class="eed-settings-section-hint eed-settings-section-hint-secondary">${t('settingsSafetyMarginHint')}</p>
        </div>

        <div class="eed-settings-section fadeInUp animated eed-animate-delay-4">
          <h3 class="eed-settings-section-title">${t('settingsUrlTitle')}</h3>
          <p class="eed-settings-section-hint">${t('settingsUrlHint')}</p>
          <label class="eed-settings-field" data-field="easydotsUrl">
            <span class="eed-settings-label">${t('settingsLabelAddress')}</span>
            <input type="url" id="eed-input-easydots-url" class="eed-settings-input eed-settings-input-url" placeholder="https://sys.easydots.com.br/..." aria-label="${t('settingsAriaEasydotsUrl')}">
            <span class="eed-settings-error" data-error-for="easydotsUrl" role="alert" hidden></span>
          </label>
        </div>
      </form>

      <div class="eed-settings-footer fadeIn animated eed-animate-delay-5">
        ${includeCancel ? `<button type="button" id="eed-settings-cancel" class="eed-settings-btn eed-settings-btn-ghost waves-effect">${t('settingsButtonCancel')}</button>` : ''}
        <button type="button" id="eed-settings-reset" class="eed-settings-btn eed-settings-btn-secondary waves-effect">${t('settingsButtonReset')}</button>
        <button type="button" id="eed-settings-save" class="eed-settings-btn eed-settings-btn-primary waves-effect waves-light">${t('settingsButtonSave')}</button>
      </div>

      <div id="eed-settings-toast" class="eed-settings-toast eed-settings-toast-hidden fadeInUp animated eed-animate-fast" aria-live="polite"></div>
    `;
  },

  mount(container, options = {}) {
    this.options = options;
    this.eventsBound = false;
    container.innerHTML = this.getMarkup(options);
    this.root = container;
    this.toastEl = container.querySelector('#eed-settings-toast');
    this.bindEvents();
    return this.loadSettings();
  },

  bindEvents() {
    if (this.eventsBound || !this.root) return;
    this.eventsBound = true;

    this.root.querySelector('#eed-settings-save')?.addEventListener('click', () => this.handleSave());
    this.root.querySelector('#eed-settings-reset')?.addEventListener('click', () => this.handleReset());
    this.root.querySelector('#eed-settings-cancel')?.addEventListener('click', () => this.handleCancel());

    this.root.querySelectorAll('.eed-settings-time-input').forEach((group) => {
      this.bindTimeSegmentGroup(group);
    });

    this.bindToleranceInput(this.root.querySelector('#eed-input-tolerancia'));
    this.bindSafetyMarginInput(this.root.querySelector('#eed-input-margem-seguranca'));
    this.bindFieldErrorClearing();

    this.root.querySelector('#eed-settings-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleSave();
    });
  },

  bindTimeSegmentGroup(group) {
    const hoursInput = group.querySelector('[data-part="hours"]');
    const minutesInput = group.querySelector('[data-part="minutes"]');

    [hoursInput, minutesInput].forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('click', () => input.select());

      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 2);
      });

      input.addEventListener('blur', () => {
        const max = input.dataset.part === 'hours' ? 23 : 59;
        input.value = this.formatSegment(input.value, max);
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' && input === hoursInput) {
          event.preventDefault();
          minutesInput.focus();
          minutesInput.select();
        }

        if (event.key === 'ArrowLeft' && input === minutesInput) {
          event.preventDefault();
          hoursInput.focus();
          hoursInput.select();
        }

        if (event.key === ':') {
          event.preventDefault();
          minutesInput.focus();
          minutesInput.select();
        }
      });
    });
  },

  bindToleranceInput(input) {
    if (!input) return;

    input.addEventListener('focus', () => input.select());
    input.addEventListener('click', () => input.select());

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 2);
    });

    input.addEventListener('blur', () => {
      input.value = String(this.formatTolerance(input.value));
    });
  },

  bindSafetyMarginInput(input) {
    if (!input) return;

    input.addEventListener('focus', () => input.select());
    input.addEventListener('click', () => input.select());

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 2);
    });

    input.addEventListener('blur', () => {
      input.value = String(this.formatSafetyMargin(input.value));
    });
  },

  bindFieldErrorClearing() {
    this.root.querySelectorAll('[data-field]').forEach((fieldEl) => {
      const fieldKey = fieldEl.dataset.field;
      fieldEl.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', () => this.clearFieldError(fieldKey));
      });
    });
  },

  clearFieldError(fieldKey) {
    const fieldEl = this.root.querySelector(`[data-field="${fieldKey}"]`);
    const errorEl = this.root.querySelector(`[data-error-for="${fieldKey}"]`);

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }

    fieldEl?.classList.remove('eed-settings-field--error');
    fieldEl?.querySelector('.eed-settings-time-input')?.classList.remove('eed-settings-time-input--error');
    fieldEl?.querySelector('.eed-settings-input')?.classList.remove('eed-settings-input--error');

    if (!this.root.querySelector('.eed-settings-field--error')) {
      this.root.querySelector('#eed-settings-form-errors')?.remove();
    }
  },

  clearFormErrors() {
    this.root.querySelectorAll('[data-error-for]').forEach((errorEl) => {
      errorEl.textContent = '';
      errorEl.hidden = true;
    });

    this.root.querySelectorAll('.eed-settings-field--error').forEach((fieldEl) => {
      fieldEl.classList.remove('eed-settings-field--error');
    });

    this.root.querySelectorAll('.eed-settings-time-input--error').forEach((el) => {
      el.classList.remove('eed-settings-time-input--error');
    });

    this.root.querySelectorAll('.eed-settings-input--error').forEach((el) => {
      el.classList.remove('eed-settings-input--error');
    });

    this.root.querySelector('#eed-settings-form-errors')?.remove();
  },

  showFormErrors(errors) {
    this.clearFormErrors();

    const entries = Object.entries(errors);
    if (!entries.length) {
      return;
    }

    const form = this.root.querySelector('#eed-settings-form');
    const summary = document.createElement('div');
    summary.id = 'eed-settings-form-errors';
    summary.className = 'eed-settings-form-errors';
    summary.setAttribute('role', 'alert');
    summary.innerHTML = `
      <p class="eed-settings-form-errors-title">${t('settingsErrorSummaryTitle')}</p>
      <ul class="eed-settings-form-errors-list">
        ${entries.map(([, message]) => `<li>${message}</li>`).join('')}
      </ul>
    `;
    form?.prepend(summary);

    for (const [fieldKey, message] of entries) {
      const fieldEl = this.root.querySelector(`[data-field="${fieldKey}"]`);
      const errorEl = this.root.querySelector(`[data-error-for="${fieldKey}"]`);

      fieldEl?.classList.add('eed-settings-field--error');
      fieldEl?.querySelector('.eed-settings-time-input')?.classList.add('eed-settings-time-input--error');
      fieldEl?.querySelector('.eed-settings-input')?.classList.add('eed-settings-input--error');

      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
    }

    const firstFieldKey = entries[0][0];
    const focusTarget = this.root.querySelector(this.fieldFocusSelectors[firstFieldKey]);
    focusTarget?.focus();
    focusTarget?.select?.();
  },

  timeToMinutes(value) {
    const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10));
    return hours * 60 + minutes;
  },

  formatTolerance(value) {
    return Math.min(60, Math.max(1, parseInt(value, 10) || 1));
  },

  formatSafetyMargin(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(60, Math.max(0, parsed));
  },

  formatSegment(value, max) {
    const parsed = Math.min(max, Math.max(0, parseInt(value, 10) || 0));
    return String(parsed).padStart(2, '0');
  },

  getTimeFromGroup(timeId) {
    const group = this.root.querySelector(`.eed-settings-time-input[data-time-id="${timeId}"]`);
    const hours = this.formatSegment(group.querySelector('[data-part="hours"]').value, 23);
    const minutes = this.formatSegment(group.querySelector('[data-part="minutes"]').value, 59);
    return `${hours}:${minutes}`;
  },

  setTimeOnGroup(timeId, timeValue) {
    const [hours, minutes] = this.formatTimeValue(timeValue).split(':');
    const group = this.root.querySelector(`.eed-settings-time-input[data-time-id="${timeId}"]`);
    group.querySelector('[data-part="hours"]').value = hours;
    group.querySelector('[data-part="minutes"]').value = minutes;
  },

  formatTimeValue(value) {
    const digits = value.replace(/\D/g, '').padEnd(4, '0').slice(0, 4);
    const hours = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
    const minutes = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  },

  isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  },

  getFormValues() {
    return {
      entrada: this.getTimeFromGroup('entrada'),
      saida: this.getTimeFromGroup('saida'),
      intervaloInicio: this.getTimeFromGroup('intervalo-inicio'),
      intervaloFim: this.getTimeFromGroup('intervalo-fim'),
      toleranciaAtraso: this.formatTolerance(this.root.querySelector('#eed-input-tolerancia').value),
      margemSegurancaTolerancia: this.formatSafetyMargin(
        this.root.querySelector('#eed-input-margem-seguranca').value
      ),
      easydotsUrl: this.root.querySelector('#eed-input-easydots-url').value.trim(),
    };
  },

  setFormValues(settings) {
    this.setTimeOnGroup('entrada', settings.entrada);
    this.setTimeOnGroup('saida', settings.saida);
    this.setTimeOnGroup('intervalo-inicio', settings.intervaloInicio);
    this.setTimeOnGroup('intervalo-fim', settings.intervaloFim);
    this.root.querySelector('#eed-input-tolerancia').value = String(settings.toleranciaAtraso);
    this.root.querySelector('#eed-input-margem-seguranca').value = String(
      settings.margemSegurancaTolerancia
    );
    this.root.querySelector('#eed-input-easydots-url').value = settings.easydotsUrl || '';
  },

  validateForm(values) {
    const errors = {};
    const timeFields = [
      { key: 'entrada', labelKey: 'settingsErrorFieldWorkEntry' },
      { key: 'saida', labelKey: 'settingsErrorFieldWorkExit' },
      { key: 'intervaloInicio', labelKey: 'settingsErrorFieldBreakStart' },
      { key: 'intervaloFim', labelKey: 'settingsErrorFieldBreakEnd' },
    ];

    for (const field of timeFields) {
      if (!this.isValidTime(values[field.key])) {
        errors[field.key] = t('settingsErrorInvalidTime', [t(field.labelKey)]);
      }
    }

    if (this.isValidTime(values.entrada) && this.isValidTime(values.saida)) {
      if (this.timeToMinutes(values.entrada) >= this.timeToMinutes(values.saida)) {
        errors.saida = t('settingsErrorExitAfterEntry');
      }
    }

    if (this.isValidTime(values.intervaloInicio) && this.isValidTime(values.intervaloFim)) {
      if (this.timeToMinutes(values.intervaloInicio) >= this.timeToMinutes(values.intervaloFim)) {
        errors.intervaloFim = t('settingsErrorBreakEndAfterStart');
      }
    }

    if (values.toleranciaAtraso < 1 || values.toleranciaAtraso > 60) {
      errors.toleranciaAtraso = t('settingsErrorToleranceRange');
    }

    if (values.margemSegurancaTolerancia < 0 || values.margemSegurancaTolerancia > 60) {
      errors.margemSegurancaTolerancia = t('settingsErrorSafetyMarginRange');
    }

    if (!values.easydotsUrl) {
      errors.easydotsUrl = t('settingsErrorUrlRequired');
    } else {
      try {
        const parsed = new URL(values.easydotsUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.easydotsUrl = t('settingsErrorUrlProtocol');
        }
      } catch {
        errors.easydotsUrl = t('settingsErrorUrlInvalid');
      }
    }

    return errors;
  },

  async loadSettings() {
    this.savedSettings = await EEDSettings.load();
    this.clearFormErrors();
    this.setFormValues(this.savedSettings);
    return this.savedSettings;
  },

  handleCancel() {
    if (this.savedSettings) {
      this.clearFormErrors();
      this.setFormValues(this.savedSettings);
    }

    if (typeof this.options.onCancel === 'function') {
      this.options.onCancel();
    }
  },

  async handleReset() {
    const defaults = await EEDSettings.reset();
    this.savedSettings = defaults;
    this.clearFormErrors();
    this.setFormValues(defaults);
    this.showToast(t('settingsToastReset'), 'success');
  },

  async handleSave() {
    const values = this.getFormValues();
    const errors = this.validateForm(values);

    if (Object.keys(errors).length) {
      this.showFormErrors(errors);
      return;
    }

    this.clearFormErrors();

    await EEDSettings.save(values);
    this.savedSettings = values;
    this.setFormValues(values);
    this.showToast(t('settingsToastSaved'), 'success');

    if (typeof this.options.onSave === 'function') {
      this.options.onSave(values);
    }
  },

  showToast(message, type = 'success') {
    if (!this.toastEl) return;

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastEl.textContent = message;
    this.toastEl.className = `eed-settings-toast fadeInUp eed-animate-fast ${type}`;
    this.toastEl.classList.remove('animated');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('animated');

    this.toastTimeout = setTimeout(() => this.hideToast(), 3000);
  },

  hideToast() {
    if (!this.toastEl) return;
    this.toastEl.className = 'eed-settings-toast eed-settings-toast-hidden fadeInUp animated eed-animate-fast';
  },
};

if (typeof window !== 'undefined') {
  window.EEDSettingsUI = EEDSettingsUI;
}
