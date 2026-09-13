/**
 * LUNA-REG: RegionTable Component (Part 6)
 * High-density lunar target region tabular ledger
 * 
 * Columns:
 * - Region ID
 * - Region Name
 * - Feature Classification
 * - Center Coordinates (Lat / Lon)
 * - Geodetic Extents [Lat min..max, Lon min..max]
 * - Linked Products Count
 * - Actions (Inspect Drawer)
 * 
 * Design: Zero blue. Champagne gold accents, lunar dark palette.
 */

function renderRegionTable(options = {}) {
  const {
    regions = [],
    products = [],
    sortBy = 'id',
    sortOrder = 'asc',
    pagination = { page: 1, pageSize: 10, total: 0 }
  } = options;

  if (!regions || regions.length === 0) {
    return typeof renderDatasetEmptyState === 'function'
      ? renderDatasetEmptyState({ 
          type: 'empty', 
          title: 'NO LUNAR REGIONS FOUND', 
          message: 'No geographic regions match the active filter criteria.' 
        })
      : '<div class="empty-state">No regions found.</div>';
  }

  // Count products per region
  const productCountMap = {};
  if (Array.isArray(products)) {
    products.forEach(p => {
      if (p.region_id !== null && p.region_id !== undefined) {
        const k = String(p.region_id);
        productCountMap[k] = (productCountMap[k] || 0) + 1;
      }
    });
  }

  return `
    <div class="canonical-table-wrapper">
      <table class="canonical-table" id="regions-table">
        <thead>
          <tr>
            <th class="sortable-col" data-sort-key="id">
              REGION ID ${sortBy === 'id' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th class="sortable-col" data-sort-key="name">
              REGION NAME ${sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th>FEATURE CLASSIFICATION</th>
            <th>CENTER LATITUDE</th>
            <th>CENTER LONGITUDE</th>
            <th>GEODETIC BOUNDS</th>
            <th>LINKED PRODUCTS</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${regions.map(r => {
            const latStr = (r.center_latitude !== null && r.center_latitude !== undefined) 
              ? `${Number(r.center_latitude).toFixed(4)}°` 
              : '—';
            const lonStr = (r.center_longitude !== null && r.center_longitude !== undefined) 
              ? `${Number(r.center_longitude).toFixed(4)}°` 
              : '—';

            let boundsStr = '—';
            if (r.min_latitude !== undefined && r.max_latitude !== undefined && r.min_longitude !== undefined && r.max_longitude !== undefined) {
              boundsStr = `[${Number(r.min_latitude).toFixed(2)}°..${Number(r.max_latitude).toFixed(2)}°, ${Number(r.min_longitude).toFixed(2)}°..${Number(r.max_longitude).toFixed(2)}°]`;
            } else if (r.bounding_box) {
              boundsStr = typeof r.bounding_box === 'string' ? r.bounding_box : JSON.stringify(r.bounding_box);
            }

            const pCount = productCountMap[String(r.id)] || r.products_count || 0;
            const featureType = r.feature_type || r.classification || 'Lunar Surface Feature';

            return `
              <tr data-region-id="${r.id}">
                <td class="col-mono col-highlight">REG-#${r.id}</td>
                <td>
                  <span class="region-title-cell">${escapeHtmlRegion(r.name || `Region #${r.id}`)}</span>
                </td>
                <td>
                  <span class="region-feature-tag">${escapeHtmlRegion(featureType)}</span>
                </td>
                <td class="col-mono">${latStr}</td>
                <td class="col-mono">${lonStr}</td>
                <td class="col-mono col-bounds" title="${escapeHtmlRegion(boundsStr)}">${escapeHtmlRegion(boundsStr)}</td>
                <td>
                  <span class="badge-count-pill">${pCount} ${pCount === 1 ? 'PRODUCT' : 'PRODUCTS'}</span>
                </td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn-tech-sm btn-inspect-region" data-region-id="${r.id}" title="Inspect region geographic bounds and metadata">
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

function escapeHtmlRegion(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderRegionTable = renderRegionTable;
}
if (typeof window !== 'undefined') {
  window.renderRegionTable = renderRegionTable;
}
