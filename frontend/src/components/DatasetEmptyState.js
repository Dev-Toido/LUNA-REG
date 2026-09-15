/**
 * LUNA-REG: DatasetEmptyState Component (Part 6)
 * Handles empty search results, active scanning / loading states, and backend error / retry states
 * 
 * Types:
 * - 'empty': No results match filter criteria -> provides "Clear Filters" button
 * - 'loading': Orbital radar scan indicator
 * - 'error': Failed backend sync -> provides "Retry Sync" button
 * 
 * Design: Zero blue. Lunar dark palette, champagne gold accents.
 */

function renderDatasetEmptyState(options = {}) {
  const {
    type = 'empty',
    title = null,
    message = null,
    actionText = null,
    onAction = null
  } = options;

  if (type === 'loading') {
    return `
      <div class="dataset-state-container loading" id="dataset-loading-state">
        <div class="radar-scan-box">
          <div class="radar-sweep"></div>
          <div class="radar-grid-lines"></div>
          <div class="radar-center-blip"></div>
        </div>
        <div class="dataset-state-title text-gold">${escapeHtmlState(title || 'SCANNING PLANETARY REPOSITORY...')}</div>
        <div class="dataset-state-msg">${escapeHtmlState(message || 'Synchronizing orbital products, geographic bounds, and registration pairs.')}</div>
        <div class="loading-telemetry-pill">QUERY TIMEOUT: 1800ms • NON-BLOCKING HYDRATION</div>
      </div>
    `;
  }

  if (type === 'error') {
    return `
      <div class="dataset-state-container error" id="dataset-error-state">
        <div class="state-icon-circle error">
          <span class="state-symbol">⚠</span>
        </div>
        <div class="dataset-state-title text-gold">${escapeHtmlState(title || 'CATALOG QUERY FAILED')}</div>
        <div class="dataset-state-msg">${escapeHtmlState(message || 'Unable to communicate with the local planetary GIS backend.')}</div>
        <div class="dataset-state-actions">
          <button id="btn-dataset-retry" class="btn-tech-sm btn-gold">
            <span class="action-icon">↻</span> ${escapeHtmlState(actionText || 'RETRY QUERY')}
          </button>
        </div>
      </div>
    `;
  }

  // Default: 'empty'
  return `
    <div class="dataset-state-container empty" id="dataset-empty-state">
      <div class="state-icon-circle">
        <span class="state-symbol">⌕</span>
      </div>
      <div class="dataset-state-title">${escapeHtmlState(title || 'NO MATCHING RECORDS FOUND')}</div>
      <div class="dataset-state-msg">${escapeHtmlState(message || 'No lunar products, pairs, or regions matched your active filter parameters.')}</div>
      <div class="dataset-state-actions">
        <button id="btn-empty-clear-filters" class="btn-tech-sm btn-gold">
          <span class="action-icon">⟲</span> ${escapeHtmlState(actionText || 'CLEAR ALL FILTERS')}
        </button>
      </div>
    </div>
  `;
}

function escapeHtmlState(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderDatasetEmptyState = renderDatasetEmptyState;
}
if (typeof window !== 'undefined') {
  window.renderDatasetEmptyState = renderDatasetEmptyState;
}
