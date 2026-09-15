/**
 * LUNA-REG: EmptyState Component
 * Standardized empty data placeholder with lunar GIS styling
 */

function renderEmptyState(options = {}) {
  const title = options.title || 'NO RECORDS FOUND';
  const message = options.message || 'No lunar products or image pairs match the active query.';
  const actionText = options.actionText || null;
  const actionId = options.actionId || '';

  return `<div class="canonical-empty-state">
    <div class="empty-state-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-desc">${message}</div>
    ${actionText ? `<button class="btn-tech empty-action-btn" id="${actionId}">${actionText}</button>` : ''}
  </div>`;
}

if (typeof exports !== 'undefined') {
  exports.renderEmptyState = renderEmptyState;
}
if (typeof window !== 'undefined') {
  window.renderEmptyState = renderEmptyState;
}
