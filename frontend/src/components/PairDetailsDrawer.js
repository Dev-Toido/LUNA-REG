/**
 * LUNA-REG: PairDetailsDrawer Component (Part 6)
 * Off-canvas sliding drawer displaying dual-sensor pair coupling, overlap geometry, and direct navigation links
 * 
 * Features:
 * - Pair ID and status overview
 * - Source product telemetry vs. Reference product telemetry
 * - Overlap percentage, overlap geometry coordinates
 * - Verification method and algorithm notes
 * - Quick action buttons:
 *   - "OPEN IN REGISTRATION RESULTS" -> #/results?pair_id=<id>
 *   - "OPEN IN ANALYSIS TOOLS" -> #/analysis-tools?pair_id=<id>
 * 
 * Design: Zero blue. Lunar dark palette, champagne gold accents.
 */

function renderPairDetailsDrawer(options = {}) {
  const {
    pair = null,
    sourceProduct = null,
    referenceProduct = null,
    region = null
  } = options;

  if (!pair) {
    return '';
  }

  const ratioStr = (pair.overlap_ratio !== null && pair.overlap_ratio !== undefined) 
    ? `${(pair.overlap_ratio * 100).toFixed(2)}%` 
    : '—';

  const methodStr = pair.verification_method || 'Geometric Overlap Indexing';
  const overlapStatus = pair.overlap_status || 'UNVERIFIED';
  const createdStr = pair.created_at ? new Date(pair.created_at).toUTCString() : '—';
  const regionName = region ? (region.name || `Region #${region.id}`) : (pair.region_name || 'Not assigned');

  // Source details
  const srcInst = pair.source_instrument || (sourceProduct ? sourceProduct.instrument : '—');
  const srcId = pair.source_product_id || (sourceProduct ? (sourceProduct.product_id || `PROD-${sourceProduct.id}`) : '—');
  const srcRes = sourceProduct ? (sourceProduct.resolution ? `${sourceProduct.resolution} m/px` : '—') : '—';

  // Ref details
  const refInst = pair.reference_instrument || (referenceProduct ? referenceProduct.instrument : '—');
  const refId = pair.reference_product_id || (referenceProduct ? (referenceProduct.product_id || `PROD-${referenceProduct.id}`) : '—');
  const refRes = referenceProduct ? (referenceProduct.resolution ? `${referenceProduct.resolution} m/px` : '—') : '—';

  return `
    <div class="drawer-header">
      <div class="drawer-title-group">
        <span class="drawer-category">REGISTRATION PAIR TELEMETRY</span>
        <h2 class="drawer-title" id="drawer-pair-title">COUPLED PAIR #${pair.id}</h2>
      </div>
      <button class="btn-drawer-close" id="btn-close-pair-drawer" title="Close drawer (Esc)">&times;</button>
    </div>

    <div class="drawer-body">
      <!-- Quick Action Ribbon connecting to Parts 4 & 5 -->
      <div class="drawer-actions-ribbon">
        <a href="#/results?pair_id=${pair.id}" class="btn-drawer-action btn-gold" id="btn-goto-results" title="Open multi-modal registration results for this pair">
          <span class="action-icon">⚲</span>
          <span class="action-text">OPEN IN RESULTS</span>
        </a>
        <a href="#/analysis-tools?pair_id=${pair.id}" class="btn-drawer-action" id="btn-goto-analysis" title="Open interactive analysis workspace for this pair">
          <span class="action-icon">⚙</span>
          <span class="action-text">ANALYSIS TOOLS</span>
        </a>
      </div>

      <!-- Top Summary Card -->
      <div class="drawer-summary-card">
        <div class="summary-item">
          <span class="lbl">OVERLAP STATUS</span>
          <span class="val">${typeof renderStatusBadge === 'function' ? renderStatusBadge(overlapStatus) : overlapStatus}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">OVERLAP RATIO</span>
          <span class="val text-gold">${ratioStr}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">TARGET REGION</span>
          <span class="val">${escapeHtmlPair(regionName)}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">CREATED ON</span>
          <span class="val col-mono" style="font-size:11px;">${createdStr}</span>
        </div>
      </div>

      <!-- Dual Instrument Comparison -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">COUPLED INSTRUMENT ARCHITECTURE</span>
        </div>
        <div class="dual-sensor-compare-grid">
          <!-- Source Column -->
          <div class="sensor-compare-card source-card">
            <div class="sensor-card-tag">SOURCE DATASET (WARP/SLAVE)</div>
            <div class="sensor-name text-gold">${escapeHtmlPair(srcInst)}</div>
            <div class="sensor-attr-row">
              <span class="attr-k">PRODUCT:</span>
              <span class="attr-v col-mono" title="${escapeHtmlPair(srcId)}">${escapeHtmlPair(srcId)}</span>
            </div>
            <div class="sensor-attr-row">
              <span class="attr-k">GSD:</span>
              <span class="attr-v col-mono">${srcRes}</span>
            </div>
          </div>

          <!-- Reference Column -->
          <div class="sensor-compare-card ref-card">
            <div class="sensor-card-tag">REFERENCE DATASET (FIXED/MASTER)</div>
            <div class="sensor-name text-gold">${escapeHtmlPair(refInst)}</div>
            <div class="sensor-attr-row">
              <span class="attr-k">PRODUCT:</span>
              <span class="attr-v col-mono" title="${escapeHtmlPair(refId)}">${escapeHtmlPair(refId)}</span>
            </div>
            <div class="sensor-attr-row">
              <span class="attr-k">GSD:</span>
              <span class="attr-v col-mono">${refRes}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Verification and Geometry -->
      <div class="drawer-section">
        <div class="section-title-bar">
          <span class="title-text">VERIFICATION & GEOMETRIC COUPLING</span>
        </div>
        <div class="drawer-grid-2col">
          <div class="grid-item">
            <span class="g-lbl">VERIFICATION METHOD</span>
            <span class="g-val">${escapeHtmlPair(methodStr)}</span>
          </div>
          <div class="grid-item">
            <span class="g-lbl">ESTIMATED GSD RATIO</span>
            <span class="g-val col-mono">${pair.resolution_ratio ? `${Number(pair.resolution_ratio).toFixed(2)}x` : '—'}</span>
          </div>
          <div class="grid-item full-width">
            <span class="g-lbl">OVERLAP GEOMETRY / COUPLING NOTES</span>
            <span class="g-val">${escapeHtmlPair(pair.notes || pair.description || 'Pre-computed spatial intersection verified via SPICE ephemeris and planetary bounding boxes.')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="drawer-footer">
      <button class="btn-tech-sm" id="btn-drawer-pair-close-footer">CLOSE INSPECTION</button>
      <span class="footer-note">PAIR TELEMETRY • LUNA-REG CORE</span>
    </div>
  `;
}

function escapeHtmlPair(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderPairDetailsDrawer = renderPairDetailsDrawer;
}
if (typeof window !== 'undefined') {
  window.renderPairDetailsDrawer = renderPairDetailsDrawer;
}
