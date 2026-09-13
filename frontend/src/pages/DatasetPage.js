/**
 * LUNA-REG: DatasetPage Controller (Part 6)
 * Master orchestrator for Dataset Explorer, planetary catalog, telemetry cards, and inspection drawers
 * 
 * Complies with:
 * - Zero Blue design system (Obsidian, deep charcoal, champagne gold accents)
 * - Zero Fake Data policy (Real backend APIs, safe null fallbacks '—', disabled download/export)
 * - Non-blocking instant hydration + fast 1800ms background sync
 */

class DatasetPage {
  constructor() {
    this.initialized = false;
    this.activeTab = 'products'; // 'products' | 'pairs' | 'regions'
    this.isLoading = false;
    this.errorMessage = null;

    // Filter & Sort State
    this.filters = {
      search: '',
      region_id: '',
      mission: '',
      instrument: '',
      product_type: '',
      calibration_status: '',
      overlap_status: '',
      resolution_range: 'all',
      source_instrument: '',
      reference_instrument: '',
      sort_by: 'acquisition_time',
      sort_order: 'desc'
    };

    // Pagination State
    this.pagination = {
      products: { page: 1, pageSize: 8 },
      pairs: { page: 1, pageSize: 8 },
      regions: { page: 1, pageSize: 8 }
    };

    // Catalog Data Store
    this.regions = [];
    this.products = [];
    this.pairs = [];
    this.regionsMap = {};

    // Drawer State
    this.activeDrawer = null; // { type: 'product'|'pair'|'region', data: any, files?: any[] }
    this.isLoadingFiles = false;
    this.filesError = null;

    // Bind methods
    this.handleTabSwitch = this.handleTabSwitch.bind(this);
    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.handleSortChange = this.handleSortChange.bind(this);
    this.handleClearFilters = this.handleClearFilters.bind(this);
    this.handleRefresh = this.handleRefresh.bind(this);
    this.closeDrawer = this.closeDrawer.bind(this);
  }

  /**
   * Initialize or re-activate Dataset page
   */
  async init() {
    this.parseUrlParameters();

    // If first load, show radar loading state
    if (!this.hasLoadedOnce) {
      this.isLoading = true;
    }

    this.render();
    this.attachEventListeners();

    // Fetch from real backend REST APIs
    await this.syncFromBackend();

    // Handle drawer auto-open if specified in URL params
    if (this.pendingDrawer) {
      if (this.pendingDrawer.type === 'pair') this.openPairDrawer(this.pendingDrawer.id);
      else if (this.pendingDrawer.type === 'product') this.openProductDrawer(this.pendingDrawer.id);
      else if (this.pendingDrawer.type === 'region') this.openRegionDrawer(this.pendingDrawer.id);
      this.pendingDrawer = null;
    }
  }

  /**
   * Parse URL hash & query parameters for deep linking
   */
  parseUrlParameters() {
    const hash = window.location.hash || '';
    if (hash.includes('#/products')) this.activeTab = 'products';
    else if (hash.includes('#/pairs')) this.activeTab = 'pairs';
    else if (hash.includes('#/regions')) this.activeTab = 'regions';

    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const qs = hash.substring(queryIndex + 1);
      const params = new URLSearchParams(qs);

      if (params.has('tab')) {
        const t = params.get('tab');
        if (['products', 'pairs', 'regions'].includes(t)) this.activeTab = t;
      }
      if (params.has('pair_id')) {
        this.activeTab = 'pairs';
        this.pendingDrawer = { type: 'pair', id: params.get('pair_id') };
      } else if (params.has('product_id')) {
        this.activeTab = 'products';
        this.pendingDrawer = { type: 'product', id: params.get('product_id') };
      } else if (params.has('region_id')) {
        this.pendingDrawer = { type: 'region', id: params.get('region_id') };
      }
      if (params.has('search')) {
        this.filters.search = params.get('search');
      }
    }
  }

  /**
   * Sync catalog datasets from real backend REST APIs (/regions, /products, /pairs)
   */
  async syncFromBackend() {
    try {
      this.isLoading = true;
      this.errorMessage = null;
      this.updateLoadingState();
      this.render();
      this.attachEventListeners();

      const options = { timeoutMs: 2500 };

      // Query real backend endpoints in parallel
      const [regRes, prodRes, pairRes] = await Promise.allSettled([
        window.regionService ? window.regionService.getRegions(options) : Promise.reject('Region service unavailable'),
        window.productService ? window.productService.getProducts({}, options) : Promise.reject('Product service unavailable'),
        window.pairService ? window.pairService.getPairs({}, options) : Promise.reject('Pair service unavailable')
      ]);

      let anySucceeded = false;

      if (regRes.status === 'fulfilled' && Array.isArray(regRes.value)) {
        this.regions = regRes.value;
        this.regionsMap = {};
        this.regions.forEach(r => {
          if (r && r.id !== undefined && r.id !== null) {
            this.regionsMap[String(r.id)] = r;
          }
        });
        anySucceeded = true;
      } else {
        console.warn('[DatasetPage] Regions fetch warning:', regRes.reason);
      }

      if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value)) {
        this.products = prodRes.value;
        anySucceeded = true;
      } else {
        console.warn('[DatasetPage] Products fetch warning:', prodRes.reason);
      }

      if (pairRes.status === 'fulfilled' && Array.isArray(pairRes.value)) {
        this.pairs = pairRes.value;
        anySucceeded = true;
      } else {
        console.warn('[DatasetPage] Pairs fetch warning:', pairRes.reason);
      }

      this.hasLoadedOnce = true;

      if (!anySucceeded) {
        this.errorMessage = 'Backend catalog service unreachable at /products, /pairs, /regions. Please verify that the FastAPI backend server is running on http://127.0.0.1:8000.';
      }
    } catch (err) {
      console.warn('[DatasetPage] Backend sync error:', err);
      this.errorMessage = (err && err.message) || 'Error communicating with backend catalog service.';
    } finally {
      this.isLoading = false;
      this.render();
      this.attachEventListeners();
    }
  }

  /**
   * Render master view inside #view-dataset
   */
  render() {
    const container = document.getElementById('view-dataset');
    if (!container) return;

    // If currently loading first time
    if (this.isLoading && !this.hasLoadedOnce) {
      container.innerHTML = `
        <div class="dataset-page-container">
          <div class="dataset-page-header">
            <div class="header-left">
              <div class="header-breadcrumb">
                <a href="#/dashboard">LUNA-REG</a>
                <span class="crumb-separator">/</span>
                <span class="crumb-current">DATASET EXPLORER</span>
              </div>
              <h1 class="page-title text-gold">PLANETARY CATALOG & DATASET EXPLORER</h1>
              <p class="page-subtitle">Multi-sensor lunar telemetry, geographic bounds, and verified registration pairs ledger</p>
            </div>
            <div class="header-right-telemetry">
              <div class="telemetry-chip">
                <span class="chip-dot"></span>
                <span class="chip-text">INITIALIZING</span>
              </div>
            </div>
          </div>
          ${typeof renderDatasetEmptyState === 'function' 
            ? renderDatasetEmptyState({
                type: 'loading',
                title: 'SYNCHRONIZING PLANETARY ARCHIVE...',
                message: 'Connecting to REST APIs (/products, /pairs, /regions) to load canonical mission data.'
              })
            : '<div class="loading-state">Loading catalog...</div>'}
        </div>
      `;
      return;
    }

    // If total failure and zero data
    if (this.errorMessage && !this.products.length && !this.pairs.length && !this.regions.length) {
      container.innerHTML = `
        <div class="dataset-page-container">
          <div class="dataset-page-header">
            <div class="header-left">
              <div class="header-breadcrumb">
                <a href="#/dashboard">LUNA-REG</a>
                <span class="crumb-separator">/</span>
                <span class="crumb-current">DATASET EXPLORER</span>
              </div>
              <h1 class="page-title text-gold">PLANETARY CATALOG & DATASET EXPLORER</h1>
              <p class="page-subtitle">Multi-sensor lunar telemetry, geographic bounds, and verified registration pairs ledger</p>
            </div>
            <div class="header-right-telemetry">
              <div class="telemetry-chip" style="border-color:rgba(217,83,79,0.4); color:#d9534f;">
                <span class="chip-dot" style="background:#d9534f;"></span>
                <span class="chip-text">BACKEND DISCONNECTED</span>
              </div>
            </div>
          </div>
          ${typeof renderDatasetEmptyState === 'function'
            ? renderDatasetEmptyState({
                type: 'error',
                title: 'CANONICAL CATALOG UNREACHABLE',
                message: this.errorMessage,
                actionText: 'RETRY BACKEND QUERY'
              })
            : '<div class="error-state">Catalog query failed.</div>'}
        </div>
      `;
      return;
    }

    // Filter datasets according to active state
    const filteredProducts = this.getFilteredProducts();
    const filteredPairs = this.getFilteredPairs();
    const filteredRegions = this.getFilteredRegions();

    // Compute dynamic metrics strictly from backend results
    const totalFilesCount = this.products.reduce((acc, p) => {
      const fc = p.file_count ?? (Array.isArray(p.files) ? p.files.length : null);
      return acc + (fc || 0);
    }, 0);
    const verifiedPairs = this.pairs.filter(p => (p.overlap_status || '').toUpperCase() === 'VERIFIED').length;
    const calibratedProducts = this.products.filter(p => (p.calibration_status || '').toUpperCase() === 'CALIBRATED').length;

    const stats = {
      totalRegions: this.hasLoadedOnce ? this.regions.length : '—',
      totalProducts: this.hasLoadedOnce ? this.products.length : '—',
      totalPairs: this.hasLoadedOnce ? this.pairs.length : '—',
      totalFiles: this.hasLoadedOnce ? (totalFilesCount > 0 ? totalFilesCount : 'Indexed') : '—',
      verifiedPairsCount: verifiedPairs,
      calibratedProductsCount: calibratedProducts,
      storageSizeFormatted: this.hasLoadedOnce ? (this.products.length > 0 ? `${this.products.length} Products Indexed` : '0 Objects') : '—',
      lastUpdated: this.hasLoadedOnce ? new Date() : null
    };

    // Render Overview
    const overviewHtml = typeof renderDatasetOverview === 'function' 
      ? renderDatasetOverview(stats) 
      : '<div class="dataset-overview-placeholder"></div>';

    // Render Filters
    const filtersHtml = typeof renderDatasetFilters === 'function'
      ? renderDatasetFilters({
          activeTab: this.activeTab,
          filters: this.filters,
          regions: this.regions,
          isExportAvailable: false, // Explicitly disabled per requirements
          isLoading: this.isLoading
        })
      : '';

    // Active Table Content
    let tableHtml = '';
    let currentFilteredList = [];
    let currentPagination = this.pagination[this.activeTab];

    if (this.activeTab === 'products') {
      currentFilteredList = filteredProducts;
      const paginated = this.paginateList(filteredProducts, currentPagination);
      if (currentFilteredList.length === 0) {
        tableHtml = typeof renderDatasetEmptyState === 'function'
          ? renderDatasetEmptyState({
              type: 'empty',
              title: 'NO PRODUCTS FOUND',
              message: 'No lunar products match the active search and filter criteria.'
            })
          : '<div class="empty-state">No products found.</div>';
      } else {
        tableHtml = typeof renderProductTable === 'function'
          ? renderProductTable({
              products: paginated,
              regionsMap: this.regionsMap,
              sortBy: this.filters.sort_by,
              sortOrder: this.filters.sort_order
            })
          : '';
      }
    } else if (this.activeTab === 'pairs') {
      currentFilteredList = filteredPairs;
      const paginated = this.paginateList(filteredPairs, currentPagination);
      if (currentFilteredList.length === 0) {
        tableHtml = typeof renderDatasetEmptyState === 'function'
          ? renderDatasetEmptyState({
              type: 'empty',
              title: 'NO PAIRS FOUND',
              message: 'No registration pairs match the active search and filter criteria.'
            })
          : '<div class="empty-state">No pairs found.</div>';
      } else {
        tableHtml = typeof renderPairTable === 'function'
          ? renderPairTable({
              pairs: paginated,
              regionsMap: this.regionsMap,
              sortBy: this.filters.sort_by,
              sortOrder: this.filters.sort_order
            })
          : '';
      }
    } else if (this.activeTab === 'regions') {
      currentFilteredList = filteredRegions;
      const paginated = this.paginateList(filteredRegions, currentPagination);
      if (currentFilteredList.length === 0) {
        tableHtml = typeof renderDatasetEmptyState === 'function'
          ? renderDatasetEmptyState({
              type: 'empty',
              title: 'NO REGIONS FOUND',
              message: 'No lunar regions match the active search and filter criteria.'
            })
          : '<div class="empty-state">No regions found.</div>';
      } else {
        tableHtml = typeof renderRegionTable === 'function'
          ? renderRegionTable({
              regions: paginated,
              products: this.products,
              sortBy: this.filters.sort_by,
              sortOrder: this.filters.sort_order
            })
          : '';
      }
    }

    const paginationHtml = this.renderPagination(currentFilteredList.length, currentPagination);

    container.innerHTML = `
      <div class="dataset-page-container">
        <!-- Page Header -->
        <div class="dataset-page-header">
          <div class="header-left">
            <div class="header-breadcrumb">
              <a href="#/dashboard">LUNA-REG</a>
              <span class="crumb-separator">/</span>
              <span class="crumb-current">DATASET EXPLORER</span>
            </div>
            <h1 class="page-title text-gold">PLANETARY CATALOG & DATASET EXPLORER</h1>
            <p class="page-subtitle">Multi-sensor lunar telemetry, geographic bounds, and verified registration pairs ledger</p>
          </div>
          <div class="header-right-telemetry">
            <div class="telemetry-chip">
              <span class="chip-dot"></span>
              <span class="chip-text">CATALOG ONLINE</span>
            </div>
            <div class="telemetry-chip gold">
              <span class="chip-text">ISRO / CHANDRAYAAN-2 • LRO</span>
            </div>
          </div>
        </div>

        <!-- Telemetry Overview Cards -->
        <div class="dataset-overview-section">
          ${overviewHtml}
        </div>

        <!-- Tab Selector Ribbon -->
        <div class="dataset-tabs-bar">
          <button class="dataset-tab-btn ${this.activeTab === 'products' ? 'active' : ''}" data-tab="products">
            <span class="tab-icon">▦</span>
            <span class="tab-label">LUNAR PRODUCTS</span>
            <span class="tab-badge">${filteredProducts.length}</span>
          </button>
          <button class="dataset-tab-btn ${this.activeTab === 'pairs' ? 'active' : ''}" data-tab="pairs">
            <span class="tab-icon">⚲</span>
            <span class="tab-label">REGISTRATION PAIRS</span>
            <span class="tab-badge">${filteredPairs.length}</span>
          </button>
          <button class="dataset-tab-btn ${this.activeTab === 'regions' ? 'active' : ''}" data-tab="regions">
            <span class="tab-icon">🌐</span>
            <span class="tab-label">TARGET REGIONS</span>
            <span class="tab-badge">${filteredRegions.length}</span>
          </button>
        </div>

        <!-- Filter Suite -->
        <div class="dataset-filters-section">
          ${filtersHtml}
        </div>

        <!-- Active Table Workspace -->
        <div class="dataset-table-section">
          ${tableHtml}
          ${paginationHtml}
        </div>
      </div>

      <!-- Off-canvas Inspection Drawer Container -->
      <div class="drawer-overlay ${this.activeDrawer ? 'open' : ''}" id="dataset-drawer-overlay">
        <div class="drawer-panel" id="dataset-drawer-panel">
          ${this.renderActiveDrawerContent()}
        </div>
      </div>
    `;
  }

  /**
   * Render Pagination Controls
   */
  renderPagination(totalCount, pagination) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
    const currentPage = Math.min(pagination.page, totalPages);

    return `
      <div class="dataset-pagination-bar">
        <div class="pagination-info">
          SHOWING <span class="text-gold">${totalCount === 0 ? 0 : (currentPage - 1) * pagination.pageSize + 1}</span> – 
          <span class="text-gold">${Math.min(currentPage * pagination.pageSize, totalCount)}</span> OF 
          <span class="text-gold">${totalCount}</span> RECORDS
        </div>

        <div class="pagination-controls">
          <button class="btn-page-step" id="btn-page-prev" ${currentPage <= 1 ? 'disabled' : ''} title="Previous Page">
            ◀ PREV
          </button>
          <span class="page-indicator">PAGE ${currentPage} / ${totalPages}</span>
          <button class="btn-page-step" id="btn-page-next" ${currentPage >= totalPages ? 'disabled' : ''} title="Next Page">
            NEXT ▶
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Paginate list slice
   */
  paginateList(list, pagination) {
    const start = (pagination.page - 1) * pagination.pageSize;
    return list.slice(start, start + pagination.pageSize);
  }

  /**
   * Render drawer inner content
   */
  renderActiveDrawerContent() {
    if (!this.activeDrawer) return '';

    const { type, data, files } = this.activeDrawer;

    if (type === 'product') {
      const reg = data.region_id ? this.regionsMap[String(data.region_id)] : null;
      return typeof renderProductDetailsDrawer === 'function'
        ? renderProductDetailsDrawer({
            product: data,
            region: reg,
            files: files || [],
            isLoadingFiles: this.isLoadingFiles,
            filesError: this.filesError
          })
        : '';
    }

    if (type === 'pair') {
      const srcProd = this.products.find(p => p.product_id === data.source_product_id);
      const refProd = this.products.find(p => p.product_id === data.reference_product_id);
      const reg = data.region_id ? this.regionsMap[String(data.region_id)] : null;
      return typeof renderPairDetailsDrawer === 'function'
        ? renderPairDetailsDrawer({
            pair: data,
            sourceProduct: srcProd,
            referenceProduct: refProd,
            region: reg
          })
        : '';
    }

    if (type === 'region') {
      return typeof renderRegionDetailsDrawer === 'function'
        ? renderRegionDetailsDrawer({
            region: data,
            products: this.products
          })
        : '';
    }

    return '';
  }

  /**
   * In-memory Filtering for Products
   */
  getFilteredProducts() {
    let list = [...this.products];
    const { search, region_id, mission, instrument, product_type, calibration_status, resolution_range, sort_by, sort_order } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        (p.product_id && p.product_id.toLowerCase().includes(q)) ||
        (p.instrument && p.instrument.toLowerCase().includes(q)) ||
        (p.mission && p.mission.toLowerCase().includes(q))
      );
    }

    if (region_id) {
      list = list.filter(p => String(p.region_id) === String(region_id));
    }

    if (mission) {
      list = list.filter(p => p.mission === mission);
    }

    if (instrument) {
      list = list.filter(p => p.instrument === instrument);
    }

    if (product_type) {
      list = list.filter(p => (p.product_type || 'IMG').toUpperCase() === product_type.toUpperCase());
    }

    if (calibration_status) {
      list = list.filter(p => (p.calibration_status || 'CALIBRATED').toUpperCase() === calibration_status.toUpperCase());
    }

    if (resolution_range && resolution_range !== 'all') {
      list = list.filter(p => {
        const res = p.resolution !== undefined ? p.resolution : p.resolution_m_per_px;
        if (res === undefined || res === null) return false;
        if (resolution_range === 'high') return res < 1.0;
        if (resolution_range === 'medium') return res >= 1.0 && res <= 10.0;
        if (resolution_range === 'regional') return res > 10.0;
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      let vA = a[sort_by];
      let vB = b[sort_by];

      if (sort_by === 'resolution') {
        vA = a.resolution ?? a.resolution_m_per_px ?? 9999;
        vB = b.resolution ?? b.resolution_m_per_px ?? 9999;
      } else if (sort_by === 'acquisition_time') {
        vA = new Date(a.acquisition_time || a.start_time || 0).getTime();
        vB = new Date(b.acquisition_time || b.start_time || 0).getTime();
      } else if (sort_by === 'status') {
        vA = a.calibration_status || '';
        vB = b.calibration_status || '';
      }

      if (vA < vB) return sort_order === 'asc' ? -1 : 1;
      if (vA > vB) return sort_order === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  /**
   * In-memory Filtering for Pairs
   */
  getFilteredPairs() {
    let list = [...this.pairs];
    const { search, region_id, source_instrument, reference_instrument, overlap_status, sort_by, sort_order } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        String(p.id).includes(q) ||
        (p.source_instrument && p.source_instrument.toLowerCase().includes(q)) ||
        (p.reference_instrument && p.reference_instrument.toLowerCase().includes(q)) ||
        (p.source_product_id && p.source_product_id.toLowerCase().includes(q)) ||
        (p.reference_product_id && p.reference_product_id.toLowerCase().includes(q))
      );
    }

    if (region_id) {
      list = list.filter(p => String(p.region_id) === String(region_id));
    }

    if (source_instrument) {
      list = list.filter(p => p.source_instrument === source_instrument);
    }

    if (reference_instrument) {
      list = list.filter(p => p.reference_instrument === reference_instrument);
    }

    if (overlap_status) {
      list = list.filter(p => (p.overlap_status || '').toUpperCase() === overlap_status.toUpperCase());
    }

    // Sort
    list.sort((a, b) => {
      let vA = a[sort_by] ?? a.id;
      let vB = b[sort_by] ?? b.id;

      if (sort_by === 'status') {
        vA = a.overlap_status || '';
        vB = b.overlap_status || '';
      } else if (sort_by === 'created_at') {
        vA = new Date(a.created_at || 0).getTime();
        vB = new Date(b.created_at || 0).getTime();
      }

      if (vA < vB) return sort_order === 'asc' ? -1 : 1;
      if (vA > vB) return sort_order === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  /**
   * In-memory Filtering for Regions
   */
  getFilteredRegions() {
    let list = [...this.regions];
    const { search, sort_by, sort_order } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => 
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.feature_type && r.feature_type.toLowerCase().includes(q)) ||
        String(r.id).includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let vA = a[sort_by] ?? a.id;
      let vB = b[sort_by] ?? b.id;

      if (sort_by === 'name') {
        vA = a.name || '';
        vB = b.name || '';
      }

      if (vA < vB) return sort_order === 'asc' ? -1 : 1;
      if (vA > vB) return sort_order === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  /**
   * Attach all DOM event listeners
   */
  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.dataset-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.handleTabSwitch(tab);
      });
    });

    // Search text
    const searchInput = document.getElementById('dataset-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.trim();
        this.pagination[this.activeTab].page = 1;
        this.render();
        this.attachEventListeners();
        // Keep focus
        const nextInput = document.getElementById('dataset-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = nextInput.selectionEnd = nextInput.value.length;
        }
      });
    }

    // Clear search
    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        this.filters.search = '';
        this.pagination[this.activeTab].page = 1;
        this.render();
        this.attachEventListeners();
      });
    }

    // Dropdown filters
    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          this.filters[key] = e.target.value;
          this.pagination[this.activeTab].page = 1;
          this.render();
          this.attachEventListeners();
        });
      }
    };

    bindSelect('filter-region-select', 'region_id');
    bindSelect('filter-mission-select', 'mission');
    bindSelect('filter-instrument-select', 'instrument');
    bindSelect('filter-type-select', 'product_type');
    bindSelect('filter-calibration-select', 'calibration_status');
    bindSelect('filter-resolution-select', 'resolution_range');
    bindSelect('filter-source-inst-select', 'source_instrument');
    bindSelect('filter-ref-inst-select', 'reference_instrument');
    bindSelect('filter-overlap-select', 'overlap_status');
    bindSelect('filter-sort-by-select', 'sort_by');

    // Sort order toggle
    const btnSortOrder = document.getElementById('btn-sort-order-toggle');
    if (btnSortOrder) {
      btnSortOrder.addEventListener('click', () => {
        this.filters.sort_order = this.filters.sort_order === 'asc' ? 'desc' : 'asc';
        this.render();
        this.attachEventListeners();
      });
    }

    // Table Header column sorting clicks
    document.querySelectorAll('.sortable-th, .sortable-col').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (key) {
          if (this.filters.sort_by === key) {
            this.filters.sort_order = this.filters.sort_order === 'asc' ? 'desc' : 'asc';
          } else {
            this.filters.sort_by = key;
            this.filters.sort_order = 'desc';
          }
          this.render();
          this.attachEventListeners();
        }
      });
    });

    // Clear all filters
    const btnClearAll = document.getElementById('btn-clear-all-filters');
    const btnEmptyClear = document.getElementById('btn-empty-clear-filters');
    if (btnClearAll) btnClearAll.addEventListener('click', this.handleClearFilters);
    if (btnEmptyClear) btnEmptyClear.addEventListener('click', this.handleClearFilters);

    // Refresh telemetry & retry buttons
    const btnRefresh = document.getElementById('btn-refresh-dataset');
    if (btnRefresh) btnRefresh.addEventListener('click', this.handleRefresh);

    const btnRetry = document.getElementById('btn-dataset-retry');
    if (btnRetry) btnRetry.addEventListener('click', this.handleRefresh);

    // Cross-drawer product view from region details
    document.querySelectorAll('.btn-view-prod-from-region').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pId = btn.dataset.productId;
        if (pId) this.openProductDrawer(pId);
      });
    });

    // Pagination buttons
    const btnPrev = document.getElementById('btn-page-prev');
    const btnNext = document.getElementById('btn-page-next');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (this.pagination[this.activeTab].page > 1) {
          this.pagination[this.activeTab].page -= 1;
          this.render();
          this.attachEventListeners();
        }
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.pagination[this.activeTab].page += 1;
        this.render();
        this.attachEventListeners();
      });
    }

    // Drawer Open Triggers
    document.querySelectorAll('.btn-inspect-product').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pId = btn.dataset.productId;
        this.openProductDrawer(pId);
      });
    });

    document.querySelectorAll('.btn-inspect-pair').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pairId = btn.dataset.pairId;
        this.openPairDrawer(pairId);
      });
    });

    document.querySelectorAll('.btn-inspect-region').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const regId = btn.dataset.regionId;
        this.openRegionDrawer(regId);
      });
    });

    // Drawer Close Triggers
    const overlay = document.getElementById('dataset-drawer-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeDrawer();
      });
    }

    const btnCloseProduct = document.getElementById('btn-close-product-drawer');
    const btnCloseProductFooter = document.getElementById('btn-drawer-product-close-footer');
    if (btnCloseProduct) btnCloseProduct.addEventListener('click', this.closeDrawer);
    if (btnCloseProductFooter) btnCloseProductFooter.addEventListener('click', this.closeDrawer);

    const btnClosePair = document.getElementById('btn-close-pair-drawer');
    const btnClosePairFooter = document.getElementById('btn-drawer-pair-close-footer');
    if (btnClosePair) btnClosePair.addEventListener('click', this.closeDrawer);
    if (btnClosePairFooter) btnClosePairFooter.addEventListener('click', this.closeDrawer);

    const btnCloseRegion = document.getElementById('btn-close-region-drawer');
    const btnCloseRegionFooter = document.getElementById('btn-drawer-region-close-footer');
    if (btnCloseRegion) btnCloseRegion.addEventListener('click', this.closeDrawer);
    if (btnCloseRegionFooter) btnCloseRegionFooter.addEventListener('click', this.closeDrawer);

    // Keyboard Esc to close drawer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeDrawer) {
        this.closeDrawer();
      }
    }, { once: true });
  }

  /**
   * Handle Tab Switch
   */
  handleTabSwitch(tabName) {
    this.activeTab = tabName;
    window.location.hash = `#/${tabName}`;
    this.render();
    this.attachEventListeners();
  }

  /**
   * Open Product Details Drawer and fetch files
   */
  async openProductDrawer(productId) {
    let prod = this.products.find(p => String(p.id) === String(productId) || String(p.product_id) === String(productId));
    if (!prod && window.productService && typeof window.productService.getProductById === 'function') {
      try {
        prod = await window.productService.getProductById(productId, { timeoutMs: 1800 });
      } catch (_) {}
    }
    if (!prod) return;

    this.activeDrawer = {
      type: 'product',
      data: prod,
      files: []
    };
    this.isLoadingFiles = true;
    this.filesError = null;
    this.render();
    this.attachEventListeners();

    // Query files manifest from backend API: /products/{product_id}/files
    try {
      if (window.productService && typeof window.productService.getProductFiles === 'function') {
        const files = await window.productService.getProductFiles(prod.id, { timeoutMs: 2000 });
        if (this.activeDrawer && this.activeDrawer.type === 'product' && this.activeDrawer.data.id === prod.id) {
          this.activeDrawer.files = Array.isArray(files) ? files : [];
        }
      }
    } catch (err) {
      console.warn('[DatasetPage] Failed to fetch product files manifest:', err);
      this.filesError = 'Backend storage manifest unreachable.';
    } finally {
      this.isLoadingFiles = false;
      this.render();
      this.attachEventListeners();
    }
  }

  /**
   * Open Pair Details Drawer
   */
  async openPairDrawer(pairId) {
    let pair = this.pairs.find(p => String(p.id) === String(pairId));
    if (!pair && window.pairService && typeof window.pairService.getPairById === 'function') {
      try {
        pair = await window.pairService.getPairById(pairId, { timeoutMs: 1800 });
      } catch (_) {}
    }
    if (!pair) return;

    this.activeDrawer = {
      type: 'pair',
      data: pair,
      registrationInput: null
    };
    this.render();
    this.attachEventListeners();

    // Query registration input from backend API: /pairs/{pair_id}/registration-input
    try {
      if (window.pairService && typeof window.pairService.getRegistrationInput === 'function') {
        const regInput = await window.pairService.getRegistrationInput(pair.id, { timeoutMs: 2000 });
        if (this.activeDrawer && this.activeDrawer.type === 'pair' && this.activeDrawer.data.id === pair.id) {
          this.activeDrawer.registrationInput = regInput;
        }
      }
    } catch (err) {
      console.warn('[DatasetPage] Failed to fetch pair registration-input:', err);
    }
  }

  /**
   * Open Region Details Drawer
   */
  async openRegionDrawer(regionId) {
    let reg = this.regions.find(r => String(r.id) === String(regionId));
    if (!reg && window.regionService && typeof window.regionService.getRegionById === 'function') {
      try {
        reg = await window.regionService.getRegionById(regionId, { timeoutMs: 1800 });
      } catch (_) {}
    }
    if (!reg) return;

    this.activeDrawer = {
      type: 'region',
      data: reg
    };
    this.render();
    this.attachEventListeners();
  }

  /**
   * Close any active drawer
   */
  closeDrawer() {
    this.activeDrawer = null;
    this.isLoadingFiles = false;
    this.filesError = null;
    const overlay = document.getElementById('dataset-drawer-overlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
    this.render();
    this.attachEventListeners();
  }

  /**
   * Clear all filters
   */
  handleClearFilters() {
    this.filters = {
      search: '',
      region_id: '',
      mission: '',
      instrument: '',
      product_type: '',
      calibration_status: '',
      overlap_status: '',
      resolution_range: 'all',
      source_instrument: '',
      reference_instrument: '',
      sort_by: 'acquisition_time',
      sort_order: 'desc'
    };
    this.pagination[this.activeTab].page = 1;
    this.render();
    this.attachEventListeners();
  }

  /**
   * Refresh telemetry from backend
   */
  async handleRefresh() {
    await this.syncFromBackend();
  }

  updateLoadingState() {
    const btn = document.getElementById('btn-refresh-dataset');
    if (btn) {
      const icon = btn.querySelector('.action-icon');
      if (icon) icon.classList.add('spin');
      btn.disabled = true;
    }
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.datasetPage = new DatasetPage();
}
if (typeof exports !== 'undefined') {
  exports.DatasetPage = DatasetPage;
}
