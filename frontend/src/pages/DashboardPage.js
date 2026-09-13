/**
 * LUNA-REG: DashboardPage Controller
 * Manages live telemetry, health diagnostics, and database statistics from the FastAPI backend
 */

class DashboardPage {
  constructor() {
    this.stats = {
      isOnline: false,
      backendStatus: 'Checking...',
      apiVersion: '—',
      backendVersion: '—',
      environment: '—',
      productsCount: 0,
      pairsCount: 0,
      regionsCount: 0
    };
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
          ? window.productService.getProducts().catch(() => []) 
          : Promise.resolve([]),
        window.pairService 
          ? window.pairService.listPairs().catch(() => []) 
          : Promise.resolve([]),
        window.regionService 
          ? window.regionService.getRegions().catch(() => []) 
          : Promise.resolve([])
      ]);

      this.stats.isOnline = !!(health && health.online);
      this.stats.backendStatus = this.stats.isOnline ? 'Connected' : 'Backend unavailable';

      if (apiInfo && this.stats.isOnline) {
        this.stats.apiVersion = apiInfo.api_version || 'v1';
        this.stats.backendVersion = apiInfo.version || '0.1.0';
        this.stats.environment = apiInfo.environment || 'development';
      } else {
        this.stats.apiVersion = '—';
        this.stats.backendVersion = '—';
        this.stats.environment = '—';
      }

      this.stats.productsCount = Array.isArray(products) ? products.length : 0;
      this.stats.pairsCount = Array.isArray(pairs) ? pairs.length : 0;
      this.stats.regionsCount = Array.isArray(regions) ? regions.length : 0;

      this.updateUI();
    } catch (err) {
      console.warn('Dashboard telemetry check failed:', err);
      this.stats.isOnline = false;
      this.stats.backendStatus = 'Backend unavailable';
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
      sysApiVer.textContent = this.stats.apiVersion;
    }
    if (sysBackVer) {
      sysBackVer.textContent = this.stats.backendVersion;
    }
    if (sysEnv) {
      sysEnv.textContent = this.stats.environment;
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
        ? `FastAPI v${this.stats.backendVersion} (${this.stats.environment})`
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

    // 4. Products & Pairs count badges
    const prodCountEl = document.getElementById('dash-metric-products-count');
    if (prodCountEl) {
      prodCountEl.textContent = this.stats.productsCount;
    }

    const pairCountEl = document.getElementById('dash-metric-pairs-count');
    if (pairCountEl) {
      pairCountEl.textContent = this.stats.pairsCount;
    }
  }
}

window.dashboardPage = new DashboardPage();
