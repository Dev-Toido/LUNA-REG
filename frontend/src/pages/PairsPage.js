/**
 * LUNA-REG: PairsPage Controller
 * Manages canonical pairs catalog, filtering, table/card toggle, metadata inspection, and registration staging
 */

class PairsPage {
  constructor() {
    this.pairs = [];
    this.regions = [];
    this.filteredPairs = [];
    this.viewMode = 'cards'; // 'cards' | 'table'
    this.filters = {
      search: '',
      overlap_status: '',
      source_instrument: '',
      reference_instrument: '',
      region_id: ''
    };
    this.loading = false;
    this.error = null;
  }

  async init(containerEl) {
    this.container = containerEl;
    if (!this.container) return;
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const [pairsData, regionsData] = await Promise.all([
        window.pairService.listPairs(),
        window.regionService ? window.regionService.listRegions().catch(() => []) : []
      ]);

      this.pairs = Array.isArray(pairsData) ? pairsData : [];
      this.regions = Array.isArray(regionsData) ? regionsData : [];
      this.applyFilters();
    } catch (err) {
      console.error('Failed to load pairs catalog:', err);
      this.error = err.message || 'Failed to communicate with pairs catalog API.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  applyFilters() {
    let result = [...this.pairs];
    const { search, overlap_status, source_instrument, reference_instrument, region_id } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        String(p.id).includes(q) ||
        (p.source_instrument && p.source_instrument.toLowerCase().includes(q)) ||
        (p.reference_instrument && p.reference_instrument.toLowerCase().includes(q)) ||
        (p.overlap_status && p.overlap_status.toLowerCase().includes(q))
      );
    }

    if (overlap_status) {
      result = result.filter(p => p.overlap_status === overlap_status);
    }

    if (source_instrument) {
      result = result.filter(p => p.source_instrument === source_instrument);
    }

    if (reference_instrument) {
      result = result.filter(p => p.reference_instrument === reference_instrument);
    }

    if (region_id) {
      result = result.filter(p => String(p.region_id) === String(region_id));
    }

    this.filteredPairs = result;
  }

  render() {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = typeof renderLoadingState === 'function'
        ? renderLoadingState('RETRIEVING CANONICAL IMAGE PAIRS...')
        : '<div class="loading">Loading image pairs...</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = typeof renderErrorState === 'function'
        ? renderErrorState({
            title: 'IMAGE PAIRS CATALOG ERROR',
            message: 'Unable to communicate with canonical pairs API endpoint.',
            details: this.error,
            retryBtnId: 'btn-retry-pairs'
          })
        : `<div class="error-msg">${this.error}</div>`;

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
    if (this.viewMode === 'cards') {
      contentHtml = `<div class="dataset-grid">
        ${this.filteredPairs.map(p => renderPairCard(p)).join('')}
      </div>`;
    } else {
      contentHtml = typeof renderPairTable === 'function'
        ? renderPairTable(this.filteredPairs)
        : '';
    }

    this.container.innerHTML = `
      <div class="pairs-catalog-page">
        ${filterBarHtml}
        <div class="catalog-summary-bar">
          <span>Showing <strong>${this.filteredPairs.length}</strong> of <strong>${this.pairs.length}</strong> canonical pairs</span>
        </div>
        <div class="catalog-view-content">
          ${this.filteredPairs.length === 0 ? renderEmptyState({ title: 'NO PAIRS FOUND', message: 'Try adjusting your search or instrument filters.' }) : contentHtml}
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
        this.viewMode = 'table';
        this.render();
      });
      btnCards.addEventListener('click', () => {
        this.viewMode = 'cards';
        this.render();
      });
    }

    // Filter controls
    const searchInput = this.container.querySelector('#filter-search');
    if (searchInput) {
      searchInput.value = this.filters.search;
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.trim();
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const overlapSelect = this.container.querySelector('#filter-overlap');
    if (overlapSelect) {
      overlapSelect.value = this.filters.overlap_status;
      overlapSelect.addEventListener('change', (e) => {
        this.filters.overlap_status = e.target.value;
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const srcInstSelect = this.container.querySelector('#filter-src-inst');
    if (srcInstSelect) {
      srcInstSelect.value = this.filters.source_instrument;
      srcInstSelect.addEventListener('change', (e) => {
        this.filters.source_instrument = e.target.value;
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const refInstSelect = this.container.querySelector('#filter-ref-inst');
    if (refInstSelect) {
      refInstSelect.value = this.filters.reference_instrument;
      refInstSelect.addEventListener('change', (e) => {
        this.filters.reference_instrument = e.target.value;
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const regionSelect = this.container.querySelector('#filter-region');
    if (regionSelect) {
      regionSelect.value = this.filters.region_id;
      regionSelect.addEventListener('change', (e) => {
        this.filters.region_id = e.target.value;
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const resetBtn = this.container.querySelector('#btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.filters = { search: '', overlap_status: '', source_instrument: '', reference_instrument: '', region_id: '' };
        this.applyFilters();
        this.render();
      });
    }

    // Inspect pair button handlers
    this.container.querySelectorAll('.btn-inspect-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        await this.inspectPair(pairId);
      });
    });

    // Prepare pair button handlers
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
      summaryBar.innerHTML = `<span>Showing <strong>${this.filteredPairs.length}</strong> of <strong>${this.pairs.length}</strong> canonical pairs</span>`;
    }
    if (!viewContent) return;

    if (this.filteredPairs.length === 0) {
      viewContent.innerHTML = renderEmptyState({ title: 'NO PAIRS FOUND', message: 'Try adjusting your search criteria.' });
      return;
    }

    if (this.viewMode === 'cards') {
      viewContent.innerHTML = `<div class="dataset-grid">
        ${this.filteredPairs.map(p => renderPairCard(p)).join('')}
      </div>`;
    } else {
      viewContent.innerHTML = renderPairTable(this.filteredPairs);
    }

    // Rebind events
    viewContent.querySelectorAll('.btn-inspect-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        await this.inspectPair(pairId);
      });
    });

    viewContent.querySelectorAll('.btn-prepare-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        await this.preparePair(pairId);
      });
    });
  }

  async inspectPair(pairId) {
    if (!pairId) return;
    try {
      const regInput = await window.pairService.getPairRegistrationInput(pairId);
      if (window.openAppModal) {
        window.openAppModal(`CANONICAL PAIR #${pairId} METADATA`, renderMetadataPanel(regInput, 'pair'));
        
        // Bind modal action button
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
