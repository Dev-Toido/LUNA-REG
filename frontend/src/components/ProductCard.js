/**
 * LUNA-REG: ProductCard Component
 * Displays individual canonical lunar product card
 */

function renderProductCard(product) {
  if (!product) return '';

  const id = product.id;
  const productId = product.product_id || `PROD-${id}`;
  const instrument = product.instrument || 'UNKNOWN';
  const mission = product.mission || 'Chandrayaan-2';
  const level = product.processing_level || 'Calibrated';
  const timeStr = product.start_time ? new Date(product.start_time).toLocaleDateString() : '—';
  const res = product.resolution_m_per_px ? `${product.resolution_m_per_px} m/px` : '—';

  return `
    <div class="dataset-card canonical-product-card" data-product-id="${id}" id="product-card-${id}">
      <div class="dataset-card-header">
        <span class="product-inst-badge">${instrument}</span>
        ${typeof renderStatusBadge === 'function' ? renderStatusBadge(level) : `<span class="canonical-badge">${level}</span>`}
      </div>

      <div class="product-card-body">
        <h4 class="product-id-title" title="${productId}">${productId}</h4>
        <div class="product-mission-sub">${mission}</div>

        <div class="dataset-meta-list">
          <div class="dataset-meta-row">
            <span>Resolution:</span>
            <strong>${res}</strong>
          </div>
          <div class="dataset-meta-row">
            <span>Acquisition:</span>
            <span>${timeStr}</span>
          </div>
          <div class="dataset-meta-row">
            <span>Region ID:</span>
            <span>${product.region_id || 'Global / Unassigned'}</span>
          </div>
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
