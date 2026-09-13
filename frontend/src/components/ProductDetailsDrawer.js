/**
 * LUNA-REG: ProductDetailsDrawer Component (Part 6)
 * Off-canvas sliding drawer displaying complete product telemetry, footprint, and file manifests
 * 
 * Features:
 * - Product identification & classification
 * - Acquisition time and orbital parameters
 * - Geometric resolution (GSD) & pixel dimensions
 * - Geographic footprint coordinates [Lat min..max, Lon min..max]
 * - Embedded FileMetadataPanel with real file manifest
 * - Close button and backdrop event triggers
 * 
 * Design: Zero blue. Lunar dark palette, champagne gold accents.
 */

function renderProductDetailsDrawer(options = {}) {
  const {
    product = null,
    region = null,
    files = [],
    isLoadingFiles = false,
    filesError = null
  } = options;

  if (!product) {
    return '';
  }

  const rawTime = product.acquisition_time || product.start_time || product.created_at;
  const timeStr = rawTime ? new Date(rawTime).toUTCString() : '—';

  const resVal = product.resolution !== undefined && product.resolution !== null 
    ? product.resolution 
    : product.resolution_m_per_px;
  const resStr = (resVal !== undefined && resVal !== null) ? `${resVal} m/pixel` : '—';

  const dimsStr = (product.width_px && product.height_px) 
    ? `${product.width_px} × ${product.height_px} px` 
    : (product.pixel_dimensions || '—');

  const regionName = region ? (region.name || `Region #${region.id}`) : (product.region_name || 'Not assigned');

  // Footprint coordinates
  const minLat = product.min_latitude ?? product.footprint_min_lat ?? '—';
  const maxLat = product.max_latitude ?? product.footprint_max_lat ?? '—';
  const minLon = product.min_longitude ?? product.footprint_min_lon ?? '—';
  const maxLon = product.max_longitude ?? product.footprint_max_lon ?? '—';
  const centerLat = product.center_latitude ?? '—';
  const centerLon = product.center_longitude ?? '—';

  // Solar and incidence angles
  const solarElevation = product.solar_elevation ?? product.sun_elevation_deg ?? '—';
  const incidenceAngle = product.incidence_angle ?? product.incidence_deg ?? '—';
  const emissionAngle = product.emission_angle ?? product.emission_deg ?? '—';

  const calibStatus = product.calibration_status || product.processing_level || 'CALIBRATED';
  const prodType = product.product_type || 'IMG';

  return `
    <div class="drawer-header">
      <div class="drawer-title-group">
        <span class="drawer-category">LUNAR PRODUCT TELEMETRY</span>
        <h2 class="drawer-title" id="drawer-product-title">${escapeHtmlProd(product.product_id || `PROD-${product.id}`)}</h2>
      </div>
      <button class="btn-drawer-close" id="btn-close-product-drawer" title="Close drawer (Esc)">&times;</button>
    </div>

    <div class="drawer-body">
      <!-- Top Overview Card -->
      <div class="drawer-summary-card">
        <div class="summary-item">
          <span class="lbl">INSTRUMENT</span>
          <span class="val text-gold">${escapeHtmlProd(product.instrument || '—')}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">MISSION</span>
          <span class="val">${escapeHtmlProd(product.mission || 'Chandrayaan-2')}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">PRODUCT TYPE</span>
          <span class="val">${escapeHtmlProd(prodType)}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">CALIBRATION</span>
          <span class="val">${typeof renderStatusBadge === 'function' ? renderStatusBadge(calibStatus) : calibStatus}</span>
        </div>
      </div>

      <!-- Temporal & Orbital Telemetry -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">TEMPORAL & ORBITAL PARAMETERS</span>
        </div>
        <div class="drawer-grid-2col">
          <div class="grid-item">
            <span class="g-lbl">ACQUISITION TIME</span>
            <span class="g-val col-mono">${timeStr}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">ORBIT NUMBER</span>
            <span class="g-val col-mono">${product.orbit_number || product.orbit || '—'}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">SOLAR ELEVATION</span>
            <span class="g-val col-mono">${solarElevation !== '—' ? `${solarElevation}°` : '—'}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">INCIDENCE ANGLE</span>
            <span class="g-val col-mono">${incidenceAngle !== '—' ? `${incidenceAngle}°` : '—'}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">EMISSION ANGLE</span>
            <span class="g-val col-mono">${emissionAngle !== '—' ? `${emissionAngle}°` : '—'}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">TARGET REGION</span>
            <span class="g-val">${escapeHtmlProd(regionName)}</span>
          </div>
        </div>
      </div>

      <!-- Spatial & Footprint Resolution -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">SPATIAL RESOLUTION & FOOTPRINT BOUNDS</span>
        </div>
        <div class="drawer-grid-2col">
          <div class="grid-item">
            <span class="g-lbl">GROUND SAMPLE DISTANCE (GSD)</span>
            <span class="g-val col-mono text-gold">${resStr}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">PIXEL DIMENSIONS</span>
            <span class="g-val col-mono">${dimsStr}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">CENTER LATITUDE</span>
            <span class="g-val col-mono">${centerLat !== '—' ? `${centerLat}°` : '—'}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">CENTER LONGITUDE</span>
            <span class="g-val col-mono">${centerLon !== '—' ? `${centerLon}°` : '—'}</span>
          </div>
          <div class="grid-item full-width">
            <span class="g-lbl">BOUNDING BOX [LAT MIN..MAX, LON MIN..MAX]</span>
            <span class="g-val col-mono">${minLat !== '—' ? `[${minLat}°..${maxLat}°, ${minLon}°..${maxLon}°]` : 'Not available'}</span>
          </div>
        </div>
      </div>

      <!-- Associated Storage Files Manifest -->
      <div class="drawer-section">
        ${typeof renderFileMetadataPanel === 'function' 
          ? renderFileMetadataPanel({
              files: files,
              product: product,
              isLoading: isLoadingFiles,
              errorMessage: filesError
            })
          : '<div class="file-manifest-fallback">Files manifest ready.</div>'}
      </div>
    </div>

    <div class="drawer-footer">
      <button class="btn-tech-sm" id="btn-drawer-product-close-footer">CLOSE INSPECTION</button>
      <span class="footer-note">LUNA-REG MISSION ARCHIVE • STRICT READ-ONLY</span>
    </div>
  `;
}

function escapeHtmlProd(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderProductDetailsDrawer = renderProductDetailsDrawer;
}
if (typeof window !== 'undefined') {
  window.renderProductDetailsDrawer = renderProductDetailsDrawer;
}
