/**
 * LUNA-REG: PairsPage Controller
 * Title: IMAGE PAIRS
 * Subtitle: "Browse source and reference image combinations prepared for lunar registration."
 * 
 * Manages canonical pairs catalog, dynamic filtering, URL parameter synchronization,
 * table/card hybrid toggle, inspect details modal, and registration preparation staging.
 */

class PairsPage {
  constructor() {
    this.pairs = [];
    this.regions = [];
    this.regionsMap = {};
    this.filteredPairs = [];
    this.viewMode = 'table'; // 'table' | 'cards'
    this.filters = {
      search: '',
      overlap_status: '',
      source_instrument: '',
      reference_instrument: '',
      region_id: ''
    };
    this.loading = false;
    this.error = null;
    this.activeAbortController = null;
  }

  async init(containerEl) {
    this.container = containerEl;
    if (!this.container) return;
    this.readFiltersFromUrl();
    await this.loadData();
  }

  readFiltersFromUrl() {
    try {
      const hash = window.location.hash || '';
      const queryIdx = hash.indexOf('?');
      if (queryIdx !== -1) {
        const params = new URLSearchParams(hash.slice(queryIdx + 1));
        if (params.has('source_instrument')) this.filters.source_instrument = params.get('source_instrument');
        if (params.has('reference_instrument')) this.filters.reference_instrument = params.get('reference_instrument');
        if (params.has('overlap_status')) this.filters.overlap_status = params.get('overlap_status');
        if (params.has('region_id')) this.filters.region_id = params.get('region_id');
        if (params.has('search')) this.filters.search = params.get('search');
      }
    } catch (_) {}
  }

  syncFiltersToUrl() {
    try {
      const params = new URLSearchParams();
      if (this.filters.source_instrument) params.set('source_instrument', this.filters.source_instrument);
      if (this.filters.reference_instrument) params.set('reference_instrument', this.filters.reference_instrument);
      if (this.filters.overlap_status) params.set('overlap_status', this.filters.overlap_status);
      if (this.filters.region_id && this.filters.region_id !== 'unassigned') params.set('region_id', this.filters.region_id);
      if (this.filters.search) params.set('search', this.filters.search);

      const qs = params.toString();
      const newHash = qs ? `#/pairs?${qs}` : '#/pairs';
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash);
      }
    } catch (_) {}
  }

  async loadData() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();

    this.loading = true;
    this.error = null;
    this.render();

    try {
      // Dynamic query filters for backend
      const apiFilters = {};
      if (this.filters.source_instrument) apiFilters.source_instrument = this.filters.source_instrument;
      if (this.filters.reference_instrument) apiFilters.reference_instrument = this.filters.reference_instrument;
      if (this.filters.overlap_status) apiFilters.overlap_status = this.filters.overlap_status;
      if (this.filters.region_id && this.filters.region_id !== 'unassigned') {
        apiFilters.region_id = this.filters.region_id;
      }

      const [pairsData, regionsData] = await Promise.all([
        window.pairService.getPairs(apiFilters, { signal: this.activeAbortController.signal }),
        (this.regions.length === 0 && window.regionService)
          ? window.regionService.getRegions({ signal: this.activeAbortController.signal }).catch(() => [])
          : Promise.resolve(this.regions)
      ]);

      this.pairs = Array.isArray(pairsData) ? pairsData : [];
      if (Array.isArray(regionsData) && regionsData.length > 0) {
        this.regions = regionsData;
        this.regionsMap = {};
        this.regions.forEach(r => {
          if (r && r.id) this.regionsMap[String(r.id)] = r;
        });
      }

      this.applyClientSideFilters();
      this.syncFiltersToUrl();
    } catch (err) {
      if (err.name === 'ApiError' && err.type === 'ABORTED') {
        return;
      }
      console.error('Failed to load canonical pairs catalog:', err);
      this.error = err.message || 'Unable to communicate with canonical pairs API endpoint.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  applyClientSideFilters() {
    let result = [...this.pairs];
    const { search, region_id } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        String(p.id).includes(q) ||
        (p.source_instrument && p.source_instrument.toLowerCase().includes(q)) ||
        (p.reference_instrument && p.reference_instrument.toLowerCase().includes(q)) ||
        (p.overlap_status && p.overlap_status.toLowerCase().includes(q)) ||
        String(p.source_product_id).includes(q) ||
        String(p.reference_product_id).includes(q)
      );
    }

    if (region_id === 'unassigned') {
      result = result.filter(p => p.region_id === null || p.region_id === undefined || p.region_id === '');
    }

    this.filteredPairs = result;
  }

  isFilterActive() {
    return !!(this.filters.search || this.filters.overlap_status || this.filters.source_instrument || this.filters.reference_instrument || this.filters.region_id);
  }

  render() {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = `
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">IMAGE PAIRS</h2>
            <p class="products-view-subtitle">Browse source and reference image combinations prepared for lunar registration.</p>
          </div>
        </div>
        ${typeof renderLoadingState === 'function'
          ? renderLoadingState('RETRIEVING CANONICAL IMAGE PAIRS...')
          : '<div class="canonical-loading-state">Loading image pairs...</div>'}
      `;
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">IMAGE PAIRS</h2>
            <p class="products-view-subtitle">Browse source and reference image combinations prepared for lunar registration.</p>
          </div>
        </div>
        ${typeof renderErrorState === 'function'
          ? renderErrorState({
              title: 'IMAGE PAIRS CATALOG ERROR',
              message: 'Unable to communicate with canonical pairs API endpoint.',
              details: this.error,
              retryBtnId: 'btn-retry-pairs'
            })
          : `<div class="canonical-error-state"><div class="error-msg">${this.error}</div></div>`}
      `;

      const retryBtn = this.container.querySelector('#btn-retry-pairs');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadData());
      }
      return;
    }

    const filterBarHtml = typeof renderFilterBar === 'function'
      ? renderFilterBar({ mode: 'pairs', regions: this.regions })
      : '';

    let contentHtml = '';
    if (this.filteredPairs.length === 0) {
      contentHtml = typeof renderEmptyState === 'function'
        ? renderEmptyState({
            title: 'NO IMAGE PAIRS FOUND',
            message: 'No image pairs match the selected filters.',
            actionText: 'RESET ALL FILTERS',
            actionId: 'btn-empty-reset-pairs'
          })
        : '<div class="canonical-empty-state">No image pairs found.</div>';
    } else if (this.viewMode === 'cards') {
      contentHtml = `
        <div class="dataset-grid">
          ${this.filteredPairs.map(p => renderPairCard(p, this.regionsMap)).join('')}
        </div>
      `;
    } else {
      contentHtml = typeof renderPairTable === 'function'
        ? renderPairTable(this.filteredPairs, this.regionsMap)
        : '';
    }

    this.container.innerHTML = `
      <div class="pairs-catalog-page">
        <!-- Header Strip -->
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">IMAGE PAIRS</h2>
            <p class="products-view-subtitle">Browse source and reference image combinations prepared for lunar registration.</p>
          </div>
          <div class="products-header-telemetry">
            <span class="telemetry-pill">
              INDEXED PAIRS: <strong>${this.pairs.length}</strong>
            </span>
          </div>
        </div>

        <!-- Filter Bar -->
        ${filterBarHtml}

        <!-- Summary Bar -->
        <div class="catalog-summary-bar">
          <span>Showing <strong>${this.filteredPairs.length}</strong> of <strong>${this.pairs.length}</strong> canonical pairs</span>
          ${this.isFilterActive() ? '<span class="filter-active-tag">FILTERS APPLIED</span>' : ''}
        </div>

        <!-- Content View -->
        <div class="catalog-view-content">
          ${contentHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // View mode toggle
    const btnTable = this.container.querySelector('#btn-view-table');
    const btnCards = this.container.querySelector('#btn-view-cards');
    if (btnTable && btnCards) {
      btnTable.classList.toggle('active', this.viewMode === 'table');
      btnCards.classList.toggle('active', this.viewMode === 'cards');

      btnTable.addEventListener('click', () => {
        if (this.viewMode !== 'table') {
          this.viewMode = 'table';
          this.updateContentOnly();
        }
      });
      btnCards.addEventListener('click', () => {
        if (this.viewMode !== 'cards') {
          this.viewMode = 'cards';
          this.updateContentOnly();
        }
      });
    }

    // Search input
    const searchInput = this.container.querySelector('#filter-search');
    if (searchInput) {
      searchInput.value = this.filters.search;
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.trim();
        this.applyClientSideFilters();
        this.syncFiltersToUrl();
        this.updateContentOnly();
      });
    }

    // Overlap status filter
    const overlapSelect = this.container.querySelector('#filter-overlap');
    if (overlapSelect) {
      overlapSelect.value = this.filters.overlap_status;
      overlapSelect.addEventListener('change', async (e) => {
        this.filters.overlap_status = e.target.value;
        await this.loadData();
      });
    }

    // Source instrument filter
    const srcInstSelect = this.container.querySelector('#filter-src-inst');
    if (srcInstSelect) {
      srcInstSelect.value = this.filters.source_instrument;
      srcInstSelect.addEventListener('change', async (e) => {
        this.filters.source_instrument = e.target.value;
        await this.loadData();
      });
    }

    // Reference instrument filter
    const refInstSelect = this.container.querySelector('#filter-ref-inst');
    if (refInstSelect) {
      refInstSelect.value = this.filters.reference_instrument;
      refInstSelect.addEventListener('change', async (e) => {
        this.filters.reference_instrument = e.target.value;
        await this.loadData();
      });
    }

    // Region filter
    const regionSelect = this.container.querySelector('#filter-region');
    if (regionSelect) {
      regionSelect.value = this.filters.region_id;
      regionSelect.addEventListener('change', async (e) => {
        this.filters.region_id = e.target.value;
        if (this.filters.region_id === 'unassigned') {
          this.applyClientSideFilters();
          this.syncFiltersToUrl();
          this.updateContentOnly();
        } else {
          await this.loadData();
        }
      });
    }

    // Clear filters
    const resetBtn = this.container.querySelector('#btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        await this.clearFilters();
      });
    }

    const emptyResetBtn = this.container.querySelector('#btn-empty-reset-pairs');
    if (emptyResetBtn) {
      emptyResetBtn.addEventListener('click', async () => {
        await this.clearFilters();
      });
    }

    // Bind action buttons
    this.bindActionButtons();
  }

  async clearFilters() {
    this.filters = { search: '', overlap_status: '', source_instrument: '', reference_instrument: '', region_id: '' };
    this.syncFiltersToUrl();
    await this.loadData();
  }

  bindActionButtons() {
    // Inspect pair
    this.container.querySelectorAll('.btn-inspect-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        await this.inspectPair(pairId);
      });
    });

    // Prepare pair
    this.container.querySelectorAll('.btn-prepare-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        await this.preparePair(pairId);
      });
    });
  }

  updateContentOnly() {
    const viewContent = this.container.querySelector('.catalog-view-content');
    const summaryBar = this.container.querySelector('.catalog-summary-bar');
    if (summaryBar) {
      summaryBar.innerHTML = `
        <span>Showing <strong>${this.filteredPairs.length}</strong> of <strong>${this.pairs.length}</strong> canonical pairs</span>
        ${this.isFilterActive() ? '<span class="filter-active-tag">FILTERS APPLIED</span>' : ''}
      `;
    }

    const btnTable = this.container.querySelector('#btn-view-table');
    const btnCards = this.container.querySelector('#btn-view-cards');
    if (btnTable && btnCards) {
      btnTable.classList.toggle('active', this.viewMode === 'table');
      btnCards.classList.toggle('active', this.viewMode === 'cards');
    }

    if (!viewContent) return;

    if (this.filteredPairs.length === 0) {
      viewContent.innerHTML = typeof renderEmptyState === 'function'
        ? renderEmptyState({
            title: 'NO IMAGE PAIRS FOUND',
            message: 'No image pairs match the selected filters.',
            actionText: 'RESET ALL FILTERS',
            actionId: 'btn-empty-reset-pairs'
          })
        : '<div class="canonical-empty-state">No image pairs found.</div>';

      const emptyResetBtn = viewContent.querySelector('#btn-empty-reset-pairs');
      if (emptyResetBtn) {
        emptyResetBtn.addEventListener('click', () => this.clearFilters());
      }
      return;
    }

    if (this.viewMode === 'cards') {
      viewContent.innerHTML = `
        <div class="dataset-grid">
          ${this.filteredPairs.map(p => renderPairCard(p, this.regionsMap)).join('')}
        </div>
      `;
    } else {
      viewContent.innerHTML = renderPairTable(this.filteredPairs, this.regionsMap);
    }

    this.bindActionButtons();
  }

  async inspectPair(pairId) {
    if (!pairId) return;
    try {
      const regInput = await window.pairService.getRegistrationInput(pairId);
      if (window.openAppModal) {
        window.openAppModal(`PAIR DETAILS #${pairId}`, renderMetadataPanel(regInput, 'pair'));
        
        const modalPrepareBtn = document.getElementById('btn-modal-prepare-pair');
        if (modalPrepareBtn) {
          modalPrepareBtn.addEventListener('click', () => {
            if (window.closeAppModal) window.closeAppModal();
            this.preparePair(pairId);
          });
        }
      }
    } catch (err) {
      alert(`Failed to load pair telemetry: ${err.message}`);
    }
  }

  async preparePair(pairId) {
    if (!pairId) return;
    if (window.registrationPreparationPage) {
      await window.registrationPreparationPage.stagePair(pairId);
    }
    if (typeof window.switchView === 'function') {
      window.switchView('new-reg');
    }
  }
}

window.pairsPage = new PairsPage();

