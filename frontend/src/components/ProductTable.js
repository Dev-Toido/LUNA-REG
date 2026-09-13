/**
 * LUNA-REG: ProductTable Component
 * High-density tabular view for canonical lunar products
 * 
 * Fields:
 * - Product ID
 * - Instrument
 * - Mission
 * - Product Type
 * - Acquisition Time
 * - Resolution
 * - Calibration Status
 * - Region ("Not assigned" if null)
 * - Actions
 */

function renderProductTable(products = [], regionsMap = null) {
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
            <th>PRODUCT ID</th>
            <th>INSTRUMENT</th>
            <th>MISSION</th>
            <th>TYPE</th>
            <th>ACQUISITION TIME</th>
            <th>RESOLUTION</th>
            <th>CALIBRATION STATUS</th>
            <th>REGION</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(p => {
            const rawTime = p.acquisition_time || p.start_time;
            const timeStr = rawTime 
              ? new Date(rawTime).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
              : '—';

            const resVal = p.resolution !== undefined && p.resolution !== null 
              ? p.resolution 
              : p.resolution_m_per_px;
            const resStr = (resVal !== undefined && resVal !== null) ? `${resVal} m/px` : '—';

            let regionLabel = 'Not assigned';
            if (p.region_id !== null && p.region_id !== undefined && p.region_id !== '') {
              if (regionsMap && regionsMap[String(p.region_id)]) {
                const reg = regionsMap[String(p.region_id)];
                regionLabel = reg.name || `Region #${reg.id}`;
              } else if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
                regionLabel = window.regionService.formatRegionName(p.region_id);
              } else {
                regionLabel = `Region #${p.region_id}`;
              }
            }

            const calibStatus = p.calibration_status || p.processing_level || 'Calibrated';
            const prodType = p.product_type || 'IMG';

            return `
              <tr data-product-id="${p.id}">
                <td class="col-highlight" title="${p.product_id || ''}">${p.product_id || `PROD-${p.id}`}</td>
                <td><span class="product-inst-tag">${p.instrument || '—'}</span></td>
                <td>${p.mission || 'Chandrayaan-2'}</td>
                <td><span class="product-type-pill">${prodType}</span></td>
                <td class="col-mono">${timeStr}</td>
                <td class="col-mono">${resStr}</td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(calibStatus) : calibStatus}</td>
                <td>
                  <span class="${p.region_id ? 'region-tag-assigned' : 'region-tag-unassigned'}">
                    ${regionLabel}
                  </span>
                </td>
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
