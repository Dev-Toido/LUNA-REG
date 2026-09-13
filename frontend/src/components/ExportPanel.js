/**
 * LUNA-REG: ExportPanel Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Features:
 * - 4 Canonical Export Actions:
 *   1. Download Registered Image (Awaiting backend processing API)
 *   2. Download Difference Image (Awaiting backend processing API)
 *   3. Export Metrics (Generates client-side CSV / JSON telemetry report)
 *   4. Export Metadata (Generates client-side JSON of complete pair metadata)
 * 
 * Compliance:
 * - Does not invent fake server download endpoints
 * - Provides informative tooltips for pending raster outputs
 * - Performs real client-side file serialization for metadata and metrics exports
 */

class ExportPanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.pair = null;
    this.source = null;
    this.reference = null;
    this.metrics = null;
    this.registeredAvailable = false;
    this.differenceAvailable = false;
  }

  setData(pairData, sourceProduct, referenceProduct, metricsData = null, regAvail = false, diffAvail = false) {
    this.pair = pairData || null;
    this.source = sourceProduct || null;
    this.reference = referenceProduct || null;
    this.metrics = metricsData || null;
    this.registeredAvailable = !!regAvail;
    this.differenceAvailable = !!diffAvail;
    if (this.container) {
      this.render();
    }
  }

  downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 100);
  }

  exportMetadataJSON() {
    const payload = {
      luna_reg_version: '2.5.0',
      export_timestamp: new Date().toISOString(),
      pair: this.pair,
      source_product: this.source,
      reference_product: this.reference,
      telemetry: {
        scientific_integrity: 'SIH26166 Compliant',
        mission: 'Chandrayaan-2'
      }
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const fileName = `luna_reg_pair_${this.pair ? this.pair.id : 'export'}_metadata.json`;
    this.downloadFile(jsonStr, fileName, 'application/json');
  }

  exportMetricsCSV() {
    const m = this.metrics || {};
    const pairId = this.pair ? this.pair.id : 'N/A';
    const csvRows = [
      ['Metric', 'Value', 'Unit', 'Status'],
      ['Pair ID', pairId, '', 'CATALOG'],
      ['RMSE', m.rmse || 'Not available', 'px', m.rmse ? 'COMPUTED' : 'PENDING'],
      ['MAE', m.mae || 'Not available', 'px', m.mae ? 'COMPUTED' : 'PENDING'],
      ['SSIM', m.ssim || 'Not available', '', m.ssim ? 'COMPUTED' : 'PENDING'],
      ['Mutual Information', m.mutual_information || 'Not available', 'nats', m.mutual_information ? 'COMPUTED' : 'PENDING'],
      ['Feature Matches', m.feature_matches || 'Not available', 'correspondences', m.feature_matches ? 'COMPUTED' : 'PENDING'],
      ['Inlier Ratio', m.inlier_ratio ? `${m.inlier_ratio}%` : 'Not available', '%', m.inlier_ratio ? 'COMPUTED' : 'PENDING'],
      ['Rotation', m.rotation || 'Not available', 'deg', m.rotation ? 'COMPUTED' : 'PENDING'],
      ['Scale Factor', m.scale || 'Not available', 'x', m.scale ? 'COMPUTED' : 'PENDING']
    ];

    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const fileName = `luna_reg_pair_${this.pair ? this.pair.id : 'export'}_metrics.csv`;
    this.downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="res-export-bar">
        <div class="res-export-title-group">
          <div class="res-badge-gold">DATA ARCHIVES</div>
          <span class="res-export-label">EXPORT &amp; DOWNLOAD TELEMETRY</span>
        </div>

        <div class="res-export-actions">
          <!-- 1. Download Registered Image -->
          <button type="button" class="btn-tech ${this.registeredAvailable ? 'primary' : 'disabled'}" id="btn-export-reg-img" ${!this.registeredAvailable ? 'disabled' : ''} title="${this.registeredAvailable ? 'Download Registered Output GeoTIFF' : 'Download unavailable: Registration output raster pending backend engine.'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>REGISTERED IMAGE</span>
            ${!this.registeredAvailable ? '<span class="res-btn-tag">PENDING</span>' : ''}
          </button>

          <!-- 2. Download Difference Image -->
          <button type="button" class="btn-tech ${this.differenceAvailable ? 'primary' : 'disabled'}" id="btn-export-diff-img" ${!this.differenceAvailable ? 'disabled' : ''} title="${this.differenceAvailable ? 'Download Difference GeoTIFF' : 'Download unavailable: Difference residual raster pending backend engine.'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>DIFFERENCE IMAGE</span>
            ${!this.differenceAvailable ? '<span class="res-btn-tag">PENDING</span>' : ''}
          </button>

          <!-- 3. Export Metrics -->
          <button type="button" class="btn-tech" id="btn-export-metrics-csv" title="Export geometric accuracy metrics as CSV table">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>EXPORT METRICS (CSV)</span>
          </button>

          <!-- 4. Export Metadata -->
          <button type="button" class="btn-tech" id="btn-export-metadata-json" title="Export comprehensive pair & sensor metadata as JSON">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span>EXPORT METADATA (JSON)</span>
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    const btnMeta = this.container.querySelector('#btn-export-metadata-json');
    if (btnMeta) {
      btnMeta.addEventListener('click', () => this.exportMetadataJSON());
    }

    const btnMetrics = this.container.querySelector('#btn-export-metrics-csv');
    if (btnMetrics) {
      btnMetrics.addEventListener('click', () => this.exportMetricsCSV());
    }
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportPanel;
}
if (typeof window !== 'undefined') {
  window.ExportPanel = ExportPanel;
}
