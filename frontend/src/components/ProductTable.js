/**
 * LUNA-REG: ProductTable Component
 * High-density tabular layout for canonical products
 */

function renderProductTable(products = []) {
  if (!products || products.length === 0) {
    return typeof renderEmptyState === 'function' 
      ? renderEmptyState({ title: 'NO PRODUCTS FOUND', message: 'No lunar products match the selected criteria.' })
      : '<div class="empty-state">No products found.</div>';
  }

  return `
    <div class="canonical-table-wrapper">
      <table class="canonical-table" id="products-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>PRODUCT ID</th>
            <th>INSTRUMENT</th>
            <th>MISSION</th>
            <th>LEVEL</th>
            <th>RESOLUTION</th>
            <th>ACQUISITION</th>
            <th>REGION</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(p => {
            const timeStr = p.start_time ? new Date(p.start_time).toISOString().slice(0, 10) : '—';
            const resStr = p.resolution_m_per_px ? `${p.resolution_m_per_px} m/px` : '—';
            return `
              <tr data-product-id="${p.id}">
                <td class="col-mono">#${p.id}</td>
                <td class="col-highlight" title="${p.product_id || ''}">${p.product_id || `PROD-${p.id}`}</td>
                <td><span class="product-inst-tag">${p.instrument || '—'}</span></td>
                <td>${p.mission || 'Chandrayaan-2'}</td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(p.processing_level || 'Calibrated') : (p.processing_level || '—')}</td>
                <td class="col-mono">${resStr}</td>
                <td class="col-mono">${timeStr}</td>
                <td>${p.region_id ? `Region #${p.region_id}` : 'Global'}</td>
                <td style="text-align:right;">
                  <button class="btn-tech-sm btn-inspect-product" data-product-id="${p.id}" title="Inspect product metadata and files">
                    INSPECT
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderProductTable = renderProductTable;
}
if (typeof window !== 'undefined') {
  window.renderProductTable = renderProductTable;
}
