/**
 * LUNA-REG: RegistrationSummary Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Features:
 * - Source vs. Reference sensor side-by-side technical metadata
 * - Analytical Resolution Comparison Widget (Ground Sampling Distance ratio, spatial scale factor)
 * - Acquisition timestamps, mission affiliations, orbit IDs, and calibration telemetry
 * - Fully reactive to pair and registration-input metadata
 */

class RegistrationSummary {
  constructor(options = {}) {
    this.container = options.container || null;
    this.pairData = null;
    this.sourceData = null;
    this.referenceData = null;
  }

  setData(pair, sourceProduct, referenceProduct) {
    this.pairData = pair || null;
    this.sourceData = sourceProduct || null;
    this.referenceData = referenceProduct || null;
    if (this.container) {
      this.render();
    }
  }

  parseResolution(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const match = String(val).match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  }

  formatResolution(val) {
    if (val === null || val === undefined || val === '') return '—';
    const num = this.parseResolution(val);
    return num !== null ? `${num.toFixed(1)} m/px` : String(val);
  }

  calculateResolutionRatio() {
    const srcRes = this.sourceData ? this.parseResolution(this.sourceData.resolution || this.sourceData.resolution_m) : null;
    const refRes = this.referenceData ? this.parseResolution(this.referenceData.resolution || this.referenceData.resolution_m) : null;

    if (srcRes && refRes) {
      const ratio = refRes / srcRes;
      const formattedRatio = ratio >= 1 ? `${ratio.toFixed(1)}x` : `1:${(1 / ratio).toFixed(1)}`;
      const dominant = ratio > 1 ? 'Source has higher spatial fidelity' : (ratio < 1 ? 'Reference has higher spatial fidelity' : 'Identical GSD resolution');
      return {
        ratio: formattedRatio,
        srcRes,
        refRes,
        description: dominant
      };
    }
    return null;
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    if (!this.pairData && !this.sourceData && !this.referenceData) {
      this.container.innerHTML = `
        <div class="res-summary-empty">
          <div class="res-summary-empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <p class="res-empty-txt">Select a Lunar Image Pair to inspect multi-modal registration metadata.</p>
        </div>
      `;
      return;
    }

    const resCalc = this.calculateResolutionRatio();
    const pair = this.pairData || {};
    const src = this.sourceData || {};
    const ref = this.referenceData || {};

    this.container.innerHTML = `
      <div class="res-summary-card">
        <!-- Card Header -->
        <div class="res-summary-top">
          <div class="res-summary-title-wrap">
            <div class="res-badge-gold">MULTI-MODAL PAIR TELEMETRY</div>
            <h2 class="res-summary-heading">
              ${pair.source_instrument || src.instrument || 'SOURCE'} 
              <span class="res-cross">&times;</span> 
              ${pair.reference_instrument || ref.instrument || 'REFERENCE'}
            </h2>
          </div>
          <div class="res-summary-badges">
            <span class="res-tag overlap-${(pair.overlap_status || 'verified').toLowerCase()}">
              ${(pair.overlap_status || 'VERIFIED').toUpperCase()}
            </span>
            <span class="res-tag region">${pair.region_name || src.region_name || 'LUNAR SURFACE'}</span>
          </div>
        </div>

        <!-- Sensor Comparison Grid -->
        <div class="res-sensors-grid">
          <!-- SOURCE SENSOR PANEL -->
          <div class="res-sensor-box source">
            <div class="res-sensor-header">
              <span class="res-sensor-role">SOURCE (TARGET INPUT)</span>
              <span class="res-sensor-inst">${src.instrument || pair.source_instrument || '—'}</span>
            </div>
            <div class="res-meta-rows">
              <div class="res-meta-row">
                <span class="lbl">Mission:</span>
                <span class="val">${src.mission || 'Chandrayaan-2'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Product ID:</span>
                <span class="val col-mono" title="${src.product_id || src.id || '—'}">${src.product_id || (src.id ? `PROD-${src.id}` : '—')}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Ground Resolution:</span>
                <span class="val col-gold">${this.formatResolution(src.resolution || src.resolution_m)}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Acquisition Time:</span>
                <span class="val col-mono">${src.acquisition_time ? new Date(src.acquisition_time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Product Type:</span>
                <span class="val">${src.product_type || 'Calibrated Planetary Raster'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Calibration Status:</span>
                <span class="val col-green">${src.calibration_status || 'CALIBRATED'}</span>
              </div>
            </div>
          </div>

          <!-- RESOLUTION DELTA WIDGET (CENTER) -->
          <div class="res-ratio-widget">
            <div class="res-ratio-badge">RESOLUTION RATIO</div>
            <div class="res-ratio-num">${resCalc ? resCalc.ratio : '—'}</div>
            <div class="res-ratio-desc">${resCalc ? resCalc.description : 'Resolution comparison pending'}</div>
            
            <div class="res-ratio-bars">
              <div class="res-ratio-bar-col">
                <span class="res-bar-label">SRC</span>
                <div class="res-bar-track">
                  <div class="res-bar-fill src" style="height: ${resCalc ? Math.min(100, Math.max(20, (resCalc.refRes / (resCalc.srcRes + resCalc.refRes)) * 100)) : 50}%"></div>
                </div>
                <span class="res-bar-val">${this.formatResolution(src.resolution || src.resolution_m)}</span>
              </div>
              <div class="res-ratio-bar-col">
                <span class="res-bar-label">REF</span>
                <div class="res-bar-track">
                  <div class="res-bar-fill ref" style="height: ${resCalc ? Math.min(100, Math.max(20, (resCalc.srcRes / (resCalc.srcRes + resCalc.refRes)) * 100)) : 50}%"></div>
                </div>
                <span class="res-bar-val">${this.formatResolution(ref.resolution || ref.resolution_m)}</span>
              </div>
            </div>
          </div>

          <!-- REFERENCE SENSOR PANEL -->
          <div class="res-sensor-box reference">
            <div class="res-sensor-header">
              <span class="res-sensor-role">REFERENCE (BASE MAP)</span>
              <span class="res-sensor-inst">${ref.instrument || pair.reference_instrument || '—'}</span>
            </div>
            <div class="res-meta-rows">
              <div class="res-meta-row">
                <span class="lbl">Mission:</span>
                <span class="val">${ref.mission || 'Chandrayaan-2 / LRO'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Product ID:</span>
                <span class="val col-mono" title="${ref.product_id || ref.id || '—'}">${ref.product_id || (ref.id ? `PROD-${ref.id}` : '—')}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Ground Resolution:</span>
                <span class="val col-gold">${this.formatResolution(ref.resolution || ref.resolution_m)}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Acquisition Time:</span>
                <span class="val col-mono">${ref.acquisition_time ? new Date(ref.acquisition_time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Product Type:</span>
                <span class="val">${ref.product_type || 'Georeferenced Ortho / DEM'}</span>
              </div>
              <div class="res-meta-row">
                <span class="lbl">Calibration Status:</span>
                <span class="val col-green">${ref.calibration_status || 'CALIBRATED'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegistrationSummary;
}
if (typeof window !== 'undefined') {
  window.RegistrationSummary = RegistrationSummary;
}
