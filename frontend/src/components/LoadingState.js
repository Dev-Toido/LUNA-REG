/**
 * LUNA-REG: LoadingState Component
 * Displays champagne-gold lunar spinner
 */

function renderLoadingState(text = 'QUERYING LUNAR CATALOG...') {
  return `<div class="canonical-loading-state">
    <div class="canonical-spinner"></div>
    <div class="loading-state-text">${text}</div>
  </div>`;
}

if (typeof exports !== 'undefined') {
  exports.renderLoadingState = renderLoadingState;
}
if (typeof window !== 'undefined') {
  window.renderLoadingState = renderLoadingState;
}
