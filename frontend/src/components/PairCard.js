/**
 * LUNA-REG: PairCard Component
 * Displays individual canonical lunar image pair card
 */

function renderPairCard(pair) {
  if (!pair) return '';

  const id = pair.id;
  const srcInst = pair.source_instrument || 'SOURCE';
  const refInst = pair.reference_instrument || 'REFERENCE';
  const overlapStatus = pair.overlap_status || 'UNVERIFIED';
  const ratio = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined) 
    ? `${(pair.overlap_ratio * 100).toFixed(1)}%` 
    : 'Not calculated';
  const area = (pair.overlap_area !== null && pair.overlap_area !== undefined)
    ? `${pair.overlap_area.toFixed(2)} km²`
    : 'Not calculated';
  const method = pair.verification_method || 'Geometric / Automated';

  return `
    <div class="dataset-card canonical-pair-card" data-pair-id="${id}" id="pair-card-${id}">
      <div class="dataset-card-header">
        <span class="pair-card-id-badge">PAIR #${id}</span>
        <span>${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : overlapStatus}</span>
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
          <span>Overlap Area:</span>
          <span>${area}</span>
        </div>
        <div class="dataset-meta-row">
          <span>Verification:</span>
          <span>${method}</span>
        </div>
      </div>

      <div class="pair-card-actions-grid">
        <button class="btn-tech btn-inspect-pair" data-pair-id="${id}" title="Inspect pair telemetry and files">
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
