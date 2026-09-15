/**
 * LUNA-REG: FeatureInfoPanel Component (Part 7)
 * Interactive GIS telemetry card for selected lunar regions, products, and registration pairs
 * 
 * Strict Compliance:
 * - Zero Blue Palette: Obsidian black, deep charcoal, lunar grey, champagne gold.
 * - Zero Fake Data: If geometry data is missing, explicitly displays:
 *   "Geometry data is not available for this record."
 * - Direct deep links to Dataset Explorer, Registration Results, and Analysis Tools.
 */

function renderFeatureInfoPanel(options = {}) {
  const {
    feature = null, // { type: 'region'|'product'|'pair', data: Object }
    regionsMap = {}
  } = options;

  if (!feature || !feature.data) {
    return `
      <div class="feature-info-panel empty" id="feature-info-panel">
        <div class="feature-info-empty-prompt">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="12 8 8 12 12 16 16 12 12 8"></polygon>
          </svg>
          <span>SELECT A FEATURE ON THE MAP TO INSPECT TELEMETRY</span>
        </div>
      </div>
    `;
  }

  const { type, data } = feature;

  if (type === 'region') {
    return renderRegionFeatureInfo(data);
  } else if (type === 'product') {
    return renderProductFeatureInfo(data, regionsMap);
  } else if (type === 'pair') {
    return renderPairFeatureInfo(data, regionsMap);
  }

  return '';
}

function renderRegionFeatureInfo(region) {
  const minLat = region.lat_min ?? region.min_latitude;
  const maxLat = region.lat_max ?? region.max_latitude;
  const minLon = region.lon_min ?? region.min_longitude;
  const maxLon = region.lon_max ?? region.max_longitude;

  const hasGeometry = minLat !== undefined && minLat !== null &&
                      maxLat !== undefined && maxLat !== null &&
                      minLon !== undefined && minLon !== null &&
                      maxLon !== undefined && maxLon !== null;

  const centerLat = (typeof minLat === 'number' && typeof maxLat === 'number')
    ? ((minLat + maxLat) / 2).toFixed(4) + '°'
    : (region.center_latitude ? Number(region.center_latitude).toFixed(4) + '°' : '—');
  const centerLon = (typeof minLon === 'number' && typeof maxLon === 'number')
    ? ((minLon + maxLon) / 2).toFixed(4) + '°'
    : (region.center_longitude ? Number(region.center_longitude).toFixed(4) + '°' : '—');

  const boundsStr = hasGeometry
    ? `Lat [${Number(minLat).toFixed(2)}° to ${Number(maxLat).toFixed(2)}°] • Lon [${Number(minLon).toFixed(2)}° to ${Number(maxLon).toFixed(2)}°]`
    : null;

  return `
    <div class="feature-info-panel" id="feature-info-panel">
      <div class="panel-header">
        <div class="panel-badge region">LUNAR REGION</div>
        <button type="button" class="btn-close-feature-panel" id="btn-close-feature-panel" title="Close inspector">&times;</button>
      </div>

      <div class="panel-title-area">
        <h3 class="panel-feature-title text-gold">${escapeHtmlFip(region.name || `Region #${region.id}`)}</h3>
        <span class="panel-sub-classification col-mono">${escapeHtmlFip(region.region_type || 'Lunar Study Region')}</span>
      </div>

      <div class="panel-telemetry-grid">
        <div class="telemetry-item">
          <span class="lbl">REGION ID:</span>
          <span class="val col-mono text-gold">REG-#${region.id}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">CRS DATUM:</span>
          <span class="val col-mono">Moon 2000 IAU/IAG</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">CENTER LAT:</span>
          <span class="val col-mono">${centerLat}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">CENTER LON:</span>
          <span class="val col-mono">${centerLon}</span>
        </div>
      </div>

      <!-- Geometry Verification -->
      <div class="panel-geometry-section">
        <div class="section-label">GEODETIC EXTENTS:</div>
        ${boundsStr ? `
          <div class="bounds-box col-mono">${boundsStr}</div>
        ` : `
          <div class="geometry-missing-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Geometry data is not available for this record.</span>
          </div>
        `}
      </div>

      ${region.description ? `
        <div class="panel-desc-section">
          <div class="section-label">SCIENTIFIC SIGNIFICANCE:</div>
          <p class="panel-desc-text">${escapeHtmlFip(region.description)}</p>
        </div>
      ` : ''}

      <!-- Action Links -->
      <div class="panel-actions-group">
        <a href="#/dataset?tab=regions&region_id=${region.id}" class="btn-tech primary" title="View products linked to this region in Dataset Explorer">
          VIEW IN DATASET
        </a>
      </div>
    </div>
  `;
}

function renderProductFeatureInfo(product, regionsMap = {}) {
  const minLat = product.footprint_lat_min ?? product.min_latitude;
  const maxLat = product.footprint_lat_max ?? product.max_latitude;
  const minLon = product.footprint_lon_min ?? product.min_longitude;
  const maxLon = product.footprint_lon_max ?? product.max_longitude;

  const hasFootprintCoords = minLat !== undefined && minLat !== null &&
                             maxLat !== undefined && maxLat !== null &&
                             minLon !== undefined && minLon !== null &&
                             maxLon !== undefined && maxLon !== null;
  const hasFootprintJson = !!product.footprint_json;

  const rawTime = product.acquisition_time || product.start_time || product.created_at;
  const timeStr = rawTime ? new Date(rawTime).toUTCString() : '—';
  const resStr = (product.resolution !== null && product.resolution !== undefined) 
    ? `${product.resolution} m/px` 
    : '—';

  let regionName = 'Not assigned';
  if (product.region_id !== null && product.region_id !== undefined) {
    const reg = regionsMap[String(product.region_id)];
    regionName = reg ? (reg.name || `Region #${reg.id}`) : `Region #${product.region_id}`;
  }

  return `
    <div class="feature-info-panel" id="feature-info-panel">
      <div class="panel-header">
        <div class="panel-badge product">LUNAR PRODUCT</div>
        <button type="button" class="btn-close-feature-panel" id="btn-close-feature-panel" title="Close inspector">&times;</button>
      </div>

      <div class="panel-title-area">
        <h3 class="panel-feature-title text-gold">${escapeHtmlFip(product.product_id || `PROD-${product.id}`)}</h3>
        <span class="panel-sub-classification col-mono">${escapeHtmlFip(product.mission || 'Chandrayaan-2')} &bull; ${escapeHtmlFip(product.instrument || 'Sensor')}</span>
      </div>

      <div class="panel-telemetry-grid">
        <div class="telemetry-item">
          <span class="lbl">INSTRUMENT:</span>
          <span class="val col-mono text-gold">${escapeHtmlFip(product.instrument || '—')}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">SPATIAL GSD:</span>
          <span class="val col-mono text-gold">${resStr}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">TYPE:</span>
          <span class="val col-mono">${escapeHtmlFip(product.product_type || 'IMG')}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">CALIBRATION:</span>
          <span class="val col-mono">${escapeHtmlFip(product.calibration_status || 'CALIBRATED')}</span>
        </div>
        <div class="telemetry-item full-width">
          <span class="lbl">ACQUISITION TIME:</span>
          <span class="val col-mono">${timeStr}</span>
        </div>
        <div class="telemetry-item full-width">
          <span class="lbl">ASSIGNED REGION:</span>
          <span class="val">${escapeHtmlFip(regionName)}</span>
        </div>
      </div>

      <!-- Footprint Coordinates & Geometry Verification -->
      <div class="panel-geometry-section">
        <div class="section-label">FOOTPRINT GEODETIC EXTENTS:</div>
        ${hasFootprintCoords ? `
          <div class="bounds-box col-mono">
            Lat [${Number(minLat).toFixed(4)}° to ${Number(maxLat).toFixed(4)}°]<br>
            Lon [${Number(minLon).toFixed(4)}° to ${Number(maxLon).toFixed(4)}°]
          </div>
        ` : (hasFootprintJson ? `
          <div class="bounds-box col-mono">POLYGON FOOTPRINT LOADED</div>
        ` : `
          <div class="geometry-missing-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Geometry data is not available for this record.</span>
          </div>
        `)}
      </div>

      <!-- Action Links -->
      <div class="panel-actions-group">
        <a href="#/dataset?tab=products&product_id=${product.id}" class="btn-tech primary" title="View product details in Dataset Explorer">
          VIEW IN DATASET
        </a>
      </div>
    </div>
  `;
}

function renderPairFeatureInfo(pair, regionsMap = {}) {
  const overlapRatioStr = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined)
    ? `${(Number(pair.overlap_ratio) * 100).toFixed(2)}%`
    : '—';
  const overlapAreaStr = (pair.overlap_area !== null && pair.overlap_area !== undefined)
    ? `${Number(pair.overlap_area).toFixed(2)} km²`
    : '—';

  const hasOverlapGeom = !!pair.overlap_geometry_json;

  let regionName = 'Not assigned';
  if (pair.region_id !== null && pair.region_id !== undefined) {
    const reg = regionsMap[String(pair.region_id)];
    regionName = reg ? (reg.name || `Region #${reg.id}`) : `Region #${pair.region_id}`;
  }

  return `
    <div class="feature-info-panel" id="feature-info-panel">
      <div class="panel-header">
        <div class="panel-badge pair">REGISTRATION PAIR</div>
        <button type="button" class="btn-close-feature-panel" id="btn-close-feature-panel" title="Close inspector">&times;</button>
      </div>

      <div class="panel-title-area">
        <h3 class="panel-feature-title text-gold">PAIR #${pair.id}</h3>
        <span class="panel-sub-classification col-mono">${escapeHtmlFip(pair.source_instrument || 'Source')} &harr; ${escapeHtmlFip(pair.reference_instrument || 'Reference')}</span>
      </div>

      <div class="panel-telemetry-grid">
        <div class="telemetry-item">
          <span class="lbl">OVERLAP STATUS:</span>
          <span class="val col-mono text-gold">${escapeHtmlFip(pair.overlap_status || 'UNVERIFIED')}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">OVERLAP RATIO:</span>
          <span class="val col-mono text-gold">${overlapRatioStr}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">OVERLAP AREA:</span>
          <span class="val col-mono">${overlapAreaStr}</span>
        </div>
        <div class="telemetry-item">
          <span class="lbl">METHOD:</span>
          <span class="val col-mono">${escapeHtmlFip(pair.verification_method || 'Geometric Overlap')}</span>
        </div>
        <div class="telemetry-item full-width">
          <span class="lbl">ASSIGNED REGION:</span>
          <span class="val">${escapeHtmlFip(regionName)}</span>
        </div>
      </div>

      <!-- Overlap Geometry Verification -->
      <div class="panel-geometry-section">
        <div class="section-label">SPATIAL OVERLAP GEOMETRY:</div>
        ${hasOverlapGeom ? `
          <div class="bounds-box col-mono">INTERSECTION POLYGON DEFINED</div>
        ` : `
          <div class="geometry-missing-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Geometry data is not available for this record.</span>
          </div>
        `}
      </div>

      ${pair.verification_notes ? `
        <div class="panel-desc-section">
          <div class="section-label">VERIFICATION TELEMETRY:</div>
          <p class="panel-desc-text">${escapeHtmlFip(pair.verification_notes)}</p>
        </div>
      ` : ''}

      <!-- Multi-Module Deep Links -->
      <div class="panel-actions-group">
        <a href="#/results?pair_id=${pair.id}" class="btn-tech primary" title="Open registration alignment results">
          RESULTS
        </a>
        <a href="#/analysis-tools?pair_id=${pair.id}" class="btn-tech" title="Open multi-modal analysis tools workspace">
          ANALYZE
        </a>
        <a href="#/dataset?tab=pairs&pair_id=${pair.id}" class="btn-tech" title="View in Dataset Explorer">
          DATASET
        </a>
      </div>
    </div>
  `;
}

function escapeHtmlFip(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderFeatureInfoPanel = renderFeatureInfoPanel;
}
if (typeof window !== 'undefined') {
  window.renderFeatureInfoPanel = renderFeatureInfoPanel;
}
