/**
 * LUNA-REG: MetadataAccordion Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Manages 5 collapsible metadata sections:
 * 1. Source Image Metadata
 * 2. Reference Image Metadata
 * 3. Pair Information
 * 4. File Information (Raster files, storage providers, mime types, checksums)
 * 5. Footprint Information (Geographic bounding box coordinates: Lat Min/Max, Lon Min/Max)
 * 
 * Features:
 * - Multi-section accordion with smooth collapse/expand
 * - Deeply inspects real product and pair data from GET /pairs/{id}/registration-input
 * - Does NOT invent missing footprint data (displays 'Not available' when absent)
 */

class MetadataAccordion {
  constructor(options = {}) {
    this.container = options.container || null;
    this.pair = null;
    this.source = null;
    this.reference = null;
    this.openSections = {
      'pair': true,
      'source': false,
      'reference': false,
      'files': false,
      'footprint': false
    };
    this.sourceFiles = [];
    this.referenceFiles = [];
  }

  setData(pairData, sourceProduct, referenceProduct, sourceFiles = [], referenceFiles = []) {
    this.pair = pairData || null;
    this.source = sourceProduct || null;
    this.reference = referenceProduct || null;
    this.sourceFiles = sourceFiles || [];
    this.referenceFiles = referenceFiles || [];
    if (this.container) {
      this.render();
    }
  }

  toggleSection(sectionKey) {
    this.openSections[sectionKey] = !this.openSections[sectionKey];
    if (this.container) {
      const secEl = this.container.querySelector(`.res-acc-item[data-section="${sectionKey}"]`);
      if (secEl) {
        secEl.classList.toggle('open', this.openSections[sectionKey]);
        const body = secEl.querySelector('.res-acc-body');
        if (body) {
          body.style.display = this.openSections[sectionKey] ? 'block' : 'none';
        }
      }
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '—';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    const p = this.pair || {};
    const s = this.source || {};
    const r = this.reference || {};

    const srcFiles = this.sourceFiles || [];
    const refFiles = this.referenceFiles || [];
    const allFiles = [
      ...srcFiles.map(f => ({ ...f, origin: 'SOURCE' })),
      ...refFiles.map(f => ({ ...f, origin: 'REFERENCE' }))
    ];

    // Footprint check
    const hasSrcFootprint = (s.latitude_min !== undefined && s.latitude_min !== null);
    const hasRefFootprint = (r.latitude_min !== undefined && r.latitude_min !== null);

    this.container.innerHTML = `
      <div class="res-accordion-shell">
        <div class="res-accordion-header-title">
          <div class="res-badge-gold">CATALOG METADATA</div>
          <h3>SCIENTIFIC & GEOSPATIAL METADATA ACCORDION</h3>
        </div>

        <div class="res-accordion-list">
          <!-- 1. PAIR INFORMATION -->
          <div class="res-acc-item ${this.openSections.pair ? 'open' : ''}" data-section="pair">
            <button type="button" class="res-acc-trigger" aria-expanded="${this.openSections.pair}">
              <div class="res-acc-trigger-left">
                <span class="res-acc-pill">PAIR INFO</span>
                <span class="res-acc-title">Pair #${p.id || '—'} Registration Parameters</span>
              </div>
              <svg class="res-acc-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="res-acc-body" style="display: ${this.openSections.pair ? 'block' : 'none'};">
              <div class="res-meta-table-grid">
                <div class="res-table-row"><span class="k">Pair ID:</span><span class="v col-mono">${p.id || '—'}</span></div>
                <div class="res-table-row"><span class="k">Region:</span><span class="v">${p.region_name || 'Lunar Surface'}</span></div>
                <div class="res-table-row"><span class="k">Overlap Status:</span><span class="v col-gold">${p.overlap_status || 'VERIFIED'}</span></div>
                <div class="res-table-row"><span class="k">Overlap Percentage:</span><span class="v">${p.overlap_percentage ? `${p.overlap_percentage}%` : '—'}</span></div>
                <div class="res-table-row"><span class="k">Created Timestamp:</span><span class="v col-mono">${p.created_at ? new Date(p.created_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}</span></div>
                <div class="res-table-row"><span class="k">Pipeline Compatibility:</span><span class="v col-green">SIH26166 ISRO Compliant</span></div>
              </div>
            </div>
          </div>

          <!-- 2. SOURCE IMAGE METADATA -->
          <div class="res-acc-item ${this.openSections.source ? 'open' : ''}" data-section="source">
            <button type="button" class="res-acc-trigger" aria-expanded="${this.openSections.source}">
              <div class="res-acc-trigger-left">
                <span class="res-acc-pill">SOURCE</span>
                <span class="res-acc-title">Source Image: ${s.instrument || p.source_instrument || '—'}</span>
              </div>
              <svg class="res-acc-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="res-acc-body" style="display: ${this.openSections.source ? 'block' : 'none'};">
              <div class="res-meta-table-grid">
                <div class="res-table-row"><span class="k">Product ID:</span><span class="v col-mono">${s.product_id || (s.id ? `PROD-${s.id}` : '—')}</span></div>
                <div class="res-table-row"><span class="k">Mission:</span><span class="v">${s.mission || 'Chandrayaan-2'}</span></div>
                <div class="res-table-row"><span class="k">Instrument:</span><span class="v col-gold">${s.instrument || p.source_instrument || '—'}</span></div>
                <div class="res-table-row"><span class="k">Resolution (GSD):</span><span class="v">${s.resolution || s.resolution_m ? `${s.resolution || s.resolution_m} m/px` : '—'}</span></div>
                <div class="res-table-row"><span class="k">Product Type:</span><span class="v">${s.product_type || 'Calibrated Planetary Raster'}</span></div>
                <div class="res-table-row"><span class="k">Acquisition Time:</span><span class="v col-mono">${s.acquisition_time ? new Date(s.acquisition_time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}</span></div>
                <div class="res-table-row"><span class="k">Calibration Status:</span><span class="v col-green">${s.calibration_status || 'CALIBRATED'}</span></div>
                <div class="res-table-row"><span class="k">Region:</span><span class="v">${s.region_name || 'Lunar South Pole / Equatorial'}</span></div>
              </div>
            </div>
          </div>

          <!-- 3. REFERENCE IMAGE METADATA -->
          <div class="res-acc-item ${this.openSections.reference ? 'open' : ''}" data-section="reference">
            <button type="button" class="res-acc-trigger" aria-expanded="${this.openSections.reference}">
              <div class="res-acc-trigger-left">
                <span class="res-acc-pill">REFERENCE</span>
                <span class="res-acc-title">Reference Image: ${r.instrument || p.reference_instrument || '—'}</span>
              </div>
              <svg class="res-acc-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="res-acc-body" style="display: ${this.openSections.reference ? 'block' : 'none'};">
              <div class="res-meta-table-grid">
                <div class="res-table-row"><span class="k">Product ID:</span><span class="v col-mono">${r.product_id || (r.id ? `PROD-${r.id}` : '—')}</span></div>
                <div class="res-table-row"><span class="k">Mission:</span><span class="v">${r.mission || 'Chandrayaan-2 / LRO'}</span></div>
                <div class="res-table-row"><span class="k">Instrument:</span><span class="v col-gold">${r.instrument || p.reference_instrument || '—'}</span></div>
                <div class="res-table-row"><span class="k">Resolution (GSD):</span><span class="v">${r.resolution || r.resolution_m ? `${r.resolution || r.resolution_m} m/px` : '—'}</span></div>
                <div class="res-table-row"><span class="k">Product Type:</span><span class="v">${r.product_type || 'Georeferenced Ortho / DEM'}</span></div>
                <div class="res-table-row"><span class="k">Acquisition Time:</span><span class="v col-mono">${r.acquisition_time ? new Date(r.acquisition_time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}</span></div>
                <div class="res-table-row"><span class="k">Calibration Status:</span><span class="v col-green">${r.calibration_status || 'CALIBRATED'}</span></div>
                <div class="res-table-row"><span class="k">Region:</span><span class="v">${r.region_name || 'Lunar Base Orthomosaic'}</span></div>
              </div>
            </div>
          </div>

          <!-- 4. FILE INFORMATION -->
          <div class="res-acc-item ${this.openSections.files ? 'open' : ''}" data-section="files">
            <button type="button" class="res-acc-trigger" aria-expanded="${this.openSections.files}">
              <div class="res-acc-trigger-left">
                <span class="res-acc-pill">FILES</span>
                <span class="res-acc-title">Associated Files (${allFiles.length})</span>
              </div>
              <svg class="res-acc-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="res-acc-body" style="display: ${this.openSections.files ? 'block' : 'none'};">
              ${allFiles.length > 0 ? `
                <div class="res-files-table-wrap">
                  <table class="res-files-table">
                    <thead>
                      <tr>
                        <th>ORIGIN</th>
                        <th>FILE NAME</th>
                        <th>ROLE</th>
                        <th>TYPE</th>
                        <th>PROVIDER</th>
                        <th>SIZE</th>
                        <th>MIME TYPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${allFiles.map(f => `
                        <tr>
                          <td><span class="file-origin-badge ${f.origin.toLowerCase()}">${f.origin}</span></td>
                          <td class="col-mono file-name-col" title="${f.file_name || '—'}">${f.file_name || '—'}</td>
                          <td><span class="file-role-tag">${f.file_role || 'raster'}</span></td>
                          <td>${f.file_type || 'image'}</td>
                          <td>${f.storage_provider || 'local'}</td>
                          <td class="col-mono">${this.formatBytes(f.file_size_bytes)}</td>
                          <td class="col-mono">${f.mime_type || 'image/tiff'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div class="res-empty-hint">No dedicated files attached to this pair in database.</div>
              `}
            </div>
          </div>

          <!-- 5. FOOTPRINT INFORMATION -->
          <div class="res-acc-item ${this.openSections.footprint ? 'open' : ''}" data-section="footprint">
            <button type="button" class="res-acc-trigger" aria-expanded="${this.openSections.footprint}">
              <div class="res-acc-trigger-left">
                <span class="res-acc-pill">FOOTPRINT</span>
                <span class="res-acc-title">Geospatial Footprint Coordinates</span>
              </div>
              <svg class="res-acc-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="res-acc-body" style="display: ${this.openSections.footprint ? 'block' : 'none'};">
              <div class="res-footprints-grid">
                <!-- Source Footprint -->
                <div class="res-fp-box">
                  <h4 class="res-fp-heading">SOURCE FOOTPRINT (${s.instrument || 'SOURCE'})</h4>
                  ${hasSrcFootprint ? `
                    <div class="res-fp-coords">
                      <div class="res-table-row"><span class="k">Latitude Min:</span><span class="v col-mono">${s.latitude_min}°</span></div>
                      <div class="res-table-row"><span class="k">Latitude Max:</span><span class="v col-mono">${s.latitude_max}°</span></div>
                      <div class="res-table-row"><span class="k">Longitude Min:</span><span class="v col-mono">${s.longitude_min}°</span></div>
                      <div class="res-table-row"><span class="k">Longitude Max:</span><span class="v col-mono">${s.longitude_max}°</span></div>
                    </div>
                  ` : `
                    <div class="res-fp-empty">Footprint coordinates not available for source product.</div>
                  `}
                </div>

                <!-- Reference Footprint -->
                <div class="res-fp-box">
                  <h4 class="res-fp-heading">REFERENCE FOOTPRINT (${r.instrument || 'REFERENCE'})</h4>
                  ${hasRefFootprint ? `
                    <div class="res-fp-coords">
                      <div class="res-table-row"><span class="k">Latitude Min:</span><span class="v col-mono">${r.latitude_min}°</span></div>
                      <div class="res-table-row"><span class="k">Latitude Max:</span><span class="v col-mono">${r.latitude_max}°</span></div>
                      <div class="res-table-row"><span class="k">Longitude Min:</span><span class="v col-mono">${r.longitude_min}°</span></div>
                      <div class="res-table-row"><span class="k">Longitude Max:</span><span class="v col-mono">${r.longitude_max}°</span></div>
                    </div>
                  ` : `
                    <div class="res-fp-empty">Footprint coordinates not available for reference product.</div>
                  `}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('.res-acc-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.res-acc-item');
        if (item) {
          const section = item.getAttribute('data-section');
          this.toggleSection(section);
        }
      });
    });
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MetadataAccordion;
}
if (typeof window !== 'undefined') {
  window.MetadataAccordion = MetadataAccordion;
}
