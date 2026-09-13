/**
 * LUNA-REG: ProductCard Component
 * Displays individual canonical lunar product in hybrid card layout
 * 
 * Fields supported:
 * - Instrument
 * - Mission
 * - Product ID
 * - Acquisition Time
 * - Resolution
 * - Product Type
 * - Calibration Status
 * - Region ("Not assigned" if null)
 * - Footprint Bounds
 */

function renderProductCard(product, regionsMap = null) {
  if (!product) return '';

  const id = product.id;
  const productId = product.product_id || `PROD-${id}`;
  const instrument = product.instrument || 'UNKNOWN';
  const mission = product.mission || 'Chandrayaan-2';
  const productType = product.product_type || 'IMG';
  const calibrationStatus = product.calibration_status || product.processing_level || 'Calibrated';
  
  // Format acquisition time (support acquisition_time or start_time)
  const rawTime = product.acquisition_time || product.start_time;
  const timeStr = rawTime ? new Date(rawTime).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
  }) + ' UTC' : '—';

  // Format resolution (support resolution or resolution_m_per_px)
  const resVal = product.resolution !== undefined && product.resolution !== null 
    ? product.resolution 
    : product.resolution_m_per_px;
  const resStr = (resVal !== undefined && resVal !== null) ? `${resVal} m/px` : '—';

  // Format region gracefully (handling null without fake coordinates)
  let regionLabel = 'Not assigned';
  if (product.region_id !== null && product.region_id !== undefined && product.region_id !== '') {
    if (regionsMap && regionsMap[String(product.region_id)]) {
      const reg = regionsMap[String(product.region_id)];
      regionLabel = reg.name || `Region #${reg.id}`;
    } else if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
      regionLabel = window.regionService.formatRegionName(product.region_id);
    } else {
      regionLabel = `Region #${product.region_id}`;
    }
  }

  // Optional footprint bounds
  const hasFootprint = product.footprint_lat_min !== null && product.footprint_lat_min !== undefined;
  const footprintStr = hasFootprint 
    ? `[${product.footprint_lat_min.toFixed(2)}°, ${product.footprint_lon_min.toFixed(2)}°] to [${product.footprint_lat_max.toFixed(2)}°, ${product.footprint_lon_max.toFixed(2)}°]`
    : null;

  return `
    <div class="dataset-card canonical-product-card" data-product-id="${id}" id="product-card-${id}">
      <div class="dataset-card-header">
        <div class="prod-badge-cluster">
          <span class="product-inst-badge">${instrument}</span>
          <span class="product-type-badge">${productType}</span>
        </div>
        ${typeof renderStatusBadge === 'function' ? renderStatusBadge(calibrationStatus) : `<span class="canonical-badge">${calibrationStatus}</span>`}
      </div>

      <div class="product-card-body">
        <h4 class="product-id-title" title="${productId}">${productId}</h4>
        <div class="product-mission-sub">${mission}</div>

        <div class="dataset-meta-list">
          <div class="dataset-meta-row">
            <span>Acquisition:</span>
            <strong>${timeStr}</strong>
          </div>
          <div class="dataset-meta-row">
            <span>Resolution:</span>
            <span>${resStr}</span>
          </div>
          <div class="dataset-meta-row">
            <span>Region:</span>
            <span class="${product.region_id ? 'region-assigned' : 'region-unassigned'}">${regionLabel}</span>
          </div>
          ${footprintStr ? `
          <div class="dataset-meta-row">
            <span>Footprint:</span>
            <span class="col-mono" style="font-size:10px;">${footprintStr}</span>
          </div>` : ''}
        </div>
      </div>

      <div class="product-card-footer">
        <button class="btn-tech btn-inspect-product" data-product-id="${id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>INSPECT PRODUCT</span>
        </button>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderProductCard = renderProductCard;
}
if (typeof window !== 'undefined') {
  window.renderProductCard = renderProductCard;
}
