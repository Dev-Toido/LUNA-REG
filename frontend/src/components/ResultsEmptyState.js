/**
 * LUNA-REG: ResultsEmptyState Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Manages specialized states:
 * - Empty State: Required prompt text:
 *   "No completed registration results are available yet. Registration output will appear here after the backend processing API is connected."
 * - Loading State: High-tech planetary radar scanner animation with status ticker
 * - Error State: Clear error message with retry and return buttons
 */

class ResultsEmptyState {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onRetry = options.onRetry || (() => {});
    this.onSelectPair = options.onSelectPair || (() => {});
  }

  renderEmpty(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="res-state-shell empty-state">
        <div class="res-state-orb-wrap">
          <div class="res-state-orb">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <div class="res-state-pulse"></div>
        </div>

        <div class="res-state-badge">AWAITING BACKEND REGISTRATION RESULTS</div>
        <h3 class="res-state-title">REGISTRATION OUTPUT PENDING</h3>
        
        <p class="res-state-desc">
          No completed registration results are available yet. Registration output will appear here after the backend processing API is connected.
        </p>

        <div class="res-state-actions">
          <button type="button" class="btn-tech primary" id="btn-empty-select-pair">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
            <span>INSPECT AVAILABLE PAIR</span>
          </button>

          <button type="button" class="btn-tech" id="btn-empty-new-reg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <span>NEW REGISTRATION</span>
          </button>
        </div>
      </div>
    `;

    this.bindEmptyEvents();
  }

  renderLoading(containerEl, message = 'Loading pair telemetry & registration metadata...') {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="res-state-shell loading-state">
        <div class="res-loader-scanner">
          <div class="res-scanner-circle"></div>
          <div class="res-scanner-sweep"></div>
        </div>
        <div class="res-state-badge">QUERYING PLANETARY DATABASE</div>
        <h4 class="res-state-loading-title">${message}</h4>
        <span class="res-state-mono">FASTAPI ENDPOINT: /api/v1/pairs/{pair_id}/registration-input</span>
      </div>
    `;
  }

  renderError(containerEl, errorMessage = 'Failed to load pair telemetry.', onRetry = null) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    if (onRetry) this.onRetry = onRetry;

    this.container.innerHTML = `
      <div class="res-state-shell error-state">
        <div class="res-state-error-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e06c75" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="res-state-badge error">TELEMETRY ERROR</div>
        <h3 class="res-state-title">UNABLE TO RETRIEVE PAIR TELEMETRY</h3>
        <p class="res-state-desc">${errorMessage}</p>

        <div class="res-state-actions">
          <button type="button" class="btn-tech primary" id="btn-err-retry">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>RETRY QUERY</span>
          </button>
          <button type="button" class="btn-tech" id="btn-err-catalog">
            <span>VIEW CATALOG</span>
          </button>
        </div>
      </div>
    `;

    this.bindErrorEvents();
  }

  bindEmptyEvents() {
    if (!this.container) return;
    const btnSelect = this.container.querySelector('#btn-empty-select-pair');
    if (btnSelect) {
      btnSelect.addEventListener('click', () => {
        if (this.onSelectPair) this.onSelectPair();
        else if (typeof window.switchView === 'function') window.switchView('dataset');
      });
    }

    const btnNew = this.container.querySelector('#btn-empty-new-reg');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        if (typeof window.switchView === 'function') window.switchView('new-reg');
      });
    }
  }

  bindErrorEvents() {
    if (!this.container) return;
    const btnRetry = this.container.querySelector('#btn-err-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        if (this.onRetry) this.onRetry();
      });
    }

    const btnCat = this.container.querySelector('#btn-err-catalog');
    if (btnCat) {
      btnCat.addEventListener('click', () => {
        if (typeof window.switchView === 'function') window.switchView('dataset');
      });
    }
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResultsEmptyState;
}
if (typeof window !== 'undefined') {
  window.ResultsEmptyState = ResultsEmptyState;
}
