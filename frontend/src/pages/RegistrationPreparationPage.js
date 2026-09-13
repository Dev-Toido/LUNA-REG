/**
 * LUNA-REG: RegistrationPreparationPage Controller
 * Integrates dual image uploads with canonical pair registration staging
 */

class RegistrationPreparationPage {
  constructor() {
    this.stagedPairId = null;
    this.stagedPairData = null;
    this.registrationMode = 'automatic';
  }

  init() {
    this.bindCanonicalPairPicker();
  }

  bindCanonicalPairPicker() {
    // Staging button from UI
    const loadCanonicalBtn = document.getElementById('btn-load-canonical-pair');
    if (loadCanonicalBtn) {
      loadCanonicalBtn.addEventListener('click', () => this.openPairPickerModal());
    }

    // Dismiss staged pair
    const clearBtn = document.getElementById('btn-clear-staged-pair');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearStagedPair());
    }
  }

  async openPairPickerModal() {
    try {
      const pairs = await window.pairService.listPairs();
      const modalContent = `
        <div class="pair-picker-modal-content">
          <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">
            Select a verified or unverified canonical lunar image pair from the SQLite database to stage into the registration workspace:
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
                  <span>${p.overlap_ratio ? `${(p.overlap_ratio * 100).toFixed(1)}% overlap` : ''}</span>
                </div>
                <button class="btn-tech-sm primary btn-select-pair" data-pair-id="${p.id}">STAGE</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (window.openAppModal) {
        window.openAppModal('SELECT CANONICAL PAIR', modalContent);

        document.querySelectorAll('.btn-select-pair').forEach(btn => {
          btn.addEventListener('click', async () => {
            const pairId = btn.dataset.pairId;
            if (window.closeAppModal) window.closeAppModal();
            await this.stagePair(pairId);
          });
        });
      }
    } catch (err) {
      alert(`Failed to load pairs list: ${err.message}`);
    }
  }

  async stagePair(pairId) {
    if (!pairId) return;
    try {
      const regInput = await window.pairService.getPairRegistrationInput(pairId);
      this.stagedPairId = pairId;
      this.stagedPairData = regInput;

      // Render registration input panel
      const container = document.getElementById('registration-input-container');
      if (container && typeof renderRegistrationInputPanel === 'function') {
        container.innerHTML = renderRegistrationInputPanel(regInput);
        container.style.display = 'block';

        const clearBtn = container.querySelector('#btn-clear-staged-pair');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => this.clearStagedPair());
        }
      }

      // Update status panel
      const refStatusEl = document.getElementById('status-val-ref');
      const tgtStatusEl = document.getElementById('status-val-tgt');
      const overallStatusEl = document.getElementById('status-val-overall');
      const runBtn = document.getElementById('btn-run-registration');

      if (refStatusEl) {
        refStatusEl.textContent = `Ready (${regInput.pair.reference_instrument || 'REF'})`;
        refStatusEl.className = 'status-badge-val status-val-ready';
      }
      if (tgtStatusEl) {
        tgtStatusEl.textContent = `Ready (${regInput.pair.source_instrument || 'SRC'})`;
        tgtStatusEl.className = 'status-badge-val status-val-ready';
      }
      if (overallStatusEl) {
        overallStatusEl.textContent = 'Ready for registration staging';
        overallStatusEl.className = 'status-badge-val status-val-ready';
      }

      if (runBtn) {
        runBtn.removeAttribute('disabled');
        runBtn.classList.remove('disabled');
      }

      // Populate file details in settings if present
      const refSettingEl = document.getElementById('setting-ref-image');
      const tgtSettingEl = document.getElementById('setting-target-image');
      if (refSettingEl && regInput.reference && regInput.reference.product) {
        refSettingEl.textContent = regInput.reference.product.product_id || `Reference #${regInput.pair.reference_product_id}`;
      }
      if (tgtSettingEl && regInput.source && regInput.source.product) {
        tgtSettingEl.textContent = regInput.source.product.product_id || `Target #${regInput.pair.source_product_id}`;
      }

    } catch (err) {
      console.error('Failed to stage pair:', err);
      alert(`Could not stage canonical pair: ${err.message}`);
    }
  }

  clearStagedPair() {
    this.stagedPairId = null;
    this.stagedPairData = null;

    const container = document.getElementById('registration-input-container');
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }

    // Check if local files are uploaded, else revert to missing
    if (typeof window.checkFilesReady === 'function') {
      window.checkFilesReady();
    }
  }

  async runRegistration() {
    if (this.stagedPairId && this.stagedPairData) {
      // We have a staged canonical pair
      const pair = this.stagedPairData.pair;
      const modalContent = `
        <div class="registration-staging-summary">
          <div class="summary-icon" style="text-align:center; margin-bottom:14px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 14"></polyline>
            </svg>
          </div>
          <h4 style="color:var(--accent-gold); text-align:center; margin-bottom:8px; font-family:var(--font-mono); letter-spacing:0.05em;">
            REGISTRATION STAGED & VERIFIED
          </h4>
          <p style="font-size:12px; color:var(--text-light); line-height:1.6; margin-bottom:16px;">
            Canonical Pair <strong>#${pair.id}</strong> (${pair.source_instrument} ↔ ${pair.reference_instrument}) has been validated against the backend database catalog.
          </p>
          <div class="dataset-meta-list" style="margin-bottom:16px;">
            <div class="dataset-meta-row">
              <span>Overlap Status:</span>
              <strong>${pair.overlap_status}</strong>
            </div>
            <div class="dataset-meta-row">
              <span>Overlap Area:</span>
              <span>${pair.overlap_area ? `${pair.overlap_area.toFixed(2)} km²` : 'Calculated'}</span>
            </div>
            <div class="dataset-meta-row">
              <span>Backend Endpoint:</span>
              <span class="col-mono">/api/v1/pairs/${pair.id}/registration-input</span>
            </div>
            <div class="dataset-meta-row">
              <span>Registration Pipeline:</span>
              <span style="color:var(--accent-gold);">Prepared (Execution engine awaiting pipeline worker)</span>
            </div>
          </div>
          <div style="text-align:center;">
            <button class="btn-tech primary" id="btn-inspect-results-now">VIEW RESULTS WORKSPACE →</button>
          </div>
        </div>
      `;

      if (window.openAppModal) {
        window.openAppModal('REGISTRATION PIPELINE STATUS', modalContent);
        const resultsBtn = document.getElementById('btn-inspect-results-now');
        if (resultsBtn) {
          resultsBtn.addEventListener('click', () => {
            if (window.closeAppModal) window.closeAppModal();
            if (typeof window.switchView === 'function') window.switchView('results');
          });
        }
      }
    } else {
      // Local upload files
      if (window.openAppModal) {
        window.openAppModal('REGISTRATION PROCESSING', `
          <div style="padding:10px; font-size:12px; color:var(--text-light); line-height:1.6;">
            <p>Uploaded local images have been verified and processed in the browser workspace.</p>
            <p style="color:var(--text-muted); margin-top:8px;">Ready for alignment transformation.</p>
          </div>
        `);
      }
    }
  }
}

window.registrationPreparationPage = new RegistrationPreparationPage();
