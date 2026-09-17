/**
 * LUNA-REG: RegistrationPreparationPage Controller
 * Hybrid Registration Preparation Workspace:
 * - Mode 1: DATABASE PAIR (Default) — loads from GET /api/v1/pairs & GET /api/v1/pairs/{id}/registration-input
 * - Mode 2: MANUAL UPLOAD — preserves existing drag-and-drop dual raster workflow
 * 
 * Note: No fake POST registration requests or fake progress is fabricated.
 */

class RegistrationPreparationPage {
  constructor() {
    this.sourceMode = 'manual-upload';
    this.availablePairs = [];
    this.selectedPairId = null;
    this.stagedRegistrationInput = null;
    this.loadingPair = false;
    this.loadingPairsList = false;
    this.pairFilter = '';
  }

  async init() {
    this.sourceMode = 'manual-upload';
    this.bindSourceSegmentedControl();
    this.updateSourceModeUI();
  }

  bindSourceSegmentedControl() {
    const btnDbPair = document.getElementById('btn-source-db-pair');
    const btnManual = document.getElementById('btn-source-manual-upload');

    if (btnDbPair && !btnDbPair.dataset.bound) {
      btnDbPair.dataset.bound = 'true';
      btnDbPair.addEventListener('click', () => this.setSourceMode('db-pair'));
    }

    if (btnManual && !btnManual.dataset.bound) {
      btnManual.dataset.bound = 'true';
      btnManual.addEventListener('click', () => this.setSourceMode('manual-upload'));
    }

    this.updateSourceModeUI();
  }

  setSourceMode(mode) {
    this.sourceMode = mode;
    this.updateSourceModeUI();
  }

  updateSourceModeUI() {
    const btnDbPair = document.getElementById('btn-source-db-pair');
    const btnManual = document.getElementById('btn-source-manual-upload');
    const containerDbPair = document.getElementById('reg-mode-db-pair-container');
    const containerManual = document.getElementById('reg-mode-manual-container');
    const ctaTip = document.getElementById('reg-cta-tip');
    const executeBtn = document.getElementById('btn-execute-registration');

    const isDb = (this.sourceMode === 'db-pair');

    if (btnDbPair) {
      btnDbPair.classList.toggle('active', isDb);
      btnDbPair.setAttribute('aria-selected', String(isDb));
    }
    if (btnManual) {
      btnManual.classList.toggle('active', !isDb);
      btnManual.setAttribute('aria-selected', String(!isDb));
    }

    if (containerDbPair) {
      containerDbPair.style.display = isDb ? 'block' : 'none';
    }
    if (containerManual) {
      containerManual.style.display = !isDb ? 'block' : 'none';
    }

    if (isDb) {
      if (executeBtn) {
        executeBtn.querySelector('span').textContent = 'PREPARE REGISTRATION →';
        executeBtn.disabled = !this.stagedRegistrationInput;
      }
      if (ctaTip) {
        ctaTip.textContent = this.stagedRegistrationInput
          ? 'Registration metadata loaded from backend. Processing API integration is pending.'
          : 'Select a canonical image pair from the database to prepare registration metadata.';
      }
    } else {
      if (typeof window.checkFilesReady === 'function') {
        window.checkFilesReady();
      }
    }
  }

  bindDatabasePairControls() {
    const pairSelect = document.getElementById('reg-db-pair-select');
    if (pairSelect && !pairSelect.dataset.bound) {
      pairSelect.dataset.bound = 'true';
      pairSelect.addEventListener('change', async (e) => {
        const pairId = e.target.value;
        if (pairId) {
          await this.stagePair(pairId);
        } else {
          this.clearStagedPair();
        }
      });
    }

    const refreshBtn = document.getElementById('btn-refresh-reg-pairs');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = 'true';
      refreshBtn.addEventListener('click', async () => {
        await this.loadAvailablePairs();
      });
    }

    const modalBrowseBtn = document.getElementById('btn-browse-pairs-picker');
    if (modalBrowseBtn && !modalBrowseBtn.dataset.bound) {
      modalBrowseBtn.dataset.bound = 'true';
      modalBrowseBtn.addEventListener('click', () => this.openPairPickerModal());
    }

    // Execute button in primary CTA
    const executeBtn = document.getElementById('btn-execute-registration');
    if (executeBtn && !executeBtn.dataset.boundPrepared) {
      executeBtn.dataset.boundPrepared = 'true';
      executeBtn.addEventListener('click', () => {
        if (this.sourceMode === 'db-pair') {
          this.handlePrepareRegistrationSubmit();
        }
      });
    }
  }

  async loadAvailablePairs() {
    this.loadingPairsList = true;
    const pairSelect = document.getElementById('reg-db-pair-select');
    if (pairSelect) {
      pairSelect.innerHTML = '<option value="">Loading available pairs from backend...</option>';
      pairSelect.disabled = true;
    }

    try {
      const pairs = await window.pairService.getPairs();
      this.availablePairs = Array.isArray(pairs) ? pairs : [];
      this.populatePairsDropdown();

      // If we had a previously selected pair, preserve or auto-select first
      if (this.selectedPairId) {
        if (pairSelect) pairSelect.value = String(this.selectedPairId);
      } else if (this.availablePairs.length > 0) {
        // Automatically stage the first available pair (e.g. Pair-B)
        const firstPair = this.availablePairs[0];
        if (pairSelect) pairSelect.value = String(firstPair.id);
        await this.stagePair(firstPair.id);
      }
    } catch (err) {
      console.error('Failed to load pairs list for registration preparation:', err);
      if (pairSelect) {
        pairSelect.innerHTML = '<option value="">Failed to connect to /api/v1/pairs</option>';
      }
    } finally {
      this.loadingPairsList = false;
      if (pairSelect) pairSelect.disabled = false;
    }
  }

  populatePairsDropdown() {
    const pairSelect = document.getElementById('reg-db-pair-select');
    if (!pairSelect) return;

    if (this.availablePairs.length === 0) {
      pairSelect.innerHTML = '<option value="">No canonical pairs in catalog</option>';
      return;
    }

    let html = '<option value="">-- SELECT CANONICAL LUNAR PAIR --</option>';
    this.availablePairs.forEach(p => {
      const ratio = (p.overlap_ratio !== null && p.overlap_ratio !== undefined)
        ? ` • ${(p.overlap_ratio * 100).toFixed(1)}% overlap`
        : '';
      html += `
        <option value="${p.id}" ${String(this.selectedPairId) === String(p.id) ? 'selected' : ''}>
          PAIR #${p.id} &bull; ${p.source_instrument} ↔ ${p.reference_instrument} [${p.overlap_status}]${ratio}
        </option>
      `;
    });

    pairSelect.innerHTML = html;
  }

  async stagePair(pairId) {
    if (!pairId) return;

    this.selectedPairId = pairId;
    this.loadingPair = true;

    // Update dropdown selection if not matched
    const pairSelect = document.getElementById('reg-db-pair-select');
    if (pairSelect && pairSelect.value !== String(pairId)) {
      pairSelect.value = String(pairId);
    }

    const container = document.getElementById('registration-input-container');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div class="canonical-loading-state" style="padding: 30px 20px;">
          <div class="planetary-radar-pulse"></div>
          <p style="margin-top:14px; color:var(--accent-gold); font-family:var(--font-mono); font-size:11px;">
            FETCHING REGISTRATION METADATA FROM /api/v1/pairs/${pairId}/registration-input...
          </p>
        </div>
      `;
    }

    try {
      const regInput = await window.pairService.getRegistrationInput(pairId);
      this.stagedRegistrationInput = regInput;

      if (container && typeof renderRegistrationInputPanel === 'function') {
        container.innerHTML = renderRegistrationInputPanel(regInput);

        const dismissBtn = container.querySelector('#btn-clear-staged-pair');
        if (dismissBtn) {
          dismissBtn.addEventListener('click', () => this.clearStagedPair());
        }
      }

      this.updateSourceModeUI();
    } catch (err) {
      console.error(`Failed to stage pair #${pairId}:`, err);
      if (container) {
        container.innerHTML = `
          <div class="canonical-error-state" style="padding: 24px;">
            <div class="error-msg">Failed to retrieve registration input: ${err.message}</div>
            <button type="button" class="btn-tech-sm" id="btn-retry-stage-pair" style="margin-top:10px;">RETRY</button>
          </div>
        `;
        const retryBtn = container.querySelector('#btn-retry-stage-pair');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => this.stagePair(pairId));
        }
      }
      this.stagedRegistrationInput = null;
      this.updateSourceModeUI();
    } finally {
      this.loadingPair = false;
    }
  }

  clearStagedPair() {
    this.selectedPairId = null;
    this.stagedRegistrationInput = null;

    const pairSelect = document.getElementById('reg-db-pair-select');
    if (pairSelect) pairSelect.value = '';

    const container = document.getElementById('registration-input-container');
    if (container) {
      container.innerHTML = `
        <div class="reg-db-empty-prompt">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <span style="font-size:12px; color:var(--text-muted); margin-top:8px;">
            Select a canonical lunar image pair above to inspect registration metadata and ground bounds.
          </span>
        </div>
      `;
    }

    this.updateSourceModeUI();
  }

  handlePrepareRegistrationSubmit() {
    if (!this.stagedRegistrationInput) {
      alert('Please select a canonical image pair from the database before proceeding.');
      return;
    }

    const pair = this.stagedRegistrationInput.pair;
    const source = this.stagedRegistrationInput.source || {};
    const reference = this.stagedRegistrationInput.reference || {};
    const srcProd = source.product || {};
    const refProd = reference.product || {};

    const modalContent = `
      <div class="registration-staging-summary">
        <div class="summary-icon" style="text-align:center; margin-bottom:14px;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        </div>
        <h4 style="color:var(--accent-gold); text-align:center; margin-bottom:6px; font-family:var(--font-mono); letter-spacing:0.05em;">
          REGISTRATION METADATA PREPARED
        </h4>
        <p style="font-size:12px; color:var(--text-light); text-align:center; line-height:1.6; margin-bottom:16px;">
          Canonical Pair <strong>#${pair.id}</strong> (${pair.source_instrument} ↔ ${pair.reference_instrument}) is validated and prepared in workspace state.
        </p>

        <div class="dataset-meta-list" style="margin-bottom:16px;">
          <div class="dataset-meta-row">
            <span>Source Product:</span>
            <strong>${srcProd.product_id || `#${pair.source_product_id}`}</strong>
          </div>
          <div class="dataset-meta-row">
            <span>Reference Product:</span>
            <strong>${refProd.product_id || `#${pair.reference_product_id}`}</strong>
          </div>
          <div class="dataset-meta-row">
            <span>Overlap Status:</span>
            <span>${pair.overlap_status || 'UNVERIFIED'}</span>
          </div>
          <div class="dataset-meta-row">
            <span>Overlap Ratio:</span>
            <span>${pair.overlap_ratio ? `${(pair.overlap_ratio * 100).toFixed(2)}%` : 'Not available'}</span>
          </div>
          <div class="dataset-meta-row">
            <span>Integration Notice:</span>
            <span style="color:var(--accent-gold);">Registration metadata loaded successfully. Processing API integration is pending.</span>
          </div>
        </div>

        <div style="text-align:center;">
          <button type="button" class="btn-tech primary" id="btn-summary-done">OK, CONTINUE</button>
        </div>
      </div>
    `;

    if (window.openAppModal) {
      window.openAppModal('REGISTRATION PREPARATION SUMMARY', modalContent);
      const doneBtn = document.getElementById('btn-summary-done');
      if (doneBtn) {
        doneBtn.addEventListener('click', () => {
          if (window.closeAppModal) window.closeAppModal();
        });
      }
    }
  }

  async openPairPickerModal() {
    try {
      const pairs = await window.pairService.getPairs();
      const modalContent = `
        <div class="pair-picker-modal-content">
          <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">
            Select a verified or unverified canonical lunar image pair from the database catalog to stage into the registration preparation workspace:
          </p>
          <div class="pair-picker-list">
            ${pairs.map(p => `
              <div class="pair-picker-item" data-pair-id="${p.id}">
                <div class="picker-item-main">
                  <strong>PAIR #${p.id}</strong>
                  <span class="picker-insts">${p.source_instrument || 'SOURCE'} ↔ ${p.reference_instrument || 'REF'}</span>
                </div>
                <div class="picker-item-meta">
                  <span>${p.overlap_status || 'UNVERIFIED'}</span>
                  <span>${p.overlap_ratio ? `${(p.overlap_ratio * 100).toFixed(1)}%` : ''}</span>
                </div>
                <button type="button" class="btn-tech-sm primary btn-select-pair-modal" data-pair-id="${p.id}">SELECT</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (window.openAppModal) {
        window.openAppModal('SELECT CANONICAL PAIR', modalContent);

        document.querySelectorAll('.btn-select-pair-modal').forEach(btn => {
          btn.addEventListener('click', async () => {
            const pairId = btn.dataset.pairId;
            if (window.closeAppModal) window.closeAppModal();
            this.setSourceMode('db-pair');
            await this.stagePair(pairId);
          });
        });
      }
    } catch (err) {
      alert(`Failed to load pairs list: ${err.message}`);
    }
  }
}

window.registrationPreparationPage = new RegistrationPreparationPage();
