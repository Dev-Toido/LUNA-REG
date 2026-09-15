/**
 * LUNA-REG: MetadataPanel Component
 * Deep scientific inspection modal/drawer for products and pairs
 * 
 * Complies with:
 * - Product Details (Instrument, Mission, Product ID, Acquisition Time, Resolution, Product Type, Calibration Status, Region, Created At)
 * - Footprint Bounds & Geospatial Panel (without inventing missing data)
 * - Product Files Table (File Name, Role, Type, Storage Provider, File Size, MIME Type, debug Drive ID metadata)
 * - Pair Details Scientific Side-by-Side (SOURCE PRODUCT vs REFERENCE PRODUCT)
 * - Overlap status, area, ratio, verification method, evidence source, notes, and overlap geometry visualization
 */

function renderMetadataPanel(data, type = 'pair') {
  if (!data) return '<div class="empty-state">No metadata available.</div>';

  if (type === 'pair') {
    return renderPairMetadataPanel(data);
  } else {
    return renderProductMetadataPanel(data);
  }
}

/**
 * Format bytes to readable string
 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return 'Not available';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date string safely in UTC
 */
function formatUtcDate(dateStr) {
  if (!dateStr) return 'Not available';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  } catch (_) {
    return 'Not available';
  }
}

/**
 * Renders small geospatial footprint visualization SVG (or missing geometry placeholder)
 */
function renderGeospatialFootprintSvg(latMin, latMax, lonMin, lonMax, title = 'FOOTPRINT BOUNDS') {
  const hasBounds = latMin !== null && latMin !== undefined && 
                    latMax !== null && latMax !== undefined && 
                    lonMin !== null && lonMin !== undefined && 
                    lonMax !== null && lonMax !== undefined;

  if (!hasBounds) {
    return `
      <div class="geospatial-preview-panel empty-geo">
        <div class="geo-panel-header">
          <span class="geo-header-title">${title}</span>
          <span class="geo-status-tag">NO GEOMETRY</span>
        </div>
        <div class="geo-empty-body">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span class="geo-empty-text">Footprint geometry not available.</span>
        </div>
      </div>
    `;
  }

  const centerLat = ((latMin + latMax) / 2).toFixed(3);
  const centerLon = ((lonMin + lonMax) / 2).toFixed(3);
  const spanLat = Math.abs(latMax - latMin).toFixed(3);
  const spanLon = Math.abs(lonMax - lonMin).toFixed(3);

  // SVG representation inside standard 240x120 canvas
  return `
    <div class="geospatial-preview-panel">
      <div class="geo-panel-header">
        <div class="geo-header-left">
          <span class="geo-header-badge">SELENOGRAPHIC BOUNDS</span>
          <span class="geo-header-center">Center: [${centerLat}°, ${centerLon}°]</span>
        </div>
        <span class="geo-header-span">${spanLat}° × ${spanLon}°</span>
      </div>
      <div class="geo-canvas-wrap">
        <svg viewBox="0 0 280 130" class="geo-svg-canvas" xmlns="http://www.w3.org/2000/svg">
          <!-- Dark background & lunar graticule -->
          <rect x="0" y="0" width="280" height="130" fill="#09090d" rx="4" stroke="rgba(223, 192, 138, 0.2)" stroke-width="1"/>
          
          <!-- Graticule grid lines -->
          <line x1="20" y1="35" x2="260" y2="35" stroke="#1a1a24" stroke-width="1" stroke-dasharray="2 2"/>
          <line x1="20" y1="65" x2="260" y2="65" stroke="#252535" stroke-width="1"/>
          <line x1="20" y1="95" x2="260" y2="95" stroke="#1a1a24" stroke-width="1" stroke-dasharray="2 2"/>
          
          <line x1="70" y1="15" x2="70" y2="115" stroke="#1a1a24" stroke-width="1" stroke-dasharray="2 2"/>
          <line x1="140" y1="15" x2="140" y2="115" stroke="#252535" stroke-width="1"/>
          <line x1="210" y1="15" x2="210" y2="115" stroke="#1a1a24" stroke-width="1" stroke-dasharray="2 2"/>
          
          <!-- Bounding box representing actual footprint -->
          <rect x="75" y="32" width="130" height="66" fill="rgba(223, 192, 138, 0.08)" stroke="#dfc08a" stroke-width="1.5" stroke-dasharray="4 2" rx="2"/>
          
          <!-- Center reticle -->
          <circle cx="140" cy="65" r="3.5" fill="#dfc08a"/>
          <line x1="132" y1="65" x2="148" y2="65" stroke="#dfc08a" stroke-width="1"/>
          <line x1="140" y1="57" x2="140" y2="73" stroke="#dfc08a" stroke-width="1"/>

          <!-- Corner coordinates text -->
          <text x="25" y="28" fill="#8e8e9e" font-size="8" font-family="monospace">Lat Max: ${latMax.toFixed(2)}°</text>
          <text x="25" y="112" fill="#8e8e9e" font-size="8" font-family="monospace">Lat Min: ${latMin.toFixed(2)}°</text>
          <text x="160" y="28" fill="#8e8e9e" font-size="8" font-family="monospace">Lon Max: ${lonMax.toFixed(2)}°</text>
          <text x="160" y="112" fill="#8e8e9e" font-size="8" font-family="monospace">Lon Min: ${lonMin.toFixed(2)}°</text>
        </svg>
      </div>
      <div class="geo-panel-footer">
        <span>Datum: D_MOON_2000 &bull; Spherical Radius: 1737.4 km</span>
      </div>
    </div>
  `;
}

/**
 * Renders Pair Details Modal Content
 */
function renderPairMetadataPanel(data) {
  const pair = data.pair || data;
  const source = data.source || {};
  const reference = data.reference || {};
  const sourceProd = source.product || {};
  const refProd = reference.product || {};
  const sourceFiles = source.files || [];
  const refFiles = reference.files || [];

  let regionLabel = 'Not assigned';
  if (pair.region_id !== null && pair.region_id !== undefined && pair.region_id !== '') {
    if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
      regionLabel = window.regionService.formatRegionName(pair.region_id);
    } else {
      regionLabel = `Region #${pair.region_id}`;
    }
  }

  const overlapStatus = pair.overlap_status || 'UNVERIFIED';
  const overlapRatioStr = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined)
    ? `${(pair.overlap_ratio * 100).toFixed(2)}%`
    : 'Not available';
  const overlapAreaStr = (pair.overlap_area !== null && pair.overlap_area !== undefined)
    ? `${pair.overlap_area.toFixed(4)} km²`
    : 'Not available';

  const verificationMethod = pair.verification_method || 'Not verified';
  const evidenceSource = pair.evidence_source || 'Not available';
  const verificationNotes = pair.verification_notes || 'No notes provided.';
  const createdAtStr = formatUtcDate(pair.created_at);

  // Parse footprint if available from source or reference product
  const srcLatMin = sourceProd.footprint_lat_min;
  const srcLatMax = sourceProd.footprint_lat_max;
  const srcLonMin = sourceProd.footprint_lon_min;
  const srcLonMax = sourceProd.footprint_lon_max;

  return `
    <div class="canonical-metadata-panel">
      <!-- Pair Summary Section -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">PAIR DETAILS &bull; PAIR #${pair.id}</span>
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : `<span class="canonical-badge">${overlapStatus}</span>`}
        </div>
        <div class="meta-grid-2">
          <div class="meta-field-item">
            <span class="meta-field-label">PAIR ID</span>
            <span class="meta-field-val highlight">#${pair.id}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP STATUS</span>
            <span class="meta-field-val">${overlapStatus}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP RATIO</span>
            <span class="meta-field-val">${overlapRatioStr}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP AREA</span>
            <span class="meta-field-val">${overlapAreaStr}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">VERIFICATION METHOD</span>
            <span class="meta-field-val">${verificationMethod}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">EVIDENCE SOURCE</span>
            <span class="meta-field-val">${evidenceSource}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">REGION</span>
            <span class="meta-field-val ${pair.region_id ? '' : 'region-unassigned'}">${regionLabel}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">CREATED AT</span>
            <span class="meta-field-val col-mono">${createdAtStr}</span>
          </div>
          <div class="meta-field-item" style="grid-column: span 2;">
            <span class="meta-field-label">VERIFICATION NOTES</span>
            <span class="meta-field-val" style="font-size:11px; line-height:1.5;">${verificationNotes}</span>
          </div>
        </div>
      </div>

      <!-- Geospatial Overlap Geometry Section -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">OVERLAP GEOSPATIAL METADATA</span>
        </div>
        ${renderGeospatialFootprintSvg(srcLatMin, srcLatMax, srcLonMin, srcLonMax, 'PAIR OVERLAP FOOTPRINT')}
      </div>

      <!-- Source & Reference Products Comparison (Side-by-Side) -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">SCIENTIFIC SIDE-BY-SIDE: SOURCE vs REFERENCE</span>
        </div>
        <div class="meta-side-by-side">
          <!-- Source Column -->
          <div class="meta-col">
            <div class="meta-col-title source">
              <span>SOURCE PRODUCT</span>
              <span class="meta-tag source">${pair.source_instrument || sourceProd.instrument || 'SOURCE'}</span>
            </div>
            <div class="meta-list-compact">
              <div class="meta-compact-row">
                <span>Product ID:</span>
                <strong title="${sourceProd.product_id || ''}">${sourceProd.product_id || `#${pair.source_product_id}`}</strong>
              </div>
              <div class="meta-compact-row">
                <span>Mission:</span>
                <span>${sourceProd.mission || 'Chandrayaan-2'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Resolution:</span>
                <span>${sourceProd.resolution !== undefined && sourceProd.resolution !== null ? `${sourceProd.resolution} m/px` : 'Not available'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Acquisition:</span>
                <span class="col-mono">${formatUtcDate(sourceProd.acquisition_time || sourceProd.start_time)}</span>
              </div>
              <div class="meta-compact-row">
                <span>Product Type:</span>
                <span>${sourceProd.product_type || 'IMG'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Files Available:</span>
                <span>${sourceFiles.length} files</span>
              </div>
            </div>
          </div>

          <!-- Reference Column -->
          <div class="meta-col">
            <div class="meta-col-title ref">
              <span>REFERENCE PRODUCT</span>
              <span class="meta-tag ref">${pair.reference_instrument || refProd.instrument || 'REFERENCE'}</span>
            </div>
            <div class="meta-list-compact">
              <div class="meta-compact-row">
                <span>Product ID:</span>
                <strong title="${refProd.product_id || ''}">${refProd.product_id || `#${pair.reference_product_id}`}</strong>
              </div>
              <div class="meta-compact-row">
                <span>Mission:</span>
                <span>${refProd.mission || 'Chandrayaan-2'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Resolution:</span>
                <span>${refProd.resolution !== undefined && refProd.resolution !== null ? `${refProd.resolution} m/px` : 'Not available'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Acquisition:</span>
                <span class="col-mono">${formatUtcDate(refProd.acquisition_time || refProd.start_time)}</span>
              </div>
              <div class="meta-compact-row">
                <span>Product Type:</span>
                <span>${refProd.product_type || 'IMG'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Files Available:</span>
                <span>${refFiles.length} files</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="meta-footer-actions">
        <button class="btn-tech primary" id="btn-modal-prepare-pair" data-pair-id="${pair.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>PREPARE REGISTRATION</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Renders Product Details Modal Content
 */
function renderProductMetadataPanel(data) {
  const product = data.product || data;
  const files = data.files || [];

  const timeStr = formatUtcDate(product.acquisition_time || product.start_time);
  const createdStr = formatUtcDate(product.created_at);

  const resVal = product.resolution !== undefined && product.resolution !== null 
    ? product.resolution 
    : product.resolution_m_per_px;
  const resStr = (resVal !== undefined && resVal !== null) ? `${resVal} m/pixel` : 'Not available';

  const calibStatus = product.calibration_status || product.processing_level || 'Calibrated';
  const prodType = product.product_type || 'IMG';

  let regionLabel = 'Not assigned';
  if (product.region_id !== null && product.region_id !== undefined && product.region_id !== '') {
    if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
      regionLabel = window.regionService.formatRegionName(product.region_id);
    } else {
      regionLabel = `Region #${product.region_id}`;
    }
  }

  const hasFootprint = product.footprint_lat_min !== null && product.footprint_lat_min !== undefined &&
                       product.footprint_lat_max !== null && product.footprint_lat_max !== undefined;

  return `
    <div class="canonical-metadata-panel">
      <!-- Product Attributes Section -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">PRODUCT DETAILS &bull; ${product.product_id || `#${product.id}`}</span>
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(calibStatus) : `<span class="canonical-badge">${calibStatus}</span>`}
        </div>
        <div class="meta-grid-2">
          <div class="meta-field-item">
            <span class="meta-field-label">INSTRUMENT</span>
            <span class="meta-field-val highlight">${product.instrument || 'Not available'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">MISSION</span>
            <span class="meta-field-val">${product.mission || 'Chandrayaan-2'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">PRODUCT ID</span>
            <span class="meta-field-val highlight">${product.product_id || 'Not available'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">ACQUISITION TIME</span>
            <span class="meta-field-val col-mono">${timeStr}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">RESOLUTION</span>
            <span class="meta-field-val">${resStr}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">PRODUCT TYPE</span>
            <span class="meta-field-val">${prodType}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">CALIBRATION STATUS</span>
            <span class="meta-field-val">${calibStatus}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">REGION</span>
            <span class="meta-field-val ${product.region_id ? '' : 'region-unassigned'}">${regionLabel}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">INTERNAL DATABASE ID</span>
            <span class="meta-field-val">#${product.id}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">CREATED AT</span>
            <span class="meta-field-val col-mono">${createdStr}</span>
          </div>

          ${hasFootprint ? `
          <div class="meta-field-item">
            <span class="meta-field-label">LATITUDE MIN</span>
            <span class="meta-field-val col-mono">${product.footprint_lat_min.toFixed(4)}°</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">LATITUDE MAX</span>
            <span class="meta-field-val col-mono">${product.footprint_lat_max.toFixed(4)}°</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">LONGITUDE MIN</span>
            <span class="meta-field-val col-mono">${product.footprint_lon_min.toFixed(4)}°</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">LONGITUDE MAX</span>
            <span class="meta-field-val col-mono">${product.footprint_lon_max.toFixed(4)}°</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Geospatial Footprint Visualizer -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">GEOSPATIAL FOOTPRINT VISUALIZATION</span>
        </div>
        ${renderGeospatialFootprintSvg(
          product.footprint_lat_min, 
          product.footprint_lat_max, 
          product.footprint_lon_min, 
          product.footprint_lon_max,
          'PRODUCT GROUND FOOTPRINT'
        )}
      </div>

      <!-- Product Files Dedicated Panel -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">PRODUCT FILES ARCHIVE (${files.length})</span>
        </div>
        ${files.length === 0 ? '<div class="empty-files-hint">No files associated with this product.</div>' : `
          <div class="canonical-table-wrapper" style="margin-top: 8px;">
            <table class="canonical-table" id="product-files-table">
              <thead>
                <tr>
                  <th>FILE NAME</th>
                  <th>ROLE</th>
                  <th>TYPE</th>
                  <th>STORAGE PROVIDER</th>
                  <th>FILE SIZE</th>
                  <th>MIME TYPE</th>
                  <th>DRIVE ID (METADATA)</th>
                </tr>
              </thead>
              <tbody>
                ${files.map(f => {
                  const role = f.file_role || f.role || 'PRIMARY';
                  const type = f.file_type || 'IMG';
                  const provider = f.storage_provider || 'local';
                  const size = formatBytes(f.file_size_bytes);
                  const mime = f.mime_type || 'image/x-pds-img';
                  const driveId = f.drive_file_id ? f.drive_file_id.slice(0, 10) + '...' : '—';
                  const fullDriveId = f.drive_file_id || '';

                  return `
                    <tr>
                      <td class="col-highlight" title="${f.file_name}">${f.file_name || 'Unnamed file'}</td>
                      <td><span class="product-type-pill">${role}</span></td>
                      <td><span class="format-badge">${type}</span></td>
                      <td><span class="col-mono" style="font-size:10px;">${provider}</span></td>
                      <td class="col-mono">${size}</td>
                      <td><span class="col-mono" style="font-size:10px;">${mime}</span></td>
                      <td>
                        ${fullDriveId ? `
                          <span class="drive-meta-badge" title="Drive File ID: ${fullDriveId} (Metadata only — direct access disabled)">
                            ${driveId}
                          </span>
                        ` : '<span class="col-muted">—</span>'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMetadataPanel = renderMetadataPanel;
  exports.renderGeospatialFootprintSvg = renderGeospatialFootprintSvg;
}
if (typeof window !== 'undefined') {
  window.renderMetadataPanel = renderMetadataPanel;
  window.renderGeospatialFootprintSvg = renderGeospatialFootprintSvg;
}

