/**
 * LUNA-REG: DashboardPage Controller
 * Manages live telemetry, health diagnostics, database statistics, and Available Registration Pairs from FastAPI backend
 */

class DashboardPage {
  constructor() {
    this.stats = {
      isOnline: false,
      backendStatus: 'Checking...',
      apiVersion: null,
      backendVersion: null,
      environment: null,
      productsCount: null,
      pairsCount: null,
      regionsCount: null,
      unverifiedPairsCount: null
    };
    this.availablePairs = [];
    this.regionsMap = {};
  }

  async init() {
    await this.refreshTelemetry();
  }

  async refreshTelemetry() {
    try {
      const [health, apiInfo, products, pairs, regions] = await Promise.all([
        window.systemService 
          ? window.systemService.getHealth() 
          : Promise.resolve({ online: false, status: 'Backend unavailable' }),
        window.systemService 
          ? window.systemService.getApiInfo().catch(() => null) 
          : Promise.resolve(null),
        window.productService 
          ? window.productService.getProducts().catch(() => null) 
          : Promise.resolve(null),
        window.pairService 
          ? window.pairService.getPairs().catch(() => null) 
          : Promise.resolve(null),
        window.regionService 
          ? window.regionService.getRegions().catch(() => null) 
          : Promise.resolve(null)
      ]);

      this.stats.isOnline = !!(health && health.online);
      this.stats.backendStatus = this.stats.isOnline ? 'Connected' : 'Backend unavailable';

      if (apiInfo && this.stats.isOnline) {
        this.stats.apiVersion = apiInfo.api_version || null;
        this.stats.backendVersion = apiInfo.version || null;
        this.stats.environment = apiInfo.environment || null;
      } else {
        this.stats.apiVersion = null;
        this.stats.backendVersion = null;
        this.stats.environment = null;
      }

      // Count only if backend returned actual array, else null (display --)
      this.stats.productsCount = Array.isArray(products) ? products.length : null;
      this.stats.pairsCount = Array.isArray(pairs) ? pairs.length : null;
      this.stats.regionsCount = Array.isArray(regions) ? regions.length : null;

      if (Array.isArray(pairs)) {
        this.availablePairs = pairs;
        this.stats.unverifiedPairsCount = pairs.filter(p => (p.overlap_status || '').toUpperCase() === 'UNVERIFIED').length;
      } else {
        this.availablePairs = [];
        this.stats.unverifiedPairsCount = null;
      }

      if (Array.isArray(regions)) {
        this.regionsMap = {};
        regions.forEach(r => {
          if (r && r.id) this.regionsMap[String(r.id)] = r;
        });
      }

      this.updateUI();
    } catch (err) {
      console.warn('Dashboard telemetry check failed:', err);
      this.stats.isOnline = false;
      this.stats.backendStatus = 'Backend unavailable';
      this.stats.productsCount = null;
      this.stats.pairsCount = null;
      this.stats.regionsCount = null;
      this.stats.unverifiedPairsCount = null;
      this.updateUI();
    }
  }

  updateUI() {
    // 1. System Status Panel cells
    const sysBackend = document.getElementById('sys-status-backend');
    const sysApiVer = document.getElementById('sys-status-api-ver');
    const sysBackVer = document.getElementById('sys-status-backend-ver');
    const sysEnv = document.getElementById('sys-status-env');

    if (sysBackend) {
      sysBackend.textContent = this.stats.backendStatus;
      sysBackend.style.color = this.stats.isOnline ? 'var(--success)' : 'var(--error)';
    }
    if (sysApiVer) {
      sysApiVer.textContent = this.stats.apiVersion || '--';
    }
    if (sysBackVer) {
      sysBackVer.textContent = this.stats.backendVersion || '--';
    }
    if (sysEnv) {
      sysEnv.textContent = this.stats.environment || '--';
    }

    // 2. Telemetry Card Badges
    const statusValEl = document.getElementById('dash-backend-status-val');
    const statusSubEl = document.getElementById('dash-backend-status-sub');
    if (statusValEl) {
      statusValEl.textContent = this.stats.backendStatus.toUpperCase();
      statusValEl.style.color = this.stats.isOnline ? 'var(--success)' : 'var(--error)';
    }
    if (statusSubEl) {
      statusSubEl.textContent = this.stats.isOnline 
        ? `FastAPI v${this.stats.backendVersion || '0.1.0'} (${this.stats.environment || 'development'})`
        : 'Backend server not detected (Run uvicorn backend.app.main:app)';
    }

    // 3. Left Sidebar orbiter indicator
    const sidebarStatusCircle = document.querySelector('.sidebar-footer .status-circle');
    const sidebarStatusText = document.querySelector('.sidebar-footer span:nth-child(2)');
    if (sidebarStatusCircle && sidebarStatusText) {
      if (this.stats.isOnline) {
        sidebarStatusCircle.style.background = 'var(--success)';
        sidebarStatusCircle.style.boxShadow = '0 0 6px rgba(46, 213, 115, 0.4)';
        sidebarStatusText.textContent = 'BACKEND ONLINE';
      } else {
        sidebarStatusCircle.style.background = 'var(--error)';
        sidebarStatusCircle.style.boxShadow = '0 0 6px rgba(255, 71, 87, 0.4)';
        sidebarStatusText.textContent = 'BACKEND OFFLINE';
      }
    }

    // 4. Products, Pairs, Regions, & Unverified count badges (Never display 0 if unavailable, display --)
    const prodCountEl = document.getElementById('dash-metric-products-count');
    if (prodCountEl) {
      prodCountEl.textContent = this.stats.productsCount !== null ? String(this.stats.productsCount) : '--';
    }

    const pairCountEl = document.getElementById('dash-metric-pairs-count');
    if (pairCountEl) {
      pairCountEl.textContent = this.stats.pairsCount !== null ? String(this.stats.pairsCount) : '--';
    }

    const regionCountEl = document.getElementById('dash-metric-regions-count');
    if (regionCountEl) {
      regionCountEl.textContent = this.stats.regionsCount !== null ? String(this.stats.regionsCount) : '--';
    }

    const unverifiedCountEl = document.getElementById('dash-metric-unverified-count');
    if (unverifiedCountEl) {
      unverifiedCountEl.textContent = this.stats.unverifiedPairsCount !== null ? String(this.stats.unverifiedPairsCount) : '--';
    }

    // 5. Available Registration Pairs Table on Dashboard
    this.renderAvailablePairsTable();
  }

  renderAvailablePairsTable() {
    const tableContainer = document.getElementById('dash-available-pairs-container');
    if (!tableContainer) return;

    if (!this.stats.isOnline) {
      tableContainer.innerHTML = `
        <div class="dash-empty-pairs-hint">
          <span>Backend unavailable. Start the FastAPI backend server to load available registration pairs.</span>
        </div>
      `;
      return;
    }

    if (this.availablePairs.length === 0) {
      tableContainer.innerHTML = `
        <div class="dash-empty-pairs-hint">
          <span>No canonical registration pairs available in the database catalog.</span>
        </div>
      `;
      return;
    }

    // Show up to 5 pairs on dashboard
    const displayPairs = this.availablePairs.slice(0, 5);

    tableContainer.innerHTML = `
      <table class="canonical-table" id="dash-pairs-table">
        <thead>
          <tr>
            <th>PAIR ID</th>
            <th>SOURCE</th>
            <th>REFERENCE</th>
            <th>OVERLAP STATUS</th>
            <th>REGION</th>
            <th style="text-align:right;">ACTION</th>
          </tr>
        </thead>
        <tbody>
          ${displayPairs.map(p => {
            let regionLabel = 'Not assigned';
            if (p.region_id !== null && p.region_id !== undefined && p.region_id !== '') {
              if (this.regionsMap && this.regionsMap[String(p.region_id)]) {
                regionLabel = this.regionsMap[String(p.region_id)].name || `Region #${p.region_id}`;
              } else if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
                regionLabel = window.regionService.formatRegionName(p.region_id);
              } else {
                regionLabel = `Region #${p.region_id}`;
              }
            }

            const status = p.overlap_status || 'UNVERIFIED';

            return `
              <tr data-pair-id="${p.id}">
                <td class="col-mono col-highlight">PAIR #${p.id}</td>
                <td><span class="pair-inst-tag source">${p.source_instrument || '—'}</span></td>
                <td><span class="pair-inst-tag ref">${p.reference_instrument || '—'}</span></td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(status) : status}</td>
                <td><span class="${p.region_id ? '' : 'col-muted'}">${regionLabel}</span></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button type="button" class="btn-tech-sm btn-dash-view-pair" data-pair-id="${p.id}" title="Inspect pair metadata">
                    VIEW PAIR
                  </button>
                  <button type="button" class="btn-tech-sm primary btn-dash-prepare-pair" data-pair-id="${p.id}" title="Prepare in registration workspace" style="margin-left:6px;">
                    PREPARE
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // Bind action buttons
    tableContainer.querySelectorAll('.btn-dash-view-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        if (window.pairsPage) {
          await window.pairsPage.inspectPair(pairId);
        }
      });
    });

    tableContainer.querySelectorAll('.btn-dash-prepare-pair').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        if (window.pairsPage) {
          await window.pairsPage.preparePair(pairId);
        }
      });
    });
  }
}

window.dashboardPage = new DashboardPage();

