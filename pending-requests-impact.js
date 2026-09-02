/**
 * Pending requests impact summary for /humanresources/solicitacao/index
 * Loaded after content.js defines EASydots; patches methods onto it.
 *
 * Use globalThis (not window): Firefox content scripts have window === page window.
 */
(function attachPendingRequestsImpact(global) {
  const fxLog =
    (typeof global.eedFirefoxDebugLog === 'function' && global.eedFirefoxDebugLog) ||
    (typeof global.EEDBrowser !== 'undefined' && global.EEDBrowser.firefoxDebugLog) ||
    (() => {});

  const host = global.EASydots;
  if (!host) {
    console.error(
      '[Better Easy Dots] pending-requests-impact: EASydots não encontrado. A barra de pendentes não será ativada.'
    );
    fxLog('pending-requests-impact: EASydots missing', {
      hasGlobalThisEASydots: Boolean(global.EASydots),
      hasWindowEASydots: typeof window !== 'undefined' && Boolean(window.EASydots),
      href: typeof location !== 'undefined' ? location.href : '',
    });
    return;
  }

  const PENDING_STATUS = new Set(['pendente', 'pending']);
  const SUMMARY_CLASS = 'eed-pending-requests-summary';
  const SUMMARY_SELECTOR = `.${SUMMARY_CLASS}`;
  const GRID_WAIT_MS = 12000;
  const EASYDOTS_ORIGIN = 'https://sys.easydots.com.br';

  Object.assign(host, {
    pendingRequestImpactCache: host.pendingRequestImpactCache || new Map(),
    pendingImpactRunId: 0,
    pendingImpactTimer: null,
    pendingImpactBusy: false,
    pendingGridWaiter: null,
    pendingPjaxObserver: null,
    pendingPjaxObserverReady: false,
    PENDING_IMPACT_DEBOUNCE_MS: 200,
    PENDING_IMPACT_CONCURRENCY: 3,

    getDecodedPathname() {
      const rawPath = String((typeof location !== 'undefined' && location.pathname) || '');
      try {
        return decodeURIComponent(rawPath);
      } catch {
        return rawPath;
      }
    },

    isLocalMirrorHost() {
      const hostname = String((typeof location !== 'undefined' && location.hostname) || '').toLowerCase();
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '192.168.0.104';
    },

    isSolicitacaoIndexPage() {
      const path = this.getDecodedPathname();
      if (/\/humanresources\/solicitacao\/index\/?$/i.test(path)) return true;
      // Local HTML mirrors / Live Server (pathname may stay percent-encoded in Firefox)
      if (/Controle de Solicita/i.test(path) || /Controle de Solicita/i.test(document.title || '')) {
        return Boolean(document.querySelector('#solicitacao'));
      }
      if (document.querySelector('#solicitacao .grid-view table, #solicitacao table')) return true;
      return Boolean(document.querySelector('#solicitacao[data-pjax-container], #solicitacao'));
    },

    getSolicitacaoGridRoot() {
      const fromGrid =
        document.querySelector('#solicitacao .grid-view') ||
        document.querySelector('#solicitacao table.table')?.closest('.grid-view') ||
        document.querySelector('#solicitacao table')?.closest('.grid-view');
      if (fromGrid) return fromGrid;

      const table = document.querySelector('#solicitacao table.table, #solicitacao table');
      if (table) return table.closest('.grid-view') || table.parentElement || table;

      return null;
    },

    schedulePendingRequestsSummary(reason = 'mutation') {
      if (!this.isExtensionAlive()) return;

      this.setupSolicitacaoPjaxObserverOnce();

      const isPage = this.isSolicitacaoIndexPage();
      const grid = this.getSolicitacaoGridRoot();
      fxLog('schedulePendingRequestsSummary', {
        reason,
        isPage,
        hasGrid: Boolean(grid),
        path: this.getDecodedPathname(),
        href: typeof location !== 'undefined' ? location.href : '',
      });

      if (!isPage && !grid) {
        this.removePendingRequestsSummary();
        this.debugLog('pending-impact skip: not solicitacao page');
        return;
      }

      this.debugLog('schedulePendingRequestsSummary', reason, {
        path: this.getDecodedPathname(),
        grid: Boolean(grid),
      });

      if (!grid) {
        this.waitForSolicitacaoGridAndRender();
        return;
      }

      clearTimeout(this.pendingImpactTimer);
      this.pendingImpactTimer = setTimeout(() => {
        this.pendingImpactTimer = null;
        this.ensurePendingRequestsSummary().catch((error) => {
          this.warnFeature('impacto solicitações pendentes', error);
        });
      }, this.PENDING_IMPACT_DEBOUNCE_MS);
    },

    waitForSolicitacaoGridAndRender() {
      if (this.pendingGridWaiter || !this.isExtensionAlive()) return;

      fxLog('waiting for #solicitacao grid', {
        path: this.getDecodedPathname(),
        hasSolicitacao: Boolean(document.querySelector('#solicitacao')),
      });

      const started = Date.now();
      const tryRender = () => {
        if (!this.isExtensionAlive()) return true;
        if (!this.getSolicitacaoGridRoot()) return false;
        this.ensurePendingRequestsSummary().catch((error) => {
          this.warnFeature('impacto solicitações pendentes', error);
        });
        return true;
      };

      if (tryRender()) return;

      const observer = new MutationObserver(() => {
        if (tryRender() || Date.now() - started > GRID_WAIT_MS) {
          observer.disconnect();
          this.pendingGridWaiter = null;
        }
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      this.pendingGridWaiter = observer;

      setTimeout(() => {
        if (this.pendingGridWaiter !== observer) return;
        observer.disconnect();
        this.pendingGridWaiter = null;
        if (this.getSolicitacaoGridRoot()) {
          this.ensurePendingRequestsSummary().catch((error) => {
            this.warnFeature('impacto solicitações pendentes', error);
          });
        } else {
          fxLog('grid wait timed out', { path: this.getDecodedPathname() });
        }
      }, GRID_WAIT_MS);
    },

    setupSolicitacaoPjaxObserverOnce() {
      if (this.pendingPjaxObserver || !this.isExtensionAlive()) return;

      const container = document.querySelector('#solicitacao[data-pjax-container], #solicitacao');
      if (!container) return;
      this.pendingPjaxObserverReady = true;

      try {
        this.pendingPjaxObserver?.disconnect();
      } catch {
        /* ignore */
      }

      const observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) => {
          const target = mutation.target;
          const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
          return !element?.closest?.('.eed-pending-requests-summary');
        });
        if (!relevant) return;
        this.schedulePendingRequestsSummary('pjax');
      });
      observer.observe(container, { childList: true, subtree: true });
      this.pendingPjaxObserver = observer;
      fxLog('PJAX observer attached on #solicitacao');
    },

    removePendingRequestsSummary() {
      document.querySelectorAll(SUMMARY_SELECTOR).forEach((el) => el.remove());
    },

    extractPendingRequestsFromGrid(gridRoot = this.getSolicitacaoGridRoot()) {
      if (!gridRoot) return [];

      const table = gridRoot.matches?.('table') ? gridRoot : gridRoot.querySelector('table');
      const rows = (table || gridRoot).querySelectorAll('tbody tr');
      const requests = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        const cellText = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();
        let statusText = cellText(cells[6]);
        if (!PENDING_STATUS.has(statusText.toLowerCase())) {
          const statusCell = [...cells].find((td) =>
            PENDING_STATUS.has(cellText(td).toLowerCase())
          );
          if (!statusCell) return;
          statusText = cellText(statusCell);
        }

        const id = String(row.getAttribute('data-key') || '').trim();
        const viewAnchor =
          row.querySelector('a[href*="/solicitacao/view/"]') ||
          row.querySelector('a.loading[href*="/view/"]') ||
          row.querySelector('a[href*="/view/"]');
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
          reason: cellText(cells[1]),
          status: statusText,
          date: cellText(cells[2]),
          endDate: cellText(cells[3]),
          viewUrl,
          impactSeconds: null,
          confidence: 'unknown',
        });
      });

      fxLog('extractPendingRequestsFromGrid', {
        table: Boolean(table),
        rowCount: rows.length,
        pendingCount: requests.length,
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

    resolveSolicitacaoViewUrl(href) {
      if (!href) return null;

      const isLocalMirror = this.isLocalMirrorHost();
      if (
        href.startsWith('/humanresources/solicitacao/view/') ||
        href.startsWith('/solicitacao/view/')
      ) {
        if (isLocalMirror) {
          return `${EASYDOTS_ORIGIN}${href.startsWith('/humanresources/') ? href : `/humanresources${href}`}`;
        }
        try {
          return new URL(href, location.origin).href;
        } catch {
          return href;
        }
      }

      try {
        const resolved = new URL(href, location.href);
        if (
          isLocalMirror &&
          resolved.origin === location.origin &&
          /\/solicitacao\/view\//i.test(resolved.pathname)
        ) {
          return `${EASYDOTS_ORIGIN}${resolved.pathname}${resolved.search}`;
        }
        return resolved.href;
      } catch {
        return href;
      }
    },

    async fetchHtmlDocument(absoluteUrl) {
      fxLog('fetchHtmlDocument', absoluteUrl);
      try {
        const response = await fetch(absoluteUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } catch (pageError) {
        fxLog('fetchHtmlDocument page fetch failed, trying background', {
          url: absoluteUrl,
          error: String(pageError?.message || pageError),
        });
        try {
          const viaBg = await EEDBrowser.runtime.sendMessage({ action: 'fetchHtml', url: absoluteUrl });
          if (viaBg?.ok && viaBg.html) {
            fxLog('fetchHtmlDocument background fallback ok', absoluteUrl);
            return viaBg.html;
          }
          fxLog('fetchHtmlDocument background fallback failed', viaBg);
        } catch (bgError) {
          fxLog('fetchHtmlDocument background error', String(bgError?.message || bgError));
        }
        throw pageError;
      }
    },

    async fetchRequestDetails(id, url) {
      const cached = this.pendingRequestImpactCache.get(id);
      if (cached?.promise) return cached.promise;
      if (cached?.result) return cached.result;

      const absoluteUrl = this.resolveSolicitacaoViewUrl(url) || url;

      const promise = (async () => {
        const html = await this.fetchHtmlDocument(absoluteUrl);
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
      const isPage = this.isSolicitacaoIndexPage();
      this.debugLog('ensurePendingRequestsSummary', {
        hasGrid: Boolean(gridRoot),
        isPage,
      });
      fxLog('ensurePendingRequestsSummary', {
        hasGrid: Boolean(gridRoot),
        isPage,
        solicitacao: Boolean(document.querySelector('#solicitacao')),
        table: Boolean(document.querySelector('#solicitacao .grid-view table, #solicitacao table')),
        existingBar: Boolean(document.querySelector(SUMMARY_SELECTOR)),
      });

      if (!gridRoot) {
        if (isPage) {
          this.waitForSolicitacaoGridAndRender();
        } else {
          this.removePendingRequestsSummary();
          this.debugLog('pending-impact: grid not found');
        }
        return;
      }

      // Drop duplicates outside current grid (PJAX can leave orphans briefly)
      document.querySelectorAll(SUMMARY_SELECTOR).forEach((el) => {
        if (!gridRoot.contains(el)) el.remove();
      });

      const bar = this.ensurePendingRequestsSummaryBarElement(gridRoot);
      const requests = this.extractPendingRequestsFromGrid(gridRoot);
      this.debugLog('pending-impact requests', requests.map((r) => ({ id: r.id, status: r.status })));
      fxLog('found pending rows', requests.map((r) => ({ id: r.id, status: r.status, viewUrl: r.viewUrl })));

      if (requests.length === 0) {
        this.renderPendingRequestsSummaryBar(bar, { mode: 'empty' });
        fxLog('rendered summary bar', { state: 'empty', selector: SUMMARY_SELECTOR });
        return;
      }

      const runId = ++this.pendingImpactRunId;
      this.renderPendingRequestsSummaryBar(bar, { mode: 'loading' });
      fxLog('rendered summary bar', { state: 'loading', pending: requests.length });

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
        fxLog('rendered summary bar', {
          state: result.failed ? 'error' : result.complete ? 'ready' : 'unknown',
          pendingCount: result.pendingCount,
          calculatedCount: result.calculatedCount,
          failed: result.failed,
        });
      } catch (error) {
        if (runId !== this.pendingImpactRunId) return;
        this.warnFeature('impacto solicitações pendentes', error);
        fxLog('calculatePendingRequestsImpact threw', String(error?.message || error));
        if (document.contains(bar)) {
          this.renderPendingRequestsSummaryBar(bar, { mode: 'error' });
          fxLog('rendered summary bar', { state: 'error' });
        }
      }
    },
  });

  global.EEDPendingRequestsImpact = {
    init(reason = 'init') {
      host.schedulePendingRequestsSummary(reason);
    },
    refresh(reason = 'refresh') {
      host.schedulePendingRequestsSummary(reason);
    },
    renderSummaryBar(state = { mode: 'error' }) {
      const gridRoot = host.getSolicitacaoGridRoot();
      if (!gridRoot) return null;
      const bar = host.ensurePendingRequestsSummaryBarElement(gridRoot);
      host.renderPendingRequestsSummaryBar(bar, state);
      return bar;
    },
  };

  console.info('[Better Easy Dots] pending-requests-impact ativo');
  console.info('[Better Easy Dots] pending requests');
  fxLog('pending-requests-impact attached', {
    hasInit: typeof global.EEDPendingRequestsImpact.init === 'function',
    href: typeof location !== 'undefined' ? location.href : '',
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

// Boot after EASydots methods from content.js + this patch are ready.
globalThis.__eedBoot?.();
