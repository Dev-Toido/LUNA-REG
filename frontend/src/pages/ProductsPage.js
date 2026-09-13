/**
 * LUNA-REG: ProductsPage Controller
 * Manages canonical products browsing, filtering, table/card view switching, and inspection modal
 */

class ProductsPage {
  constructor() {
    this.products = [];
    this.regions = [];
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
      const [productsData, regionsData] = await Promise.all([
        window.productService.listProducts(),
        window.regionService ? window.regionService.listRegions().catch(() => []) : []
      ]);

      this.products = Array.isArray(productsData) ? productsData : [];
      this.regions = Array.isArray(regionsData) ? regionsData : [];
      this.applyFilters();
    } catch (err) {
      console.error('Failed to load products data:', err);
      this.error = err.message || 'Failed to communicate with products catalog API.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  applyFilters() {
    let result = [...this.products];
    const { search, instrument, mission, region_id } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => 
        (p.product_id && p.product_id.toLowerCase().includes(q)) ||
        (p.instrument && p.instrument.toLowerCase().includes(q)) ||
        (p.mission && p.mission.toLowerCase().includes(q)) ||
        String(p.id).includes(q)
      );
    }

    if (instrument) {
      result = result.filter(p => p.instrument === instrument);
    }

    if (mission) {
      result = result.filter(p => p.mission === mission);
    }

    if (region_id) {
      result = result.filter(p => String(p.region_id) === String(region_id));
    }

    this.filteredProducts = result;
  }

  render() {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = typeof renderLoadingState === 'function'
        ? renderLoadingState('QUERYING LUNAR PRODUCTS CATALOG...')
        : '<div class="loading">Loading products...</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = typeof renderErrorState === 'function'
        ? renderErrorState({
            title: 'PRODUCTS CATALOG ERROR',
            message: 'Unable to retrieve canonical lunar products from API.',
            details: this.error,
            retryBtnId: 'btn-retry-products'
          })
        : `<div class="error-msg">${this.error}</div>`;
      
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
    if (this.viewMode === 'cards') {
      contentHtml = `<div class="dataset-grid">
        ${this.filteredProducts.map(p => renderProductCard(p)).join('')}
      </div>`;
    } else {
      contentHtml = typeof renderProductTable === 'function'
        ? renderProductTable(this.filteredProducts)
        : '';
    }

    this.container.innerHTML = `
      <div class="products-catalog-page">
        ${filterBarHtml}
        <div class="catalog-summary-bar">
          <span>Showing <strong>${this.filteredProducts.length}</strong> of <strong>${this.products.length}</strong> canonical products</span>
        </div>
        <div class="catalog-view-content">
          ${this.filteredProducts.length === 0 ? renderEmptyState({ title: 'NO PRODUCTS FOUND', message: 'Try resetting your filter parameters.' }) : contentHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // View toggle
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

    const instSelect = this.container.querySelector('#filter-instrument');
    if (instSelect) {
      instSelect.value = this.filters.instrument;
      instSelect.addEventListener('change', (e) => {
        this.filters.instrument = e.target.value;
        this.applyFilters();
        this.updateContentOnly();
      });
    }

    const missionSelect = this.container.querySelector('#filter-mission');
    if (missionSelect) {
      missionSelect.value = this.filters.mission;
      missionSelect.addEventListener('change', (e) => {
        this.filters.mission = e.target.value;
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
        this.filters = { search: '', instrument: '', mission: '', region_id: '' };
        this.applyFilters();
        this.render();
      });
    }

    // Inspect product actions
    this.container.querySelectorAll('.btn-inspect-product').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const prodId = btn.dataset.productId;
        await this.inspectProduct(prodId);
      });
    });
  }

  updateContentOnly() {
    const viewContent = this.container.querySelector('.catalog-view-content');
    const summaryBar = this.container.querySelector('.catalog-summary-bar');
    if (summaryBar) {
      summaryBar.innerHTML = `<span>Showing <strong>${this.filteredProducts.length}</strong> of <strong>${this.products.length}</strong> canonical products</span>`;
    }
    if (!viewContent) return;

    if (this.filteredProducts.length === 0) {
      viewContent.innerHTML = renderEmptyState({ title: 'NO PRODUCTS FOUND', message: 'Try adjusting your filter search criteria.' });
      return;
    }

    if (this.viewMode === 'cards') {
      viewContent.innerHTML = `<div class="dataset-grid">
        ${this.filteredProducts.map(p => renderProductCard(p)).join('')}
      </div>`;
    } else {
      viewContent.innerHTML = renderProductTable(this.filteredProducts);
    }

    // Rebind inspect
    viewContent.querySelectorAll('.btn-inspect-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = btn.dataset.productId;
        await this.inspectProduct(prodId);
      });
    });
  }

  async inspectProduct(productId) {
    if (!productId) return;
    try {
      const [product, files] = await Promise.all([
        window.productService.getProduct(productId),
        window.productService.getProductFiles(productId).catch(() => [])
      ]);

      if (window.openAppModal) {
        window.openAppModal(`PRODUCT TELEMETRY #${productId}`, renderMetadataPanel({ product, files }, 'product'));
      }
    } catch (err) {
      alert(`Failed to load product metadata: ${err.message}`);
    }
  }
}

window.productsPage = new ProductsPage();
