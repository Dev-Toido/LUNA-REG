/**
 * LUNA-REG: ResultsHeader Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Features:
 * - Breadcrumbs: DASHBOARD > LUNAR MAP > REGISTRATION RESULTS
 * - Title & Subtitle with dynamic active Pair ID badge
 * - Active Pair Selector Dropdown (fetches from pairService)
 * - Real-time Backend Health Telemetry Indicator
 * - Synchronize URL query parameter `#/results?pair_id=<pair_id>`
 * - Refresh button & Back to Explorer / Dashboard button
 */

class ResultsHeader {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onPairChange = options.onPairChange || (() => {});
    this.onRefresh = options.onRefresh || (() => {});
    this.onBack = options.onBack || (() => {});
    this.activePairId = null;
    this.pairs = [];
    this.backendHealth = { online: false, message: 'CHECKING...' };
  }

  setPairId(pairId) {
    this.activePairId = pairId;
    const select = this.container ? this.container.querySelector('#results-pair-select') : null;
    if (select && pairId) {
      select.value = String(pairId);
    }
    const badge = this.container ? this.container.querySelector('#results-pair-badge') : null;
    if (badge) {
      badge.textContent = pairId ? `PAIR #${pairId}` : 'NO PAIR SELECTED';
    }
  }

  setPairs(pairs) {
    this.pairs = pairs || [];
    this.renderPairSelectOptions();
  }

  setBackendHealth(isOnline, info = '') {
    this.backendHealth = {
      online: !!isOnline,
      message: isOnline ? 'BACKEND ONLINE' : 'OFFLINE MODE'
    };
    const pill = this.container ? this.container.querySelector('#results-backend-status') : null;
    if (pill) {
      pill.className = `res-status-indicator ${isOnline ? 'online' : 'offline'}`;
      pill.innerHTML = `
        <span class="res-status-dot"></span>
        <span class="res-status-text">${this.backendHealth.message}</span>
      `;
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="results-header-bar">
        <div class="results-header-left">
          <nav class="results-breadcrumb" aria-label="Breadcrumb">
            <span class="res-bc-link" id="res-nav-bc-dash" role="button" tabindex="0">DASHBOARD</span>
            <span class="res-bc-sep">/</span>
            <span class="res-bc-link" id="res-nav-bc-map" role="button" tabindex="0">LUNAR MAP</span>
            <span class="res-bc-sep">/</span>
            <span class="res-bc-active">REGISTRATION RESULTS</span>
          </nav>
          <div class="results-title-row">
            <h1 class="results-main-title">REGISTRATION RESULTS</h1>
            <span class="results-pair-pill" id="results-pair-badge">
              ${this.activePairId ? `PAIR #${this.activePairId}` : 'NO PAIR SELECTED'}
            </span>
            <div class="res-status-indicator ${this.backendHealth.online ? 'online' : 'offline'}" id="results-backend-status">
              <span class="res-status-dot"></span>
              <span class="res-status-text">${this.backendHealth.message}</span>
            </div>
          </div>
          <p class="results-subtitle">
            Multi-modal lunar satellite correspondence analysis, cross-sensor telemetry, and geometric verification.
          </p>
        </div>

        <div class="results-header-right">
          <!-- Pair Selector Dropdown -->
          <div class="results-pair-selector-wrap" title="Select registered lunar image pair">
            <label for="results-pair-select" class="res-pair-lbl">ACTIVE PAIR:</label>
            <div class="res-select-shell">
              <select id="results-pair-select" class="res-pair-select" aria-label="Select lunar image pair">
                <option value="">-- Select Lunar Pair --</option>
              </select>
              <svg class="res-select-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          <!-- Refresh Action -->
          <button type="button" class="btn-tech-sm" id="btn-results-refresh" title="Reload pair telemetry and registration status">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>REFRESH</span>
          </button>

          <!-- Back to Explorer -->
          <button type="button" class="btn-tech" id="btn-results-back" title="Return to Lunar Terrain Explorer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>EXPLORER</span>
          </button>
        </div>
      </div>
    `;

    this.renderPairSelectOptions();
    this.bindEvents();
  }

  renderPairSelectOptions() {
    if (!this.container) return;
    const select = this.container.querySelector('#results-pair-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Lunar Pair --</option>';
    this.pairs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      const label = `Pair #${p.id}: ${p.source_instrument || 'SOURCE'} + ${p.reference_instrument || 'REF'} (${p.overlap_status || 'VERIFIED'})`;
      opt.textContent = label;
      if (this.activePairId && String(this.activePairId) === String(p.id)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  bindEvents() {
    if (!this.container) return;

    const bcDash = this.container.querySelector('#res-nav-bc-dash');
    if (bcDash) {
      bcDash.addEventListener('click', () => {
        if (typeof window.switchView === 'function') window.switchView('dashboard');
      });
    }

    const bcMap = this.container.querySelector('#res-nav-bc-map');
    if (bcMap) {
      bcMap.addEventListener('click', () => {
        if (typeof window.switchView === 'function') window.switchView('explorer');
      });
    }

    const select = this.container.querySelector('#results-pair-select');
    if (select) {
      select.addEventListener('change', (e) => {
        const val = e.target.value;
        if (this.onPairChange) this.onPairChange(val ? parseInt(val, 10) : null);
      });
    }

    const refreshBtn = this.container.querySelector('#btn-results-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (this.onRefresh) this.onRefresh();
      });
    }

    const backBtn = this.container.querySelector('#btn-results-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.onBack) {
          this.onBack();
        } else if (typeof window.switchView === 'function') {
          window.switchView('explorer');
        }
      });
    }
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResultsHeader;
}
if (typeof window !== 'undefined') {
  window.ResultsHeader = ResultsHeader;
}
