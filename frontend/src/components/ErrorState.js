/**
 * LUNA-REG: ErrorState Component
 * Displays actionable API and network diagnostic errors
 */

function renderErrorState(options = {}) {
  const title = options.title || 'CATALOG QUERY ERROR';
  const message = options.message || 'Unable to communicate with the LUNA-REG backend API.';
  const details = options.details || null;
  const retryBtnId = options.retryBtnId || 'btn-retry-query';

  return `<div class="canonical-error-state">
    <div class="error-state-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="error-state-title">${title}</div>
    <div class="error-state-desc">${message}</div>
    ${details ? `<div class="error-state-details"><code>${details}</code></div>` : ''}
    <div class="error-state-actions">
      <button class="btn-tech primary" id="${retryBtnId}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        <span>RETRY REQUEST</span>
      </button>
    </div>
  </div>`;
}

if (typeof exports !== 'undefined') {
  exports.renderErrorState = renderErrorState;
}
if (typeof window !== 'undefined') {
  window.renderErrorState = renderErrorState;
}
