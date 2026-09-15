/**
 * LUNA-REG: PairTable Component (Part 6 Upgraded)
 * Tabular layout for canonical lunar image pairs with sorting, drawer integration, and direct workflow links
 * 
 * Supports both:
 * - Legacy call: renderPairTable(pairs, regionsMap)
 * - Modern call: renderPairTable({ pairs, regionsMap, sortBy, sortOrder, pagination })
 * 
 * Columns:
 * - Pair ID (sortable)
 * - Source Instrument (sortable)
 * - Reference Instrument (sortable)
 * - Overlap Status (sortable)
 * - Overlap Ratio
 * - Verification Method
 * - Region ("Not assigned" if null)
 * - Created At (sortable)
 * - Actions (INSPECT, RESULTS, ANALYZE)
 */

function renderPairTable(arg1 = [], arg2 = null) {
  let pairs = [];
  let regionsMap = null;
  let sortBy = 'id';
  let sortOrder = 'asc';
  let pagination = null;

  if (Array.isArray(arg1)) {
    pairs = arg1;
    regionsMap = arg2;
  } else if (arg1 && typeof arg1 === 'object') {
    pairs = arg1.pairs || [];
    regionsMap = arg1.regionsMap || null;
    sortBy = arg1.sortBy || 'id';
    sortOrder = arg1.sortOrder || 'asc';
    pagination = arg1.pagination || null;
  }

  if (!pairs || pairs.length === 0) {
    if (typeof renderDatasetEmptyState === 'function') {
      return renderDatasetEmptyState({
        type: 'empty',
        title: 'NO PAIRS FOUND',
        message: 'No registration pairs match the active search and filter criteria.'
      });
    }
    return typeof renderEmptyState === 'function'
      ? renderEmptyState({ title: 'NO PAIRS FOUND', message: 'No lunar image pairs match the active query.' })
      : '<div class="empty-state">No image pairs found.</div>';
  }

  const renderSortIndicator = (colKey) => {
    if (sortBy !== colKey) return '<span class="sort-icon-inactive">↕</span>';
    return sortOrder === 'asc' ? '<span class="sort-icon-active">▲</span>' : '<span class="sort-icon-active">▼</span>';
  };

  return `
    <div class="canonical-table-wrapper">
      <table class="canonical-table" id="pairs-table">
        <thead>
          <tr>
            <th class="sortable-th" data-sort-key="id">
              <span class="th-content">PAIR ID ${renderSortIndicator('id')}</span>
            </th>
            <th class="sortable-th" data-sort-key="source_instrument">
              <span class="th-content">SOURCE ${renderSortIndicator('source_instrument')}</span>
            </th>
            <th class="sortable-th" data-sort-key="reference_instrument">
              <span class="th-content">REFERENCE ${renderSortIndicator('reference_instrument')}</span>
            </th>
            <th class="sortable-th" data-sort-key="status">
              <span class="th-content">OVERLAP STATUS ${renderSortIndicator('status')}</span>
            </th>
            <th>OVERLAP RATIO</th>
            <th>VERIFICATION METHOD</th>
            <th>REGION</th>
            <th class="sortable-th" data-sort-key="created_at">
              <span class="th-content">CREATED AT ${renderSortIndicator('created_at')}</span>
            </th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${pairs.map(p => {
            const ratioStr = (p.overlap_ratio !== null && p.overlap_ratio !== undefined) 
              ? `${(p.overlap_ratio * 100).toFixed(2)}%` 
              : '—';

            const methodStr = p.verification_method || 'Geometric Overlap';

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

            const createdStr = p.created_at ? new Date(p.created_at).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
            const overlapStatus = p.overlap_status || 'UNVERIFIED';

            return `
              <tr data-pair-id="${p.id}" class="table-row-interactive">
                <td class="col-mono col-highlight">PAIR #${p.id}</td>
                <td><span class="pair-inst-tag source">${p.source_instrument || '—'}</span></td>
                <td><span class="pair-inst-tag ref">${p.reference_instrument || '—'}</span></td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : overlapStatus}</td>
                <td class="col-mono text-gold">${ratioStr}</td>
                <td><span class="verification-method-text">${methodStr}</span></td>
                <td>
                  <span class="${p.region_id ? 'region-tag-assigned' : 'region-tag-unassigned'}">
                    ${regionLabel}
                  </span>
                </td>
                <td class="col-mono" style="font-size:11px;">${createdStr}</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn-tech-sm btn-inspect-pair" data-pair-id="${p.id}" title="Inspect pair metadata and coupling details">
                    INSPECT
                  </button>
                  <a href="#/results?pair_id=${p.id}" class="btn-tech-sm btn-action-link" title="Open registration results">
                    RESULTS
                  </a>
                  <a href="#/analysis-tools?pair_id=${p.id}" class="btn-tech-sm primary btn-action-link" title="Open interactive analysis workspace" style="margin-left:4px;">
                    ANALYZE
                  </a>
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
  exports.renderPairTable = renderPairTable;
}
if (typeof window !== 'undefined') {
  window.renderPairTable = renderPairTable;
}
