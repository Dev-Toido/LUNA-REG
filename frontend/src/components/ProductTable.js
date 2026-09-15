/**
 * LUNA-REG: ProductTable Component (Part 6 Upgraded)
 * High-density tabular view for canonical lunar products with sorting, drawers, and pagination support
 * 
 * Supports both:
 * - Legacy call: renderProductTable(products, regionsMap)
 * - Modern call: renderProductTable({ products, regionsMap, sortBy, sortOrder, pagination })
 * 
 * Fields:
 * - Product ID (sortable)
 * - Instrument (sortable)
 * - Mission
 * - Product Type
 * - Acquisition Time (sortable)
 * - Resolution (sortable)
 * - Calibration Status (sortable)
 * - Region ("Not assigned" if null)
 * - Actions (INSPECT)
 */

function renderProductTable(arg1 = [], arg2 = null) {
  let products = [];
  let regionsMap = null;
  let sortBy = 'acquisition_time';
  let sortOrder = 'desc';
  let pagination = null;

  if (Array.isArray(arg1)) {
    products = arg1;
    regionsMap = arg2;
  } else if (arg1 && typeof arg1 === 'object') {
    products = arg1.products || [];
    regionsMap = arg1.regionsMap || null;
    sortBy = arg1.sortBy || 'acquisition_time';
    sortOrder = arg1.sortOrder || 'desc';
    pagination = arg1.pagination || null;
  }

  if (!products || products.length === 0) {
    if (typeof renderDatasetEmptyState === 'function') {
      return renderDatasetEmptyState({
        type: 'empty',
        title: 'NO PRODUCTS FOUND',
        message: 'No lunar products match the active search and filter criteria.'
      });
    }
    return typeof renderEmptyState === 'function' 
      ? renderEmptyState({ title: 'NO PRODUCTS FOUND', message: 'No lunar products match the selected criteria.' })
      : '<div class="empty-state">No products found.</div>';
  }

  const renderSortIndicator = (colKey) => {
    if (sortBy !== colKey) return '<span class="sort-icon-inactive">↕</span>';
    return sortOrder === 'asc' ? '<span class="sort-icon-active">▲</span>' : '<span class="sort-icon-active">▼</span>';
  };

  return `
    <div class="canonical-table-wrapper">
      <table class="canonical-table" id="products-table">
        <thead>
          <tr>
            <th class="sortable-th" data-sort-key="id">
              <span class="th-content">PRODUCT ID ${renderSortIndicator('id')}</span>
            </th>
            <th class="sortable-th" data-sort-key="instrument">
              <span class="th-content">INSTRUMENT ${renderSortIndicator('instrument')}</span>
            </th>
            <th>MISSION</th>
            <th>TYPE</th>
            <th class="sortable-th" data-sort-key="acquisition_time">
              <span class="th-content">ACQUISITION TIME ${renderSortIndicator('acquisition_time')}</span>
            </th>
            <th class="sortable-th" data-sort-key="resolution">
              <span class="th-content">RESOLUTION ${renderSortIndicator('resolution')}</span>
            </th>
            <th class="sortable-th" data-sort-key="status">
              <span class="th-content">CALIBRATION STATUS ${renderSortIndicator('status')}</span>
            </th>
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
              <tr data-product-id="${p.id}" class="table-row-interactive">
                <td class="col-highlight" title="${p.product_id || ''}">
                  <span class="prod-code">${p.product_id || `PROD-${p.id}`}</span>
                </td>
                <td><span class="product-inst-tag">${p.instrument || '—'}</span></td>
                <td>${p.mission || 'Chandrayaan-2'}</td>
                <td><span class="product-type-pill">${prodType}</span></td>
                <td class="col-mono">${timeStr}</td>
                <td class="col-mono text-gold">${resStr}</td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(calibStatus) : calibStatus}</td>
                <td>
                  <span class="${p.region_id ? 'region-tag-assigned' : 'region-tag-unassigned'}">
                    ${regionLabel}
                  </span>
                </td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn-tech-sm btn-inspect-product" data-product-id="${p.id}" title="Inspect product metadata, footprint and files">
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
