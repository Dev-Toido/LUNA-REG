/**
 * LUNA-REG: RegistrationInputPanel Component
 * Renders complete registration input metadata from GET /api/v1/pairs/{pair_id}/registration-input
 * 
 * Features:
 * - Two main scientific panels: LEFT (SOURCE) vs RIGHT (REFERENCE)
 * - Instrument, Mission, Product ID, Resolution, Acquisition Time, Product Type, Calibration Status, Filename, Size, Provider
 * - Compact Resolution Comparison component (e.g. SOURCE OHRC 0.25 m/px vs REF TMC-2 5.0 m/px)
 * - Registration Readiness Panel (Overlap Status, Overlap Ratio, Verification Method, Evidence Source, Region)
 * - File Availability Section (Source Files & Reference Files with Drive IDs as metadata only)
 */

function formatBytesCompact(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return 'Not available';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUtcCompact(dateStr) {
  if (!dateStr) return 'Not available';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  } catch (_) {
    return 'Not available';
  }
}

function renderRegistrationInputPanel(regInput) {
  if (!regInput) return '';

  const pair = regInput.pair || {};
  const source = regInput.source || {};
  const reference = regInput.reference || {};
  const srcProd = source.product || {};
  const refProd = reference.product || {};
  const srcFiles = source.files || [];
  const refFiles = reference.files || [];

  // Primary file for source and reference
  const primarySrcFile = srcFiles[0] || {};
  const primaryRefFile = refFiles[0] || {};

  // Resolutions
  const srcRes = srcProd.resolution !== undefined && srcProd.resolution !== null 
    ? srcProd.resolution 
    : (srcProd.resolution_m_per_px !== undefined ? srcProd.resolution_m_per_px : null);
  const srcResStr = srcRes !== null ? `${srcRes} m/pixel` : 'Not available';

  const refRes = refProd.resolution !== undefined && refProd.resolution !== null 
    ? refProd.resolution 
    : (refProd.resolution_m_per_px !== undefined ? refProd.resolution_m_per_px : null);
  const refResStr = refRes !== null ? `${refRes} m/pixel` : 'Not available';

  // Overlap & Readiness
  const overlapStatus = pair.overlap_status || 'UNVERIFIED';
  const isVerified = overlapStatus.toUpperCase() === 'VERIFIED';
  const overlapRatioStr = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined)
    ? `${(pair.overlap_ratio * 100).toFixed(2)}%`
    : 'Not calculated';
  const overlapAreaStr = (pair.overlap_area !== null && pair.overlap_area !== undefined)
    ? `${pair.overlap_area.toFixed(4)} km²`
    : 'Not calculated';

  let regionLabel = 'Not assigned';
  if (pair.region_id !== null && pair.region_id !== undefined && pair.region_id !== '') {
    if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
      regionLabel = window.regionService.formatRegionName(pair.region_id);
    } else {
      regionLabel = `Region #${pair.region_id}`;
    }
  }

  // Footprints
  const hasSrcFootprint = srcProd.footprint_lat_min !== null && srcProd.footprint_lat_min !== undefined;
  const hasRefFootprint = refProd.footprint_lat_min !== null && refProd.footprint_lat_min !== undefined;

  return `
    <div class="registration-input-workspace" id="reg-input-panel">
      
      <!-- Staged Pair Header Banner -->
      <div class="reg-input-panel-header">
        <div class="reg-input-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          <span>CANONICAL PAIR STAGED: PAIR #${pair.id || '—'} &bull; ${pair.source_instrument || 'SRC'} ↔ ${pair.reference_instrument || 'REF'}</span>
        </div>
        <div class="reg-input-panel-status">
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : `<span class="canonical-badge">${overlapStatus}</span>`}
          <button type="button" class="btn-tech-sm" id="btn-clear-staged-pair" title="Unlink staged pair">
            DISMISS PAIR
          </button>
        </div>
      </div>

      <!-- Compact Resolution Comparison Bar -->
      <div class="resolution-comparison-bar">
        <div class="res-comp-side source">
          <span class="res-comp-tag">SOURCE</span>
          <span class="res-comp-inst">${pair.source_instrument || srcProd.instrument || 'SRC'}</span>
          <span class="res-comp-val">${srcResStr}</span>
        </div>
        <div class="res-comp-vs">
          <span class="res-vs-badge">VS</span>
          <span class="res-ratio-hint">Cross-Resolution Align</span>
        </div>
        <div class="res-comp-side ref">
          <span class="res-comp-tag">REFERENCE</span>
          <span class="res-comp-inst">${pair.reference_instrument || refProd.instrument || 'REF'}</span>
          <span class="res-comp-val">${refResStr}</span>
        </div>
      </div>

      <!-- Dual Main Scientific Panels: LEFT (SOURCE) & RIGHT (REFERENCE) -->
      <div class="reg-scientific-dual-grid">
        
        <!-- LEFT: SOURCE IMAGE / SOURCE PRODUCT -->
        <div class="reg-scientific-panel source-panel">
          <div class="sci-panel-header">
            <div class="sci-header-left">
              <span class="sci-badge source">SOURCE IMAGE / TARGET</span>
              <h4 class="sci-title">${pair.source_instrument || srcProd.instrument || 'SOURCE'}</h4>
            </div>
            <span class="sci-type-pill">${srcProd.product_type || 'IMG'}</span>
          </div>

          <div class="sci-meta-table">
            <div class="sci-meta-row">
              <span class="sci-lbl">Instrument:</span>
              <span class="sci-val highlight">${srcProd.instrument || pair.source_instrument || 'Not available'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Mission:</span>
              <span class="sci-val">${srcProd.mission || 'Chandrayaan-2'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Product ID:</span>
              <span class="sci-val highlight col-mono" title="${srcProd.product_id || ''}">${srcProd.product_id || `#${pair.source_product_id}`}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Resolution:</span>
              <span class="sci-val col-mono">${srcResStr}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Acquisition Time:</span>
              <span class="sci-val col-mono">${formatUtcCompact(srcProd.acquisition_time || srcProd.start_time)}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Product Type:</span>
              <span class="sci-val">${srcProd.product_type || 'IMG'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Calibration Status:</span>
              <span class="sci-val">${srcProd.calibration_status || srcProd.processing_level || 'Calibrated'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Primary Filename:</span>
              <span class="sci-val col-mono" title="${primarySrcFile.file_name || ''}">${primarySrcFile.file_name || 'Not registered'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">File Type &amp; Size:</span>
              <span class="sci-val">${primarySrcFile.file_type || 'IMG'} (${formatBytesCompact(primarySrcFile.file_size_bytes)})</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Storage Provider:</span>
              <span class="sci-val col-mono">${primarySrcFile.storage_provider || 'local'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Footprint:</span>
              <span class="sci-val col-mono" style="font-size:10px;">
                ${hasSrcFootprint ? `[${srcProd.footprint_lat_min.toFixed(2)}°, ${srcProd.footprint_lon_min.toFixed(2)}°] to [${srcProd.footprint_lat_max.toFixed(2)}°, ${srcProd.footprint_lon_max.toFixed(2)}°]` : 'Footprint geometry not available.'}
              </span>
            </div>
          </div>
        </div>

        <!-- RIGHT: REFERENCE IMAGE / REFERENCE PRODUCT -->
        <div class="reg-scientific-panel reference-panel">
          <div class="sci-panel-header">
            <div class="sci-header-left">
              <span class="sci-badge ref">REFERENCE IMAGE / BASE</span>
              <h4 class="sci-title">${pair.reference_instrument || refProd.instrument || 'REFERENCE'}</h4>
            </div>
            <span class="sci-type-pill">${refProd.product_type || 'IMG'}</span>
          </div>

          <div class="sci-meta-table">
            <div class="sci-meta-row">
              <span class="sci-lbl">Instrument:</span>
              <span class="sci-val highlight">${refProd.instrument || pair.reference_instrument || 'Not available'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Mission:</span>
              <span class="sci-val">${refProd.mission || 'Chandrayaan-2'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Product ID:</span>
              <span class="sci-val highlight col-mono" title="${refProd.product_id || ''}">${refProd.product_id || `#${pair.reference_product_id}`}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Resolution:</span>
              <span class="sci-val col-mono">${refResStr}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Acquisition Time:</span>
              <span class="sci-val col-mono">${formatUtcCompact(refProd.acquisition_time || refProd.start_time)}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Product Type:</span>
              <span class="sci-val">${refProd.product_type || 'IMG'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Calibration Status:</span>
              <span class="sci-val">${refProd.calibration_status || refProd.processing_level || 'Calibrated'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Primary Filename:</span>
              <span class="sci-val col-mono" title="${primaryRefFile.file_name || ''}">${primaryRefFile.file_name || 'Not registered'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">File Type &amp; Size:</span>
              <span class="sci-val">${primaryRefFile.file_type || 'IMG'} (${formatBytesCompact(primaryRefFile.file_size_bytes)})</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Storage Provider:</span>
              <span class="sci-val col-mono">${primaryRefFile.storage_provider || 'local'}</span>
            </div>
            <div class="sci-meta-row">
              <span class="sci-lbl">Footprint:</span>
              <span class="sci-val col-mono" style="font-size:10px;">
                ${hasRefFootprint ? `[${refProd.footprint_lat_min.toFixed(2)}°, ${refProd.footprint_lon_min.toFixed(2)}°] to [${refProd.footprint_lat_max.toFixed(2)}°, ${refProd.footprint_lon_max.toFixed(2)}°]` : 'Footprint geometry not available.'}
              </span>
            </div>
          </div>
        </div>

      </div>

      <!-- Dedicated Registration Readiness Panel -->
      <div class="reg-readiness-panel ${isVerified ? 'verified' : 'unverified'}">
        <div class="readiness-header">
          <div class="readiness-title-group">
            <span class="readiness-pill">${isVerified ? 'OVERLAP VERIFIED' : 'OVERLAP UNVERIFIED'}</span>
            <span class="readiness-title">REGISTRATION READINESS TELEMETRY</span>
          </div>
          <span class="readiness-ratio">Overlap Ratio: <strong>${overlapRatioStr}</strong> (${overlapAreaStr})</span>
        </div>

        <div class="readiness-grid">
          <div class="readiness-item">
            <span class="readiness-label">Overlap Status:</span>
            <span class="readiness-val ${isVerified ? 'success' : 'warn'}">${overlapStatus}</span>
          </div>
          <div class="readiness-item">
            <span class="readiness-label">Verification Method:</span>
            <span class="readiness-val">${pair.verification_method || 'Not verified'}</span>
          </div>
          <div class="readiness-item">
            <span class="readiness-label">Evidence Source:</span>
            <span class="readiness-val">${pair.evidence_source || 'Not available'}</span>
          </div>
          <div class="readiness-item">
            <span class="readiness-label">Region:</span>
            <span class="readiness-val ${pair.region_id ? '' : 'col-muted'}">${regionLabel}</span>
          </div>
        </div>

        ${!isVerified ? `
          <div class="readiness-warning-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Overlap has not yet been verified. Registration execution requires careful inspection of ground bounds.</span>
          </div>
        ` : ''}
      </div>

      <!-- File Availability Section (Source & Reference Product Files) -->
      <div class="reg-files-availability-section">
        <div class="files-avail-header">
          <h5 class="files-avail-title">PRODUCT FILES AVAILABILITY (Source: ${srcFiles.length} &bull; Reference: ${refFiles.length})</h5>
          <span class="files-avail-hint">Drive IDs displayed for reference only &bull; Direct access disabled</span>
        </div>

        <div class="files-avail-tables-grid">
          
          <!-- Source Files Table -->
          <div class="avail-table-card">
            <div class="avail-table-header source">
              <span>SOURCE FILES (${pair.source_instrument})</span>
            </div>
            ${srcFiles.length === 0 ? '<div class="empty-files-sub">No files associated with source product.</div>' : `
              <table class="avail-table">
                <thead>
                  <tr>
                    <th>FILE NAME</th>
                    <th>ROLE</th>
                    <th>TYPE</th>
                    <th>SIZE</th>
                    <th>PROVIDER</th>
                  </tr>
                </thead>
                <tbody>
                  ${srcFiles.map(f => `
                    <tr>
                      <td class="col-highlight" title="${f.file_name}">${f.file_name || 'Unnamed'}</td>
                      <td><span class="product-type-pill">${f.file_role || f.role || 'PRIMARY'}</span></td>
                      <td><span class="format-badge">${f.file_type || 'IMG'}</span></td>
                      <td class="col-mono">${formatBytesCompact(f.file_size_bytes)}</td>
                      <td class="col-mono" style="font-size:10px;">${f.storage_provider || 'local'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>

          <!-- Reference Files Table -->
          <div class="avail-table-card">
            <div class="avail-table-header ref">
              <span>REFERENCE FILES (${pair.reference_instrument})</span>
            </div>
            ${refFiles.length === 0 ? '<div class="empty-files-sub">No files associated with reference product.</div>' : `
              <table class="avail-table">
                <thead>
                  <tr>
                    <th>FILE NAME</th>
                    <th>ROLE</th>
                    <th>TYPE</th>
                    <th>SIZE</th>
                    <th>PROVIDER</th>
                  </tr>
                </thead>
                <tbody>
                  ${refFiles.map(f => `
                    <tr>
                      <td class="col-highlight" title="${f.file_name}">${f.file_name || 'Unnamed'}</td>
                      <td><span class="product-type-pill">${f.file_role || f.role || 'PRIMARY'}</span></td>
                      <td><span class="format-badge">${f.file_type || 'IMG'}</span></td>
                      <td class="col-mono">${formatBytesCompact(f.file_size_bytes)}</td>
                      <td class="col-mono" style="font-size:10px;">${f.storage_provider || 'local'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>

        </div>
      </div>

    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderRegistrationInputPanel = renderRegistrationInputPanel;
}
if (typeof window !== 'undefined') {
  window.renderRegistrationInputPanel = renderRegistrationInputPanel;
}

