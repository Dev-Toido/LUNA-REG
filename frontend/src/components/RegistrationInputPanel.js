/**
 * LUNA-REG: RegistrationInputPanel Component
 * Renders source and reference product metadata from /api/v1/pairs/{id}/registration-input
 * in the New Registration workspace
 */

function renderRegistrationInputPanel(regInput) {
  if (!regInput) return '';

  const pair = regInput.pair || {};
  const source = regInput.source || {};
  const reference = regInput.reference || {};
  const srcProd = source.product || {};
  const refProd = reference.product || {};
  const srcFiles = source.files || [];
  const refFiles = reference.files || [];

  return `
    <div class="registration-input-panel" id="reg-input-panel">
      <div class="reg-input-panel-header">
        <div class="reg-input-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          <span>CANONICAL PAIR STAGED FOR REGISTRATION: PAIR #${pair.id || '—'}</span>
        </div>
        <div class="reg-input-panel-status">
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(pair.overlap_status || 'VERIFIED') : ''}
          <button class="btn-tech-sm" id="btn-clear-staged-pair" title="Unlink staged pair and revert to local upload">
            DISMISS
          </button>
        </div>
      </div>

      <div class="reg-input-grid">
        <!-- Reference Product Card -->
        <div class="reg-product-box ref">
          <div class="reg-product-header">
            <span class="reg-box-badge ref">REFERENCE IMAGE (BASE)</span>
            <span class="reg-inst-tag">${pair.reference_instrument || refProd.instrument || 'REFERENCE'}</span>
          </div>
          <div class="reg-product-body">
            <div class="reg-prod-title" title="${refProd.product_id || ''}">${refProd.product_id || 'Reference Product'}</div>
            <div class="reg-prod-meta-grid">
              <div><span class="meta-lbl">Mission:</span> <span>${refProd.mission || 'Chandrayaan-2'}</span></div>
              <div><span class="meta-lbl">Level:</span> <span>${refProd.processing_level || 'Calibrated'}</span></div>
              <div><span class="meta-lbl">Resolution:</span> <span>${refProd.resolution_m_per_px ? `${refProd.resolution_m_per_px} m/px` : '—'}</span></div>
              <div><span class="meta-lbl">Files:</span> <span>${refFiles.length} file(s) available</span></div>
            </div>
          </div>
        </div>

        <!-- Source / Target Product Card -->
        <div class="reg-product-box src">
          <div class="reg-product-header">
            <span class="reg-box-badge src">TARGET IMAGE (TO ALIGN)</span>
            <span class="reg-inst-tag">${pair.source_instrument || srcProd.instrument || 'SOURCE'}</span>
          </div>
          <div class="reg-product-body">
            <div class="reg-prod-title" title="${srcProd.product_id || ''}">${srcProd.product_id || 'Source Product'}</div>
            <div class="reg-prod-meta-grid">
              <div><span class="meta-lbl">Mission:</span> <span>${srcProd.mission || 'Chandrayaan-2'}</span></div>
              <div><span class="meta-lbl">Level:</span> <span>${srcProd.processing_level || 'Calibrated'}</span></div>
              <div><span class="meta-lbl">Resolution:</span> <span>${srcProd.resolution_m_per_px ? `${srcProd.resolution_m_per_px} m/px` : '—'}</span></div>
              <div><span class="meta-lbl">Files:</span> <span>${srcFiles.length} file(s) available</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="reg-pipeline-notice">
        <div class="notice-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </div>
        <div class="notice-text">
          Canonical pair metadata loaded from SQLite catalog via <code>/api/v1/pairs/${pair.id}/registration-input</code>.
          Overlap ratio: <strong>${pair.overlap_ratio !== null && pair.overlap_ratio !== undefined ? `${(pair.overlap_ratio * 100).toFixed(2)}%` : 'Calculated'}</strong>. Ready for pipeline staging.
        </div>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderRegistrationInputPanel = renderRegistrationInputPanel;
}
if (typeof window !== 'undefined') {
  window.renderRegistrationInputPanel = renderRegistrationInputPanel;
}
