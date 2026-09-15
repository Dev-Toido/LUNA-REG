/**
 * LUNA-REG: LunarMapPage Controller (Part 7)
 * Master orchestrator for the Lunar Map & GIS Explorer workspace at /lunar-map
 * 
 * Features:
 * - Real backend REST API queries (/regions, /products, /pairs)
 * - HiDPI multi-layer interactive canvas engine (LunarMapCanvas)
 * - Navigation tools (Pan, Select, Zoom In/Out, Fit-to-view, Reset, Fullscreen)
 * - Dynamic geodetic search (Regions, Products, Pairs)
 * - Layer toggles & opacity controls (Regions, Source, Reference, Overlap, Status)
 * - Selected feature telemetry inspector with deep links
 * - Real-time lunar Lat/Lon geodetic tracking & dynamic scale bar
 * - Zero blue mission control styling
 * - Zero Fake Data policy
 */

class LunarMapPage {
  constructor() {
    this.initialized = false;
    this.isLoading = false;
    this.errorMessage = null;

    // Component Instances & State
    this.mapCanvas = null;
    this.regions = [];
    this.products = [];
    this.pairs = [];
    this.regionsMap = {};

    // Interactive State
    this.activeTool = 'pan'; // 'pan' | 'select'
    this.selectedFeature = null;
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearchOpen = false;
    this.isFullscreen = false;
    this.isLayerPanelCollapsed = false;
    this.isLegendCollapsed = false;

    // Layer Settings
    this.layers = {
      regions: { visible: true, opacity: 0.85, count: 0 },
      sourceFootprints: { visible: true, opacity: 0.75, count: 0 },
      referenceFootprints: { visible: true, opacity: 0.75, count: 0 },
      overlapAreas: { visible: true, opacity: 0.65, count: 0 },
      coverage: { visible: true, opacity: 0.90, count: 0 }
    };

    // Telemetry Display State
    this.cursorLat = null;
    this.cursorLon = null;
    this.zoomLevel = 1.0;
    this.scaleKm = 250;

    // Bind methods
    this.handleFeatureSelect = this.handleFeatureSelect.bind(this);
    this.handleCoordinateHover = this.handleCoordinateHover.bind(this);
    this.handleZoomChange = this.handleZoomChange.bind(this);
    this.handleSearchInput = this.handleSearchInput.bind(this);
    this.handleSearchSelect = this.handleSearchSelect.bind(this);
    this.handleRetry = this.handleRetry.bind(this);
  }

  /**
   * Initialize or re-activate Lunar Map page
   */
  async init() {
    this.parseUrlParameters();

    const container = document.getElementById('map-workspace') || document.getElementById('view-lunar-map');
    if (!container) return;

    // Build master layout skeleton if not already mounted
    if (!this.initialized || !document.getElementById('lunar-map-canvas-container')) {
      this.renderLayout(container);
      this.initCanvas();
      this.initialized = true;
    } else if (!this.mapCanvas || !document.querySelector('.gis-map-canvas')) {
      this.initCanvas();
    }

    this.renderSubcomponents();
    this.attachEventListeners();

    if (this.mapCanvas) {
      this.mapCanvas.handleResize();
    }

    // Fetch data from real backend REST APIs
    await this.syncFromBackend();

    // Handle deep link feature selection if specified in URL params
    this.applyPendingSelection();
  }

  parseUrlParameters() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    this.pendingFeature = null;

    if (queryIndex !== -1) {
      const qs = hash.substring(queryIndex + 1);
      const params = new URLSearchParams(qs);

      if (params.get('pair_id')) {
        this.pendingFeature = { type: 'pair', id: params.get('pair_id') };
      } else if (params.get('product_id')) {
        this.pendingFeature = { type: 'product', id: params.get('product_id') };
      } else if (params.get('region_id')) {
        this.pendingFeature = { type: 'region', id: params.get('region_id') };
      }

      if (params.get('search')) {
        this.searchQuery = params.get('search');
      }
    }
  }

  renderLayout(container) {
    container.innerHTML = `
      <div class="lunar-map-page-wrapper" id="lunar-map-page-wrapper">
        <!-- 1. Top GIS Control Bar -->
        <header class="lunar-map-topbar" id="lunar-map-topbar">
          <div class="topbar-left">
            <div class="topbar-breadcrumb">
              <a href="#/dashboard">LUNA-REG</a>
              <span class="crumb-separator">/</span>
              <span class="crumb-current">LUNAR MAP &amp; GIS EXPLORER</span>
            </div>
            <h1 class="map-page-title text-gold">LUNAR SURFACE GIS WORKSPACE</h1>
          </div>

          <!-- Mount: Search Bar -->
          <div class="topbar-center" id="map-mount-search"></div>

          <!-- Mount: Navigation Toolbar -->
          <div class="topbar-right" id="map-mount-toolbar"></div>
        </header>

        <!-- 2. Main Interactive Map Area -->
        <div class="lunar-map-viewport-container" id="lunar-map-viewport-container">
          <!-- Canvas Renderer Mount -->
          <div class="lunar-map-canvas-container" id="lunar-map-canvas-container"></div>

          <!-- Mount: Layer Control Panel (Floating Top-Left) -->
          <div class="map-floating-layers-container" id="map-mount-layers"></div>

          <!-- Mount: Cartographic Symbology Legend (Floating Bottom-Left) -->
          <div class="map-floating-legend-container" id="map-mount-legend"></div>

          <!-- Mount: Selected Feature Information Panel (Floating Top-Right) -->
          <div class="map-floating-feature-container" id="map-mount-feature-info"></div>

          <!-- Mount: Coordinate and Scale Telemetry HUD (Floating Bottom-Center) -->
          <div class="map-floating-coords-container" id="map-mount-coords"></div>

          <!-- Mount: Loading, Error, and Retry Overlays -->
          <div class="map-overlay-container" id="map-mount-overlay"></div>
        </div>
      </div>
    `;
  }

  initCanvas() {
    const canvasMount = document.getElementById('lunar-map-canvas-container');
    if (!canvasMount) return;

    if (this.mapCanvas) {
      this.mapCanvas.destroy();
    }

    this.mapCanvas = new LunarMapCanvas({
      container: canvasMount,
      onFeatureSelect: this.handleFeatureSelect,
      onCoordinateHover: this.handleCoordinateHover,
      onZoomChange: this.handleZoomChange
    });
    this.mapCanvas.mount(canvasMount);
  }

  async syncFromBackend() {
    this.isLoading = true;
    this.errorMessage = null;
    this.renderOverlayState();

    try {
      const regService = window.regionService;
      const prodService = window.productService;
      const pairServ = window.pairService;

      const [regRes, prodRes, pairRes] = await Promise.allSettled([
        regService ? regService.getRegions({ timeoutMs: 3000 }) : Promise.resolve([]),
        prodService ? prodService.getProducts({}, { timeoutMs: 3000 }) : Promise.resolve([]),
        pairServ ? pairServ.getPairs({}, { timeoutMs: 3000 }) : Promise.resolve([])
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
      }

      if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value)) {
        this.products = prodRes.value;
        anySucceeded = true;
      }

      if (pairRes.status === 'fulfilled' && Array.isArray(pairRes.value)) {
        this.pairs = pairRes.value;
        anySucceeded = true;
      }

      if (!anySucceeded) {
        this.errorMessage = 'Backend GIS service unreachable at /products, /pairs, /regions. Verify that FastAPI server is running on http://127.0.0.1:8000.';
      } else {
        // Update layer counts
        this.layers.regions.count = this.regions.length;
        this.layers.sourceFootprints.count = this.products.length;
        this.layers.referenceFootprints.count = this.products.length;
        this.layers.overlapAreas.count = this.pairs.length;
        this.layers.coverage.count = this.pairs.length;

        // Push data to canvas
        if (this.mapCanvas) {
          this.mapCanvas.setData({
            regions: this.regions,
            products: this.products,
            pairs: this.pairs
          });
          this.mapCanvas.setLayerSettings(this.layers);
        }
      }
    } catch (err) {
      console.warn('[LunarMapPage] Sync error:', err);
      this.errorMessage = (err && err.message) || 'Error communicating with backend catalog service.';
    } finally {
      this.isLoading = false;
      this.renderSubcomponents();
      this.renderOverlayState();
      this.attachEventListeners();
      if (this.mapCanvas) {
        this.mapCanvas.handleResize();
      }
    }
  }

  renderSubcomponents() {
    // 1. Render Toolbar
    const toolbarMount = document.getElementById('map-mount-toolbar');
    if (toolbarMount && typeof renderMapToolbar === 'function') {
      toolbarMount.innerHTML = renderMapToolbar({
        activeTool: this.activeTool,
        isFullscreen: this.isFullscreen,
        zoomLevel: this.zoomLevel
      });
    }

    // 2. Render Search
    const searchMount = document.getElementById('map-mount-search');
    if (searchMount && typeof renderMapSearch === 'function') {
      searchMount.innerHTML = renderMapSearch({
        query: this.searchQuery,
        results: this.searchResults,
        isOpen: this.isSearchOpen
      });
    }

    // 3. Render Layer Panel
    const layerMount = document.getElementById('map-mount-layers');
    if (layerMount && typeof renderMapLayerPanel === 'function') {
      layerMount.innerHTML = renderMapLayerPanel({
        layers: this.layers,
        isCollapsed: this.isLayerPanelCollapsed
      });
    }

    // 4. Render Legend
    const legendMount = document.getElementById('map-mount-legend');
    if (legendMount && typeof renderMapLegend === 'function') {
      legendMount.innerHTML = renderMapLegend({
        isCollapsed: this.isLegendCollapsed
      });
    }

    // 5. Render Feature Info Panel
    const featureMount = document.getElementById('map-mount-feature-info');
    if (featureMount && typeof renderFeatureInfoPanel === 'function') {
      featureMount.innerHTML = renderFeatureInfoPanel({
        feature: this.selectedFeature,
        regionsMap: this.regionsMap
      });
    }

    // 6. Render Coordinates HUD
    const coordsMount = document.getElementById('map-mount-coords');
    if (coordsMount && typeof renderCoordinateDisplay === 'function') {
      coordsMount.innerHTML = renderCoordinateDisplay({
        cursorLat: this.cursorLat,
        cursorLon: this.cursorLon,
        scaleKm: this.scaleKm,
        crs: 'Moon 2000 IAU / IAG'
      });
    }

    // 7. Render Overlays
    this.renderOverlayState();
  }

  renderOverlayState() {
    const overlayMount = document.getElementById('map-mount-overlay');
    if (!overlayMount) return;

    if (this.isLoading) {
      overlayMount.innerHTML = typeof renderMapEmptyState === 'function'
        ? renderMapEmptyState({
            type: 'loading',
            title: 'SYNCHRONIZING LUNAR GIS...',
            message: 'Streaming geodetic footprints and telemetry from canonical catalog.'
          })
        : '<div class="loading-state">Loading GIS layers...</div>';
      overlayMount.style.display = 'block';
    } else if (this.errorMessage && !this.products.length && !this.pairs.length && !this.regions.length) {
      overlayMount.innerHTML = typeof renderMapErrorState === 'function'
        ? renderMapErrorState({
            title: 'GIS ARCHIVE QUERY FAILED',
            message: this.errorMessage,
            actionText: 'RETRY CONNECTION'
          })
        : '<div class="error-state">Error querying GIS catalog.</div>';
      overlayMount.style.display = 'block';
    } else {
      overlayMount.innerHTML = '';
      overlayMount.style.display = 'none';
    }
  }

  attachEventListeners() {
    // Toolbar tool modes
    const btnPan = document.getElementById('tool-btn-pan');
    const btnSelect = document.getElementById('tool-btn-select');
    if (btnPan) {
      btnPan.onclick = () => {
        this.activeTool = 'pan';
        if (this.mapCanvas) this.mapCanvas.setTool('pan');
        this.renderSubcomponents();
      };
    }
    if (btnSelect) {
      btnSelect.onclick = () => {
        this.activeTool = 'select';
        if (this.mapCanvas) this.mapCanvas.setTool('select');
        this.renderSubcomponents();
      };
    }

    // Zoom and Viewport Actions
    const btnZoomIn = document.getElementById('map-btn-zoomin');
    const btnZoomOut = document.getElementById('map-btn-zoomout');
    const btnFit = document.getElementById('map-btn-fit');
    const btnReset = document.getElementById('map-btn-reset');
    const btnFullscreen = document.getElementById('map-btn-fullscreen');

    if (btnZoomIn) btnZoomIn.onclick = () => this.mapCanvas && this.mapCanvas.zoomIn();
    if (btnZoomOut) btnZoomOut.onclick = () => this.mapCanvas && this.mapCanvas.zoomOut();
    if (btnFit) btnFit.onclick = () => this.mapCanvas && this.mapCanvas.fitToView(this.selectedFeature);
    if (btnReset) btnReset.onclick = () => this.mapCanvas && this.mapCanvas.resetView();

    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        const wrap = document.getElementById('lunar-map-page-wrapper');
        if (!wrap) return;

        if (!document.fullscreenElement) {
          wrap.requestFullscreen().then(() => {
            this.isFullscreen = true;
            this.renderSubcomponents();
          }).catch(err => console.warn(err));
        } else {
          document.exitFullscreen().then(() => {
            this.isFullscreen = false;
            this.renderSubcomponents();
          }).catch(err => console.warn(err));
        }
      };
    }

    // Layer Checkboxes & Sliders
    const layerKeys = ['regions', 'sourceFootprints', 'referenceFootprints', 'overlapAreas', 'coverage'];
    const chkIds = {
      regions: 'chk-layer-regions',
      sourceFootprints: 'chk-layer-source',
      referenceFootprints: 'chk-layer-reference',
      overlapAreas: 'chk-layer-overlap',
      coverage: 'chk-layer-coverage'
    };
    const sliderIds = {
      regions: 'slider-opacity-regions',
      sourceFootprints: 'slider-opacity-source',
      referenceFootprints: 'slider-opacity-reference',
      overlapAreas: 'slider-opacity-overlap',
      coverage: 'slider-opacity-coverage'
    };

    layerKeys.forEach(k => {
      const chk = document.getElementById(chkIds[k]);
      if (chk) {
        chk.onchange = (e) => {
          this.layers[k].visible = e.target.checked;
          if (this.mapCanvas) this.mapCanvas.setLayerSettings(this.layers);
        };
      }

      const slider = document.getElementById(sliderIds[k]);
      if (slider) {
        slider.oninput = (e) => {
          const val = parseFloat(e.target.value);
          this.layers[k].opacity = val;
          const valReadout = document.getElementById(`val-opacity-${k.replace('Footprints', '').replace('Areas', '')}`);
          if (valReadout) valReadout.textContent = `${Math.round(val * 100)}%`;
          if (this.mapCanvas) this.mapCanvas.setLayerSettings(this.layers);
        };
      }
    });

    // Layer Panel Toggle Header
    const layerHeader = document.getElementById('btn-toggle-layer-panel');
    if (layerHeader) {
      layerHeader.onclick = () => {
        this.isLayerPanelCollapsed = !this.isLayerPanelCollapsed;
        const panel = document.getElementById('map-layer-panel');
        if (panel) panel.classList.toggle('collapsed', this.isLayerPanelCollapsed);
      };
    }

    // Legend Toggle Header
    const legendHeader = document.getElementById('btn-toggle-legend');
    if (legendHeader) {
      legendHeader.onclick = () => {
        this.isLegendCollapsed = !this.isLegendCollapsed;
        const leg = document.getElementById('map-legend');
        if (leg) leg.classList.toggle('collapsed', this.isLegendCollapsed);
      };
    }

    // Close Feature Inspector
    const btnCloseFeature = document.getElementById('btn-close-feature-panel');
    if (btnCloseFeature) {
      btnCloseFeature.onclick = () => {
        this.selectedFeature = null;
        if (this.mapCanvas) this.mapCanvas.setSelectedFeature(null);
        this.renderSubcomponents();
      };
    }

    // Search Input & Clear
    const searchInput = document.getElementById('map-feature-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => this.handleSearchInput(e.target.value);
      searchInput.onfocus = () => {
        if (this.searchQuery) {
          this.isSearchOpen = true;
          this.renderSubcomponents();
        }
      };
    }

    const btnClearSearch = document.getElementById('btn-clear-map-search');
    if (btnClearSearch) {
      btnClearSearch.onclick = () => {
        this.searchQuery = '';
        this.searchResults = [];
        this.isSearchOpen = false;
        this.renderSubcomponents();
      };
    }

    // Search Item Selection Delegate
    const searchDropdown = document.getElementById('map-search-dropdown');
    if (searchDropdown) {
      searchDropdown.onclick = (e) => {
        const itemEl = e.target.closest('.search-result-item');
        if (itemEl) {
          const idx = parseInt(itemEl.dataset.index, 10);
          this.handleSearchSelect(this.searchResults[idx]);
        }
      };
    }

    // Retry Button
    const btnRetry = document.getElementById('btn-retry-map-sync');
    if (btnRetry) {
      btnRetry.onclick = () => this.handleRetry();
    }

    const btnDismissErr = document.getElementById('btn-dismiss-map-error');
    if (btnDismissErr) {
      btnDismissErr.onclick = () => {
        const overlayMount = document.getElementById('map-mount-overlay');
        if (overlayMount) overlayMount.style.display = 'none';
        if (this.mapCanvas) this.mapCanvas.handleResize();
      };
    }
  }

  handleSearchInput(query) {
    this.searchQuery = query;
    const q = (query || '').trim().toLowerCase();

    if (q.length < 2) {
      this.searchResults = [];
      this.isSearchOpen = false;
      this.renderSubcomponents();
      return;
    }

    const results = [];

    // Search Regions
    this.regions.forEach(r => {
      const nameMatch = (r.name || '').toLowerCase().includes(q);
      const idMatch = String(r.id).includes(q) || `reg-#${r.id}`.includes(q);
      if (nameMatch || idMatch) {
        results.push({
          type: 'region',
          id: r.id,
          data: r,
          title: r.name || `Region #${r.id}`,
          subtitle: `${r.region_type || 'Region'} • REG-#${r.id}`
        });
      }
    });

    // Search Products
    this.products.forEach(p => {
      const pidMatch = (p.product_id || '').toLowerCase().includes(q);
      const instMatch = (p.instrument || '').toLowerCase().includes(q);
      if (pidMatch || instMatch) {
        results.push({
          type: 'product',
          id: p.id,
          data: p,
          title: p.product_id || `PROD-${p.id}`,
          subtitle: `${p.instrument || 'Sensor'} • ${p.mission || 'Chandrayaan-2'}`
        });
      }
    });

    // Search Pairs
    this.pairs.forEach(pair => {
      const idMatch = String(pair.id) === q || `pair-${pair.id}`.includes(q) || `pair #${pair.id}`.includes(q);
      const instMatch = `${pair.source_instrument}-${pair.reference_instrument}`.toLowerCase().includes(q);
      if (idMatch || instMatch) {
        results.push({
          type: 'pair',
          id: pair.id,
          data: pair,
          title: `PAIR #${pair.id}`,
          subtitle: `${pair.source_instrument} ↔ ${pair.reference_instrument} (${pair.overlap_status || 'UNVERIFIED'})`
        });
      }
    });

    this.searchResults = results.slice(0, 10);
    this.isSearchOpen = true;
    this.renderSubcomponents();
  }

  handleSearchSelect(item) {
    if (!item) return;

    this.isSearchOpen = false;
    this.selectedFeature = { type: item.type, id: item.id, data: item.data };

    if (this.mapCanvas) {
      this.mapCanvas.setSelectedFeature(this.selectedFeature);
      this.mapCanvas.fitToView(this.selectedFeature);
    }

    this.renderSubcomponents();
  }

  handleFeatureSelect(feature) {
    this.selectedFeature = feature;
    this.renderSubcomponents();
  }

  handleCoordinateHover(lat, lon) {
    this.cursorLat = lat;
    this.cursorLon = lon;

    const valEl = document.getElementById('hud-coord-val');
    if (valEl && lat !== null && lon !== null) {
      const latDir = lat >= 0 ? 'N' : 'S';
      const lonDir = lon >= 0 ? 'E' : 'W';
      valEl.textContent = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
    }
  }

  handleZoomChange(zoom) {
    this.zoomLevel = zoom;

    // Scale calculation: equator circumference = 10,921 km / (720px * zoom)
    this.scaleKm = Math.max(10, Math.min(2500, 350 / zoom));

    const zoomReadout = document.getElementById('map-zoom-readout');
    if (zoomReadout) {
      zoomReadout.textContent = `${Math.round(zoom * 100)}%`;
    }

    const scaleLabel = document.getElementById('hud-scale-label');
    if (scaleLabel) {
      scaleLabel.textContent = this.scaleKm >= 1000 
        ? `${(this.scaleKm / 1000).toFixed(1)}k km` 
        : `${Math.round(this.scaleKm)} km`;
    }
  }

  applyPendingSelection() {
    if (!this.pendingFeature) return;

    const { type, id } = this.pendingFeature;
    let found = null;

    if (type === 'pair') {
      const p = this.pairs.find(item => String(item.id) === String(id));
      if (p) found = { type: 'pair', id: p.id, data: p };
    } else if (type === 'product') {
      const p = this.products.find(item => String(item.id) === String(id) || item.product_id === id);
      if (p) found = { type: 'product', id: p.id, data: p };
    } else if (type === 'region') {
      const r = this.regions.find(item => String(item.id) === String(id));
      if (r) found = { type: 'region', id: r.id, data: r };
    }

    if (found) {
      this.selectedFeature = found;
      if (this.mapCanvas) {
        this.mapCanvas.setSelectedFeature(found);
        this.mapCanvas.fitToView(found);
      }
      this.renderSubcomponents();
    }
  }

  handleRetry() {
    this.syncFromBackend();
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.lunarMapPage = new LunarMapPage();
}
