/**
 * LUNA-REG: PairTable Component
 * Tabular layout for canonical lunar image pairs
 */

function renderPairTable(pairs = []) {
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
            <th>SOURCE INSTRUMENT</th>
            <th>REF INSTRUMENT</th>
            <th>OVERLAP STATUS</th>
            <th>OVERLAP RATIO</th>
            <th>OVERLAP AREA</th>
            <th>REGION</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${pairs.map(p => {
            const ratioStr = (p.overlap_ratio !== null && p.overlap_ratio !== undefined) 
              ? `${(p.overlap_ratio * 100).toFixed(1)}%` 
              : '—';
            const areaStr = (p.overlap_area !== null && p.overlap_area !== undefined) 
              ? `${p.overlap_area.toFixed(2)} km²` 
              : '—';
            return `
              <tr data-pair-id="${p.id}">
                <td class="col-mono col-highlight">PAIR #${p.id}</td>
                <td><span class="pair-inst-tag source">${p.source_instrument || '—'}</span></td>
                <td><span class="pair-inst-tag ref">${p.reference_instrument || '—'}</span></td>
                <td>${typeof renderStatusBadge === 'function' ? renderStatusBadge(p.overlap_status || 'UNVERIFIED') : (p.overlap_status || '—')}</td>
                <td class="col-mono">${ratioStr}</td>
                <td class="col-mono">${areaStr}</td>
                <td>${p.region_id ? `Region #${p.region_id}` : 'Global'}</td>
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
