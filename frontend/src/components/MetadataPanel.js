/**
 * LUNA-REG: MetadataPanel Component
 * Deep scientific inspection modal/drawer for products and pairs
 */

function renderMetadataPanel(data, type = 'pair') {
  if (!data) return '<div class="empty-state">No metadata available.</div>';

  if (type === 'pair') {
    return renderPairMetadataPanel(data);
  } else {
    return renderProductMetadataPanel(data);
  }
}

function renderPairMetadataPanel(data) {
  const pair = data.pair || data;
  const source = data.source || {};
  const reference = data.reference || {};
  const sourceProd = source.product || {};
  const refProd = reference.product || {};
  const sourceFiles = source.files || [];
  const refFiles = reference.files || [];

  return `
    <div class="canonical-metadata-panel">
      <!-- Pair Summary Section -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">CANONICAL PAIR TELEMETRY</span>
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(pair.overlap_status) : ''}
        </div>
        <div class="meta-grid-2">
          <div class="meta-field-item">
            <span class="meta-field-label">PAIR IDENTIFIER</span>
            <span class="meta-field-val highlight">PAIR #${pair.id}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP STATUS</span>
            <span class="meta-field-val">${pair.overlap_status || 'UNVERIFIED'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP RATIO</span>
            <span class="meta-field-val">${pair.overlap_ratio !== null && pair.overlap_ratio !== undefined ? `${(pair.overlap_ratio * 100).toFixed(2)}%` : '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">OVERLAP AREA</span>
            <span class="meta-field-val">${pair.overlap_area !== null && pair.overlap_area !== undefined ? `${pair.overlap_area.toFixed(4)} km²` : '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">SOURCE PRODUCT ID</span>
            <span class="meta-field-val">${pair.source_product_id ? `#${pair.source_product_id}` : '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">REFERENCE PRODUCT ID</span>
            <span class="meta-field-val">${pair.reference_product_id ? `#${pair.reference_product_id}` : '—'}</span>
          </div>
        </div>
      </div>

      <!-- Source & Reference Products Comparison -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">MULTI-MODAL INSTRUMENT PAIRING</span>
        </div>
        <div class="meta-side-by-side">
          <!-- Source Column -->
          <div class="meta-col">
            <div class="meta-col-title source">
              <span>SOURCE IMAGE</span>
              <span class="meta-tag source">${pair.source_instrument || sourceProd.instrument || 'SOURCE'}</span>
            </div>
            <div class="meta-list-compact">
              <div class="meta-compact-row">
                <span>Product ID:</span>
                <strong>${sourceProd.product_id || `#${pair.source_product_id}`}</strong>
              </div>
              <div class="meta-compact-row">
                <span>Mission:</span>
                <span>${sourceProd.mission || 'Chandrayaan-2'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Resolution:</span>
                <span>${sourceProd.resolution_m_per_px ? `${sourceProd.resolution_m_per_px} m/px` : '—'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Files Available:</span>
                <span>${sourceFiles.length} files</span>
              </div>
            </div>
          </div>

          <!-- Reference Column -->
          <div class="meta-col">
            <div class="meta-col-title ref">
              <span>REFERENCE IMAGE</span>
              <span class="meta-tag ref">${pair.reference_instrument || refProd.instrument || 'REFERENCE'}</span>
            </div>
            <div class="meta-list-compact">
              <div class="meta-compact-row">
                <span>Product ID:</span>
                <strong>${refProd.product_id || `#${pair.reference_product_id}`}</strong>
              </div>
              <div class="meta-compact-row">
                <span>Mission:</span>
                <span>${refProd.mission || 'Chandrayaan-2'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Resolution:</span>
                <span>${refProd.resolution_m_per_px ? `${refProd.resolution_m_per_px} m/px` : '—'}</span>
              </div>
              <div class="meta-compact-row">
                <span>Files Available:</span>
                <span>${refFiles.length} files</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="meta-footer-actions">
        <button class="btn-tech primary" id="btn-modal-prepare-pair" data-pair-id="${pair.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>LOAD INTO REGISTRATION WORKSPACE</span>
        </button>
      </div>
    </div>
  `;
}

function renderProductMetadataPanel(data) {
  const product = data.product || data;
  const files = data.files || [];

  return `
    <div class="canonical-metadata-panel">
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">LUNAR PRODUCT METADATA</span>
          ${typeof renderStatusBadge === 'function' ? renderStatusBadge(product.processing_level || 'Calibrated') : ''}
        </div>
        <div class="meta-grid-2">
          <div class="meta-field-item">
            <span class="meta-field-label">INTERNAL DATABASE ID</span>
            <span class="meta-field-val highlight">#${product.id}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">CANONICAL PRODUCT ID</span>
            <span class="meta-field-val">${product.product_id || '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">MISSION</span>
            <span class="meta-field-val">${product.mission || 'Chandrayaan-2'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">INSTRUMENT</span>
            <span class="meta-field-val">${product.instrument || '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">SPATIAL RESOLUTION</span>
            <span class="meta-field-val">${product.resolution_m_per_px ? `${product.resolution_m_per_px} m/px` : '—'}</span>
          </div>
          <div class="meta-field-item">
            <span class="meta-field-label">REGION</span>
            <span class="meta-field-val">${product.region_id ? `Region #${product.region_id}` : 'Global'}</span>
          </div>
        </div>
      </div>

      <!-- Associated Files -->
      <div class="meta-section">
        <div class="meta-section-header">
          <span class="meta-section-title">ASSOCIATED PRODUCT FILES (${files.length})</span>
        </div>
        ${files.length === 0 ? '<div class="empty-files-hint">No raw image files registered for this product in catalog.</div>' : `
          <div class="meta-files-list">
            ${files.map(f => `
              <div class="meta-file-item">
                <div class="meta-file-info">
                  <span class="meta-file-name">${f.file_name || f.file_path || 'Unnamed file'}</span>
                  <span class="meta-file-type">${f.file_type || 'IMG'} • ${f.file_size_bytes ? `${(f.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}</span>
                </div>
                <div class="meta-file-role">
                  <span class="canonical-badge status-neutral">${f.role || 'PRIMARY'}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMetadataPanel = renderMetadataPanel;
}
if (typeof window !== 'undefined') {
  window.renderMetadataPanel = renderMetadataPanel;
}
