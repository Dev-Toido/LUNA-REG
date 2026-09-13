/**
 * LUNA-REG: DashboardPage Controller
 * Manages live telemetry and database statistics from the FastAPI backend
 */

class DashboardPage {
  constructor() {
    this.status = 'checking';
    this.stats = {
      productsCount: 0,
      pairsCount: 0,
      regionsCount: 0,
      backendStatus: 'CONNECTING',
      isOnline: false
    };
  }

  async init() {
    await this.refreshTelemetry();
  }

  async refreshTelemetry() {
    try {
      // Run health check and catalog counts in parallel
      const [health, products, pairs, regions] = await Promise.all([
        window.systemService ? window.systemService.checkHealth(2500) : Promise.resolve({ online: false }),
        window.productService ? window.productService.listProducts().catch(() => []) : Promise.resolve([]),
        window.pairService ? window.pairService.listPairs().catch(() => []) : Promise.resolve([]),
        window.regionService ? window.regionService.listRegions().catch(() => []) : Promise.resolve([])
      ]);

      this.stats.isOnline = health.online;
      this.stats.backendStatus = health.online ? 'ONLINE' : 'OFFLINE';
      this.stats.productsCount = Array.isArray(products) ? products.length : 0;
      this.stats.pairsCount = Array.isArray(pairs) ? pairs.length : 0;
      this.stats.regionsCount = Array.isArray(regions) ? regions.length : 0;

      this.updateUI();
    } catch (err) {
      console.warn('Dashboard telemetry check failed:', err);
      this.stats.backendStatus = 'OFFLINE';
      this.stats.isOnline = false;
      this.updateUI();
    }
  }

  updateUI() {
    // Backend Status Badge
    const statusValEl = document.getElementById('dash-backend-status-val');
    const statusSubEl = document.getElementById('dash-backend-status-sub');
    if (statusValEl) {
      statusValEl.textContent = this.stats.backendStatus;
      statusValEl.style.color = this.stats.isOnline ? 'var(--success)' : 'var(--error)';
    }
    if (statusSubEl) {
      statusSubEl.textContent = this.stats.isOnline 
        ? `Connected to FastAPI at ${window.apiService ? window.apiService.rootUrl : '127.0.0.1:8000'}`
        : 'Backend server not detected (Run uvicorn backend.app.main:app)';
    }

    // Sidebar status
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

    // Products / Pairs metrics if elements present
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
