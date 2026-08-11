/**
 * Pending requests impact summary for /humanresources/solicitacao/index
 * Loaded after content.js defines EASydots; patches methods onto it.
 */
(function attachPendingRequestsImpact(global) {
  const host = global.EASydots;
  if (!host) {
    console.error(
      '[Better Easy Dots] pending-requests-impact: EASydots não encontrado. A barra de pendentes não será ativada.'
    );
    return;
  }

  const PENDING_STATUS = new Set(['pendente', 'pending']);
  const SUMMARY_CLASS = 'eed-pending-requests-summary';
  const SUMMARY_SELECTOR = `.${SUMMARY_CLASS}`;

  Object.assign(host, {
    pendingRequestImpactCache: host.pendingRequestImpactCache || new Map(),
    pendingImpactRunId: 0,
    pendingImpactTimer: null,
    pendingImpactBusy: false,
    PENDING_IMPACT_DEBOUNCE_MS: 200,
    PENDING_IMPACT_CONCURRENCY: 3,

    isSolicitacaoIndexPage() {
      const path = String(window.location.pathname || '');
      if (/\/humanresources\/solicitacao\/index\/?$/i.test(path)) return true;
      // Local HTML mirrors / Live Server
      if (/Controle de Solicita/i.test(path) || /Controle de Solicita/i.test(document.title || '')) {
        return Boolean(document.querySelector('#solicitacao .grid-view, #solicitacao table.table'));
      }
      return Boolean(document.querySelector('#solicitacao[data-pjax-container] .grid-view'));
    },

    getSolicitacaoGridRoot() {
      return (
        document.querySelector('#solicitacao .grid-view') ||
        document.querySelector('#solicitacao table.table')?.closest('.grid-view') ||
        null
      );
    },

    schedulePendingRequestsSummary(reason = 'mutation') {
      if (!this.isExtensionAlive()) return;
      if (!this.isSolicitacaoIndexPage() && !this.getSolicitacaoGridRoot()) {
        this.removePendingRequestsSummary();
        this.debugLog('pending-impact skip: not solicitacao page');
        return;
      }

      this.debugLog('schedulePendingRequestsSummary', reason, {
        path: window.location.pathname,
        grid: Boolean(this.getSolicitacaoGridRoot()),
      });
      clearTimeout(this.pendingImpactTimer);
      this.pendingImpactTimer = setTimeout(() => {
        this.pendingImpactTimer = null;
        this.ensurePendingRequestsSummary().catch((error) => {
          this.warnFeature('impacto solicitações pendentes', error);
        });
      }, this.PENDING_IMPACT_DEBOUNCE_MS);
    },

    removePendingRequestsSummary() {
      document.querySelectorAll(SUMMARY_SELECTOR).forEach((el) => el.remove());
    },

    extractPendingRequestsFromGrid(gridRoot = this.getSolicitacaoGridRoot()) {
      if (!gridRoot) return [];

      const rows = gridRoot.querySelectorAll('table tbody tr[data-key]');
      const requests = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return;

        const statusText = (cells[6]?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!PENDING_STATUS.has(statusText.toLowerCase())) return;

        const id = String(row.getAttribute('data-key') || '').trim();
        const viewAnchor =
          row.querySelector('a[href*="/solicitacao/view/"]') ||
          row.querySelector('a.loading[href*="/view/"]');
        const href = viewAnchor?.getAttribute('href') || '';
        const idFromHref = (href.match(/\/solicitacao\/view\/(\d+)/i) ||
          href.match(/\/view\/(\d+)/i) ||
          [])[1];
        const requestId = id || idFromHref;
        if (!requestId) return;

        let viewUrl = href;
        if (!viewUrl) {
          viewUrl = `/humanresources/solicitacao/view/${requestId}`;
        }

        requests.push({
          id: String(requestId),
          reason: (cells[1]?.textContent || '').replace(/\s+/g, ' ').trim(),
          status: statusText,
          date: (cells[2]?.textContent || '').replace(/\s+/g, ' ').trim(),
          endDate: (cells[3]?.textContent || '').replace(/\s+/g, ' ').trim(),
          viewUrl,
          impactSeconds: null,
          confidence: 'unknown',
        });
      });

      return requests;
    },

    normalizeDetailLabel(text) {
      return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    },

    findDetailFieldValue(doc, labelMatchers) {
      const labels = doc.querySelectorAll('label.control-label, label');
      const matchers = labelMatchers.map((m) => this.normalizeDetailLabel(m));

      for (const label of labels) {
        const labelText = this.normalizeDetailLabel(label.textContent);
        if (!matchers.some((m) => labelText === m || labelText.startsWith(m))) continue;

        const group = label.closest('.form-group') || label.parentElement;
        if (!group) continue;

        const field =
          group.querySelector('input.form-control, input[type="text"], textarea.form-control, textarea') ||
          label.nextElementSibling;

        if (!field) continue;
        const value = (field.value != null ? field.value : field.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        return value;
      }

      return '';
    },

    parseBRDateParts(dateStr) {
      const match = String(dateStr || '')
        .trim()
        .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      if (!day || !month || !year) return null;
      return { day, month, year };
    },

    parseClockToSeconds(timeStr) {
      const cleaned = String(timeStr || '').trim();
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleaned)) return null;
      const seconds = this.timeToSeconds(cleaned);
      return Number.isFinite(seconds) ? seconds : null;
    },

    datetimeToEpochSeconds(dateStr, timeStr) {
      const parts = this.parseBRDateParts(dateStr);
      const timeSeconds = this.parseClockToSeconds(timeStr);
      if (!parts || timeSeconds == null) return null;

      const hours = Math.floor(timeSeconds / 3600);
      const minutes = Math.floor((timeSeconds % 3600) / 60);
      const seconds = timeSeconds % 60;
      const ms = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, seconds);
      if (!Number.isFinite(ms)) return null;
      return Math.floor(ms / 1000);
    },

    parseRequestImpactFromDetail(doc, base = {}) {
      const reason =
        this.findDetailFieldValue(doc, ['Motivo', 'Reason']) || base.reason || '';
      const status =
        this.findDetailFieldValue(doc, ['Situação', 'Situacao', 'Status']) ||
        base.status ||
        '';
      const startDate =
        this.findDetailFieldValue(doc, ['Data Início', 'Data Inicio', 'Start Date']) ||
        base.date ||
        '';
      const endDate =
        this.findDetailFieldValue(doc, ['Data fim', 'Data Fim', 'End Date']) ||
        base.endDate ||
        startDate;
      const startTime = this.findDetailFieldValue(doc, [
        'Hora Início',
        'Hora Inicio',
        'Start Time',
      ]);
      const endTime = this.findDetailFieldValue(doc, ['Hora Fim', 'End Time']);

      const result = {
        id: base.id,
        reason,
        status,
        date: startDate || base.date || '',
        endDate: endDate || '',
        startTime: startTime || '',
        endTime: endTime || '',
        impactSeconds: null,
        confidence: 'unknown',
      };

      const startSec = this.parseClockToSeconds(startTime);
      const endSec = this.parseClockToSeconds(endTime);
      if (startSec == null || endSec == null) {
        return result;
      }

      const sameDate =
        !startDate ||
        !endDate ||
        this.normalizeDetailLabel(startDate) === this.normalizeDetailLabel(endDate);

      if (sameDate) {
        if (endSec <= startSec) return result;
        result.impactSeconds = endSec - startSec;
        result.confidence = 'high';
        return result;
      }

      const startEpoch = this.datetimeToEpochSeconds(startDate, startTime);
      const endEpoch = this.datetimeToEpochSeconds(endDate, endTime);
      if (startEpoch == null || endEpoch == null || endEpoch <= startEpoch) {
        return result;
      }

      result.impactSeconds = endEpoch - startEpoch;
      result.confidence = 'high';
      return result;
    },

    async fetchRequestDetails(id, url) {
      const cached = this.pendingRequestImpactCache.get(id);
      if (cached?.promise) return cached.promise;
      if (cached?.result) return cached.result;

      const absoluteUrl = (() => {
        try {
          return new URL(url, window.location.origin).href;
        } catch {
          return url;
        }
      })();

      const promise = (async () => {
        const response = await fetch(absoluteUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'text/html' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return { html, doc };
      })();

      this.pendingRequestImpactCache.set(id, { promise });

      try {
        const fetched = await promise;
        this.pendingRequestImpactCache.set(id, { result: fetched, fetchedAt: Date.now() });
        return fetched;
      } catch (error) {
        this.pendingRequestImpactCache.delete(id);
        throw error;
      }
    },

    async mapWithConcurrency(items, limit, mapper) {
      const results = new Array(items.length);
      let nextIndex = 0;

      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
          const current = nextIndex;
          nextIndex += 1;
          results[current] = await mapper(items[current], current);
        }
      });

      await Promise.all(workers);
      return results;
    },

    async calculatePendingRequestsImpact(requests, runId) {
      const enriched = await this.mapWithConcurrency(
        requests,
        this.PENDING_IMPACT_CONCURRENCY,
        async (request) => {
          if (runId !== this.pendingImpactRunId) {
            return { ...request, impactSeconds: null, confidence: 'unknown', aborted: true };
          }

          try {
            const { doc } = await this.fetchRequestDetails(request.id, request.viewUrl);
            if (runId !== this.pendingImpactRunId) {
              return { ...request, impactSeconds: null, confidence: 'unknown', aborted: true };
            }
            return this.parseRequestImpactFromDetail(doc, request);
          } catch (error) {
            this.debugLog('fetchRequestDetails failed', request.id, error);
            return {
              ...request,
              impactSeconds: null,
              confidence: 'unknown',
              fetchError: true,
            };
          }
        }
      );

      const usable = enriched.filter((item) => !item.aborted);
      const calculated = usable.filter(
        (item) => item.impactSeconds != null && Number.isFinite(item.impactSeconds)
      );
      const unknown = usable.filter(
        (item) => item.impactSeconds == null || !Number.isFinite(item.impactSeconds)
      );
      const totalSeconds = calculated.reduce((sum, item) => sum + item.impactSeconds, 0);
      const fetchErrors = usable.filter((item) => item.fetchError).length;

      return {
        pendingCount: usable.length,
        calculatedCount: calculated.length,
        unknownCount: unknown.length,
        fetchErrors,
        totalSeconds,
        items: usable,
        complete: unknown.length === 0 && usable.length > 0,
        partial: calculated.length > 0 && unknown.length > 0,
        failed: usable.length > 0 && calculated.length === 0 && fetchErrors === usable.length,
      };
    },

    ensurePendingRequestsSummaryBarElement(gridRoot) {
      let bar = gridRoot.querySelector(SUMMARY_SELECTOR);
      if (bar) return bar;

      // Prefer after summary / near grid footer
      const summary = gridRoot.querySelector('.summary');
      bar = document.createElement('div');
      bar.className = SUMMARY_CLASS;
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');

      if (summary?.parentElement) {
        summary.insertAdjacentElement('afterend', bar);
      } else {
        gridRoot.appendChild(bar);
      }

      this.installPendingRequestsSummaryTooltips(bar);
      return bar;
    },

    installPendingRequestsSummaryTooltips(bar) {
      if (!bar || bar.dataset.eedTooltipReady === 'true') return;
      bar.dataset.eedTooltipReady = 'true';

      bar.addEventListener('mouseover', (event) => {
        const target = event.target.closest('[data-eed-tooltip]');
        if (!target || !bar.contains(target)) return;
        this.showDiffTooltip(target);
      });

      bar.addEventListener('mouseout', (event) => {
        const target = event.target.closest('[data-eed-tooltip]');
        if (!target) return;
        const related = event.relatedTarget;
        if (related && target.contains(related)) return;
        if (this.diffTooltipAnchor === target) {
          this.hideDiffTooltip();
        }
      });
    },

    buildPendingImpactText(result) {
      if (!result || result.pendingCount === 0) {
        return {
          title: t('contentPendingImpactBrand'),
          primary: t('contentPendingImpactNone'),
          secondary: '',
          gainText: '',
        };
      }

      const gainText =
        result.calculatedCount > 0
          ? `+${this.formatSecondsToHHMMSS(result.totalSeconds)}`
          : '';

      if (result.failed) {
        return {
          title: t('contentPendingImpactBrand'),
          primary: t('contentPendingImpactError'),
          secondary: '',
          gainText: '',
        };
      }

      if (result.complete) {
        if (result.pendingCount === 1) {
          return {
            title: t('contentPendingImpactBrand'),
            primary: t('contentPendingImpactCompleteSingular', [gainText]),
            secondary: '',
            gainText,
          };
        }
        return {
          title: t('contentPendingImpactBrand'),
          primary: t('contentPendingImpactComplete', [
            String(result.pendingCount),
            gainText,
          ]),
          secondary: '',
          gainText,
        };
      }

      if (result.partial) {
        return {
          title: t('contentPendingImpactBrand'),
          primary: t('contentPendingImpactPartial', [
            String(result.pendingCount),
            gainText,
          ]),
          secondary: t('contentPendingImpactUnknownCount', [String(result.unknownCount)]),
          gainText,
        };
      }

      // Pending found but nothing calculable yet / still unknown
      return {
        title: t('contentPendingImpactBrand'),
        primary: t('contentPendingImpactNotCalculated', [String(result.pendingCount)]),
        secondary: t('contentPendingImpactOpenDetailsHint'),
        gainText: '',
      };
    },

    renderPendingRequestsSummaryBar(bar, state) {
      if (!bar) return;

      const tooltip = t('contentPendingImpactTooltip');
      const iconUrl = this.getExtensionAssetUrl('icons/easy-easy-dots.png');

      let title = t('contentPendingImpactBrand');
      let primary = '';
      let secondary = '';
      let gainText = '';
      let stateClass = 'eed-pending-requests-summary--idle';

      if (state.mode === 'loading') {
        primary = t('contentPendingImpactLoading');
        stateClass = 'eed-pending-requests-summary--loading';
      } else if (state.mode === 'error') {
        primary = t('contentPendingImpactError');
        stateClass = 'eed-pending-requests-summary--error';
      } else if (state.mode === 'empty') {
        primary = t('contentPendingImpactNone');
        stateClass = 'eed-pending-requests-summary--empty';
      } else if (state.result) {
        const built = this.buildPendingImpactText(state.result);
        title = built.title;
        primary = built.primary;
        secondary = built.secondary;
        gainText = built.gainText;
        if (state.result.failed) stateClass = 'eed-pending-requests-summary--error';
        else if (state.result.complete) stateClass = 'eed-pending-requests-summary--ready';
        else if (state.result.partial) stateClass = 'eed-pending-requests-summary--partial';
        else stateClass = 'eed-pending-requests-summary--unknown';
      }

      const escapeHtml = (value) =>
        String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      let primaryHtml = escapeHtml(primary);
      if (gainText && primary.includes(gainText)) {
        primaryHtml = primaryHtml.replace(
          escapeHtml(gainText),
          `<strong class="eed-pending-requests-summary__gain">${escapeHtml(gainText)}</strong>`
        );
      }

      bar.className = `${SUMMARY_CLASS} ${stateClass}`;
      bar.innerHTML = `
        <div class="eed-pending-requests-summary__inner" data-eed-tooltip-host="true">
          <div class="eed-pending-requests-summary__brand">
            ${
              iconUrl
                ? `<img src="${iconUrl}" alt="" class="eed-pending-requests-summary__icon" aria-hidden="true">`
                : ''
            }
            <span class="eed-pending-requests-summary__brand-text">${escapeHtml(title)}</span>
          </div>
          <div class="eed-pending-requests-summary__body">
            <p class="eed-pending-requests-summary__primary">${primaryHtml}</p>
            ${
              secondary
                ? `<p class="eed-pending-requests-summary__secondary">${escapeHtml(secondary)}</p>`
                : ''
            }
          </div>
        </div>
      `;

      const hostEl = bar.querySelector('[data-eed-tooltip-host="true"]') || bar;
      this.setTooltipTarget(hostEl, tooltip);
    },

    async ensurePendingRequestsSummary() {
      if (!this.isExtensionAlive()) return;

      const gridRoot = this.getSolicitacaoGridRoot();
      this.debugLog('ensurePendingRequestsSummary', {
        hasGrid: Boolean(gridRoot),
        isPage: this.isSolicitacaoIndexPage(),
      });

      if (!gridRoot) {
        this.removePendingRequestsSummary();
        this.debugLog('pending-impact: grid not found');
        return;
      }

      // Drop duplicates outside current grid (PJAX can leave orphans briefly)
      document.querySelectorAll(SUMMARY_SELECTOR).forEach((el) => {
        if (!gridRoot.contains(el)) el.remove();
      });

      const bar = this.ensurePendingRequestsSummaryBarElement(gridRoot);
      const requests = this.extractPendingRequestsFromGrid(gridRoot);
      this.debugLog('pending-impact requests', requests.map((r) => ({ id: r.id, status: r.status })));

      if (requests.length === 0) {
        this.renderPendingRequestsSummaryBar(bar, { mode: 'empty' });
        return;
      }

      const runId = ++this.pendingImpactRunId;
      this.renderPendingRequestsSummaryBar(bar, { mode: 'loading' });

      try {
        const result = await this.calculatePendingRequestsImpact(requests, runId);
        if (runId !== this.pendingImpactRunId || !this.isExtensionAlive()) return;
        if (!document.contains(bar)) return;

        this.debugLog('pending-impact result', {
          pendingCount: result.pendingCount,
          calculatedCount: result.calculatedCount,
          unknownCount: result.unknownCount,
          totalSeconds: result.totalSeconds,
          failed: result.failed,
        });
        this.renderPendingRequestsSummaryBar(bar, { mode: 'ready', result });
      } catch (error) {
        if (runId !== this.pendingImpactRunId) return;
        this.warnFeature('impacto solicitações pendentes', error);
        if (document.contains(bar)) {
          this.renderPendingRequestsSummaryBar(bar, { mode: 'error' });
        }
      }
    },
  });

  console.info('[Better Easy Dots] pending-requests-impact ativo');
})(typeof window !== 'undefined' ? window : globalThis);

// Boot after EASydots methods from content.js + this patch are ready.
globalThis.__eedBoot?.();
