/**
 * LUNA-REG: PairTable Component
 * Tabular layout for canonical lunar image pairs
 * 
 * Columns:
 * - Pair ID
 * - Source Instrument
 * - Reference Instrument
 * - Overlap Status
 * - Overlap Ratio
 * - Verification Method
 * - Region ("Not assigned" if null)
 * - Created At
 * - Actions
 */

function renderPairTable(pairs = [], regionsMap = null) {
  if (!pairs || pairs.length === 0) {
    return typeof renderEmptyState === 'function'
      ? renderEmptyState({ title: 'NO PAIRS FOUND', message: 'No lunar image pairs match the active query.' })
      : '<div class="empty-state">No image pairs found.</div>';
  }

  return `
    <div class="canonical-table-wrapper">
      <table class="canonical-table" id="pairs-table">
        <thead>
          <tr>
            <th>PAIR ID</th>
            <th>SOURCE</th>
            <th>REFERENCE</th>
            <th>OVERLAP STATUS</th>
            <th>OVERLAP RATIO</th>
            <th>VERIFICATION METHOD</th>
            <th>REGION</th>
            <th>CREATED AT</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${pairs.map(p => {
            const ratioStr = (p.overlap_ratio !== null && p.overlap_ratio !== undefined) 
              ? `${(p.overlap_ratio * 100).toFixed(2)}%` 
              : '—';

            const methodStr = p.verification_method || 'Not verified';

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
              <tr data-pair-id="${p.id}">
                <td class="col-mono col-highlight">PAIR #${p.id}</td>
                <td><span class="pair-inst-tag source">${p.source_instrument || '—'}</span></td>
                <td><span class="pair-inst-tag ref">${p.reference_instrument || '—'}</span></td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : overlapStatus}</td>
                <td class="col-mono">${ratioStr}</td>
                <td><span class="verification-method-text">${methodStr}</span></td>
                <td>
                  <span class="${p.region_id ? 'region-tag-assigned' : 'region-tag-unassigned'}">
                    ${regionLabel}
                  </span>
                </td>
                <td class="col-mono" style="font-size:10px;">${createdStr}</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn-tech-sm btn-inspect-pair" data-pair-id="${p.id}" title="Inspect pair metadata and files">
                    INSPECT
                  </button>
                  <button class="btn-tech-sm primary btn-prepare-pair" data-pair-id="${p.id}" title="Load pair into registration workspace" style="margin-left:6px;">
                    PREPARE
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
  exports.renderPairTable = renderPairTable;
}
if (typeof window !== 'undefined') {
  window.renderPairTable = renderPairTable;
}
