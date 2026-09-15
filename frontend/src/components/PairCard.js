/**
 * LUNA-REG: PairCard Component
 * Displays individual canonical lunar image pair card
 * 
 * Fields:
 * - Pair ID
 * - Source Instrument
 * - Reference Instrument
 * - Overlap Status (neutral/warning badge for UNVERIFIED)
 * - Overlap Ratio
 * - Verification Method
 * - Region ("Not assigned" if null)
 * - Created At
 */

function renderPairCard(pair, regionsMap = null) {
  if (!pair) return '';

  const id = pair.id;
  const srcInst = pair.source_instrument || 'SOURCE';
  const refInst = pair.reference_instrument || 'REFERENCE';
  const overlapStatus = pair.overlap_status || 'UNVERIFIED';

  const ratio = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined) 
    ? `${(pair.overlap_ratio * 100).toFixed(2)}%` 
    : 'Not available';
  
  const method = pair.verification_method || 'Not verified';

  let regionLabel = 'Not assigned';
  if (pair.region_id !== null && pair.region_id !== undefined && pair.region_id !== '') {
    if (regionsMap && regionsMap[String(pair.region_id)]) {
      const reg = regionsMap[String(pair.region_id)];
      regionLabel = reg.name || `Region #${reg.id}`;
    } else if (window.regionService && typeof window.regionService.formatRegionName === 'function') {
      regionLabel = window.regionService.formatRegionName(pair.region_id);
    } else {
      regionLabel = `Region #${pair.region_id}`;
    }
  }

  const createdStr = pair.created_at ? new Date(pair.created_at).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
  }) + ' UTC' : 'Not available';

  return `
    <div class="dataset-card canonical-pair-card" data-pair-id="${id}" id="pair-card-${id}">
      <div class="dataset-card-header">
        <span class="pair-card-id-badge">PAIR #${id}</span>
        <span>${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : `<span class="canonical-badge">${overlapStatus}</span>`}</span>
      </div>

      <div class="pair-instruments-row">
        <span class="pair-inst-tag source">${srcInst}</span>
        <span class="pair-inst-arrow">↔</span>
        <span class="pair-inst-tag ref">${refInst}</span>
      </div>

      <div class="dataset-meta-list">
        <div class="dataset-meta-row">
          <span>Overlap Ratio:</span>
          <strong>${ratio}</strong>
        </div>
        <div class="dataset-meta-row">
          <span>Verification:</span>
          <span>${method}</span>
        </div>
        <div class="dataset-meta-row">
          <span>Region:</span>
          <span class="${pair.region_id ? 'region-assigned' : 'region-unassigned'}">${regionLabel}</span>
        </div>
        <div class="dataset-meta-row">
          <span>Created:</span>
          <span class="col-mono" style="font-size:10px;">${createdStr}</span>
        </div>
      </div>

      <div class="pair-card-actions-grid">
        <button class="btn-tech btn-inspect-pair" data-pair-id="${id}" title="Inspect pair metadata and files">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>INSPECT DETAILS</span>
        </button>
        <button class="btn-tech primary btn-prepare-pair" data-pair-id="${id}" title="Load pair into registration preparation workspace">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>PREPARE PAIR</span>
        </button>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderPairCard = renderPairCard;
}
if (typeof window !== 'undefined') {
  window.renderPairCard = renderPairCard;
}
