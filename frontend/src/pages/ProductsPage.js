/**
 * LUNA-REG: ProductsPage Controller
 * Title: LUNAR PRODUCTS
 * Subtitle: "Explore available Chandrayaan-2 lunar imaging products."
 * 
 * Manages canonical products browsing, dynamic filtering, table/card hybrid view,
 * loading/error/empty states, and inspect modal.
 */

class ProductsPage {
  constructor() {
    this.products = [];
    this.regions = [];
    this.regionsMap = {};
    this.filteredProducts = [];
    this.viewMode = 'table'; // 'table' | 'cards'
    this.filters = {
      search: '',
      instrument: '',
      mission: '',
      region_id: ''
    };
    this.loading = false;
    this.error = null;
    this.activeAbortController = null;
  }

  async init(containerEl) {
    this.container = containerEl;
    if (!this.container) return;
    await this.loadData();
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
      // Build dynamic API filters
      const apiFilters = {};
      if (this.filters.instrument) apiFilters.instrument = this.filters.instrument;
      if (this.filters.mission) apiFilters.mission = this.filters.mission;
      if (this.filters.region_id && this.filters.region_id !== 'unassigned') {
        apiFilters.region_id = this.filters.region_id;
      }

      // Parallel fetch products and regions
      const [productsData, regionsData] = await Promise.all([
        window.productService.getProducts(apiFilters, { signal: this.activeAbortController.signal }),
        (this.regions.length === 0 && window.regionService) 
          ? window.regionService.getRegions({ signal: this.activeAbortController.signal }).catch(() => []) 
          : Promise.resolve(this.regions)
      ]);

      this.products = Array.isArray(productsData) ? productsData : [];
      if (Array.isArray(regionsData) && regionsData.length > 0) {
        this.regions = regionsData;
        this.regionsMap = {};
        this.regions.forEach(r => {
          if (r && r.id) this.regionsMap[String(r.id)] = r;
        });
      }

      this.applyClientSideFilters();
    } catch (err) {
      if (err.name === 'ApiError' && err.type === 'ABORTED') {
        return; // ignore cancelled requests
      }
      console.error('Failed to load canonical lunar products:', err);
      this.error = err.message || 'Unable to communicate with the lunar products catalog API.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  applyClientSideFilters() {
    let result = [...this.products];
    const { search, region_id } = this.filters;

    // Search by Product ID (or instrument/mission)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => 
        (p.product_id && p.product_id.toLowerCase().includes(q)) ||
        (p.instrument && p.instrument.toLowerCase().includes(q)) ||
        (p.mission && p.mission.toLowerCase().includes(q)) ||
        String(p.id).includes(q)
      );
    }

    // Handle "unassigned" region specifically
    if (region_id === 'unassigned') {
      result = result.filter(p => p.region_id === null || p.region_id === undefined || p.region_id === '');
    }

    this.filteredProducts = result;
  }

  render() {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = `
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">LUNAR PRODUCTS</h2>
            <p class="products-view-subtitle">Explore available Chandrayaan-2 lunar imaging products.</p>
          </div>
        </div>
        ${typeof renderLoadingState === 'function' 
          ? renderLoadingState('QUERYING CHANDRAYAAN-2 PRODUCTS ARCHIVE...') 
          : '<div class="canonical-loading-state">Loading lunar products...</div>'}
      `;
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">LUNAR PRODUCTS</h2>
            <p class="products-view-subtitle">Explore available Chandrayaan-2 lunar imaging products.</p>
          </div>
        </div>
        ${typeof renderErrorState === 'function'
          ? renderErrorState({
              title: 'LUNAR PRODUCTS ARCHIVE ERROR',
              message: 'Failed to retrieve canonical lunar products from FastAPI backend.',
              details: this.error,
              retryBtnId: 'btn-retry-products'
            })
          : `<div class="canonical-error-state"><div class="error-msg">${this.error}</div></div>`}
      `;

      const retryBtn = this.container.querySelector('#btn-retry-products');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadData());
      }
      return;
    }

    const filterBarHtml = typeof renderFilterBar === 'function'
      ? renderFilterBar({ mode: 'products', regions: this.regions })
      : '';

    let contentHtml = '';
    if (this.filteredProducts.length === 0) {
      contentHtml = typeof renderEmptyState === 'function'
        ? renderEmptyState({
            title: 'NO LUNAR PRODUCTS MATCH',
            message: 'No Chandrayaan-2 products found matching the active filter parameters.',
            actionText: 'RESET ALL FILTERS',
            actionId: 'btn-empty-reset-filters'
          })
        : '<div class="canonical-empty-state">No products found.</div>';
    } else if (this.viewMode === 'cards') {
      contentHtml = `
        <div class="dataset-grid">
          ${this.filteredProducts.map(p => renderProductCard(p, this.regionsMap)).join('')}
        </div>
      `;
    } else {
      contentHtml = typeof renderProductTable === 'function'
        ? renderProductTable(this.filteredProducts, this.regionsMap)
        : '';
    }

    this.container.innerHTML = `
      <div class="products-catalog-page">
        <!-- Products Page Header -->
        <div class="products-header-strip">
          <div>
            <h2 class="products-view-title">LUNAR PRODUCTS</h2>
            <p class="products-view-subtitle">Explore available Chandrayaan-2 lunar imaging products.</p>
          </div>
          <div class="products-header-telemetry">
            <span class="telemetry-pill">
              INDEXED: <strong>${this.products.length}</strong>
            </span>
          </div>
        </div>

        <!-- Filter Bar -->
        ${filterBarHtml}

        <!-- Summary Bar -->
        <div class="catalog-summary-bar">
          <span>Showing <strong>${this.filteredProducts.length}</strong> of <strong>${this.products.length}</strong> canonical products</span>
          ${this.isFilterActive() ? '<span class="filter-active-tag">FILTERS APPLIED</span>' : ''}
        </div>

        <!-- Content Area -->
        <div class="catalog-view-content">
          ${contentHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  isFilterActive() {
    return !!(this.filters.search || this.filters.instrument || this.filters.mission || this.filters.region_id);
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

    // Search Product ID input
    const searchInput = this.container.querySelector('#filter-search');
    if (searchInput) {
      searchInput.value = this.filters.search;
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.trim();
        this.applyClientSideFilters();
        this.updateContentOnly();
      });
    }

    // Instrument filter
    const instSelect = this.container.querySelector('#filter-instrument');
    if (instSelect) {
      instSelect.value = this.filters.instrument;
      instSelect.addEventListener('change', async (e) => {
        this.filters.instrument = e.target.value;
        await this.loadData();
      });
    }

    // Mission filter
    const missionSelect = this.container.querySelector('#filter-mission');
    if (missionSelect) {
      missionSelect.value = this.filters.mission;
      missionSelect.addEventListener('change', async (e) => {
        this.filters.mission = e.target.value;
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
          // Client side filter
          this.applyClientSideFilters();
          this.updateContentOnly();
        } else {
          await this.loadData();
        }
      });
    }

    // Clear Filters
    const resetBtn = this.container.querySelector('#btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        this.clearFilters();
      });
    }

    const emptyResetBtn = this.container.querySelector('#btn-empty-reset-filters');
    if (emptyResetBtn) {
      emptyResetBtn.addEventListener('click', async () => {
        this.clearFilters();
      });
    }

    // Inspect buttons
    this.bindInspectButtons();
  }

  async clearFilters() {
    this.filters = { search: '', instrument: '', mission: '', region_id: '' };
    await this.loadData();
  }

  bindInspectButtons() {
    this.container.querySelectorAll('.btn-inspect-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = btn.dataset.productId;
        await this.inspectProduct(prodId);
      });
    });
  }

  updateContentOnly() {
    const viewContent = this.container.querySelector('.catalog-view-content');
    const summaryBar = this.container.querySelector('.catalog-summary-bar');

    if (summaryBar) {
      summaryBar.innerHTML = `
        <span>Showing <strong>${this.filteredProducts.length}</strong> of <strong>${this.products.length}</strong> canonical products</span>
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

    if (this.filteredProducts.length === 0) {
      viewContent.innerHTML = typeof renderEmptyState === 'function'
        ? renderEmptyState({
            title: 'NO LUNAR PRODUCTS MATCH',
            message: 'No Chandrayaan-2 products found matching the active filter parameters.',
            actionText: 'RESET ALL FILTERS',
            actionId: 'btn-empty-reset-filters'
          })
        : '<div class="canonical-empty-state">No products found.</div>';

      const emptyResetBtn = viewContent.querySelector('#btn-empty-reset-filters');
      if (emptyResetBtn) {
        emptyResetBtn.addEventListener('click', () => this.clearFilters());
      }
      return;
    }

    if (this.viewMode === 'cards') {
      viewContent.innerHTML = `
        <div class="dataset-grid">
          ${this.filteredProducts.map(p => renderProductCard(p, this.regionsMap)).join('')}
        </div>
      `;
    } else {
      viewContent.innerHTML = renderProductTable(this.filteredProducts, this.regionsMap);
    }

    this.bindInspectButtons();
  }

  async inspectProduct(productId) {
    if (!productId) return;
    try {
      const [product, files] = await Promise.all([
        window.productService.getProductById(productId),
        window.productService.getProductFiles(productId).catch(() => [])
      ]);

      if (window.openAppModal) {
        window.openAppModal(
          `PRODUCT TELEMETRY #${productId}`, 
          renderMetadataPanel({ product, files }, 'product')
        );
      }
    } catch (err) {
      alert(`Failed to load product metadata: ${err.message}`);
    }
  }
}

window.productsPage = new ProductsPage();
