/**
 * LUNA-REG: RegionDetailsDrawer Component (Part 6)
 * Off-canvas sliding drawer displaying geographic bounds, scientific significance, and linked products for a lunar region
 * 
 * Features:
 * - Region ID and name
 * - Feature classification (Crater, Basin, South Pole)
 * - Center coordinates and geodetic bounding box
 * - Scientific importance & terrain notes
 * - List of associated lunar products
 * 
 * Design: Zero blue. Lunar dark palette, champagne gold accents.
 */

function renderRegionDetailsDrawer(options = {}) {
  const {
    region = null,
    products = []
  } = options;

  if (!region) {
    return '';
  }

  const minLat = region.lat_min ?? region.min_latitude;
  const maxLat = region.lat_max ?? region.max_latitude;
  const minLon = region.lon_min ?? region.min_longitude;
  const maxLon = region.lon_max ?? region.max_longitude;

  const centerLat = (typeof minLat === 'number' && typeof maxLat === 'number')
    ? (minLat + maxLat) / 2
    : (region.center_latitude ?? null);
  const centerLon = (typeof minLon === 'number' && typeof maxLon === 'number')
    ? (minLon + maxLon) / 2
    : (region.center_longitude ?? null);

  const latStr = (centerLat !== null && centerLat !== undefined) 
    ? `${Number(centerLat).toFixed(4)}°` 
    : '—';
  const lonStr = (centerLon !== null && centerLon !== undefined) 
    ? `${Number(centerLon).toFixed(4)}°` 
    : '—';

  let boundsStr = 'Not available';
  if (minLat !== undefined && maxLat !== undefined && minLon !== undefined && maxLon !== undefined) {
    boundsStr = `Lat: [${Number(minLat).toFixed(2)}° to ${Number(maxLat).toFixed(2)}°] • Lon: [${Number(minLon).toFixed(2)}° to ${Number(maxLon).toFixed(2)}°]`;
  } else if (region.bounding_box) {
    boundsStr = typeof region.bounding_box === 'string' ? region.bounding_box : JSON.stringify(region.bounding_box);
  }

  const featureType = region.region_type || region.feature_type || region.classification || 'Lunar Study Region';
  const regionProducts = Array.isArray(products) 
    ? products.filter(p => String(p.region_id) === String(region.id)) 
    : [];

  return `
    <div class="drawer-header">
      <div class="drawer-title-group">
        <span class="drawer-category">TARGET REGION GEODESY</span>
        <h2 class="drawer-title" id="drawer-region-title">${escapeHtmlReg(region.name || `Region #${region.id}`)}</h2>
      </div>
      <button class="btn-drawer-close" id="btn-close-region-drawer" title="Close drawer (Esc)">&times;</button>
    </div>

    <div class="drawer-body">
      <!-- Top Summary Card -->
      <div class="drawer-summary-card">
        <div class="summary-item">
          <span class="lbl">REGION ID</span>
          <span class="val col-mono text-gold">REG-#${region.id}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">FEATURE CLASSIFICATION</span>
          <span class="val">${escapeHtmlReg(featureType)}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">LINKED PRODUCTS</span>
          <span class="val">${regionProducts.length} RASTERS</span>
        </div>
      </div>

      <!-- Geodetic & Coordinate Extents -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">GEODETIC COORDINATES & SPATIAL EXTENTS</span>
        </div>
        <div class="drawer-grid-2col">
          <div class="grid-item">
            <span class="g-lbl">CENTER LATITUDE</span>
            <span class="g-val col-mono">${latStr}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">CENTER LONGITUDE</span>
            <span class="g-val col-mono">${lonStr}</span>
          </div>
          <div class="grid-item full-width">
            <span class="g-lbl">GEODETIC BOUNDING EXTENTS</span>
            <span class="g-val col-mono text-gold">${escapeHtmlReg(boundsStr)}</span>
          </div>
          <div class="grid-item full-width">
            <span class="g-lbl">SCIENTIFIC SIGNIFICANCE / REGION NOTES</span>
            <span class="g-val">${escapeHtmlReg(region.description || region.notes || 'High-priority exploration quadrant containing permanently shadowed regions (PSRs) and multi-temporal orbital coverage.')}</span>
          </div>
        </div>
      </div>

      <!-- Associated Products List -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">LINKED CANONICAL PRODUCTS (${regionProducts.length})</span>
        </div>

        ${regionProducts.length === 0 ? `
          <div class="empty-state-subtle">No raster products are currently linked to this region in the catalog.</div>
        ` : `
          <div class="linked-products-list">
            ${regionProducts.map(p => `
              <div class="linked-product-row">
                <div class="prod-info-group">
                  <span class="prod-id col-mono">${escapeHtmlReg(p.product_id || `PROD-${p.id}`)}</span>
                  <span class="prod-inst-pill">${escapeHtmlReg(p.instrument || '—')}</span>
                </div>
                <div class="prod-meta-group">
                  <span class="prod-res col-mono">${p.resolution ? `${p.resolution} m/px` : '—'}</span>
                  <button class="btn-tech-sm btn-view-prod-from-region" data-product-id="${p.id}" title="Inspect product">
                    INSPECT
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>

    <div class="drawer-footer">
      <button class="btn-tech-sm" id="btn-drawer-region-close-footer">CLOSE INSPECTION</button>
      <span class="footer-note">LUNA-REG GIS ATLAS</span>
    </div>
  `;
}

function escapeHtmlReg(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderRegionDetailsDrawer = renderRegionDetailsDrawer;
}
if (typeof window !== 'undefined') {
  window.renderRegionDetailsDrawer = renderRegionDetailsDrawer;
}
