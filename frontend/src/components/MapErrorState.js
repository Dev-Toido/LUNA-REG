/**
 * LUNA-REG: MapErrorState Component (Part 7)
 * Mission control error state with interactive backend retry action
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, muted crimson/amber, champagne gold.
 */

function renderMapErrorState(options = {}) {
  const {
    title = 'GIS ARCHIVE QUERY FAILED',
    message = 'Unable to establish connection with backend REST APIs (/regions, /products, /pairs).',
    actionText = 'RETRY CONNECTION'
  } = options;

  return `
    <div class="map-state-overlay error" id="map-state-overlay">
      <div class="map-state-card error-card">
        <div class="error-icon-box">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h4 class="state-card-title text-gold">${title}</h4>
        <p class="state-card-desc">${message}</p>
        <button type="button" class="btn-tech primary" id="btn-retry-map-sync">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>${actionText}</span>
        </button>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMapErrorState = renderMapErrorState;
}
if (typeof window !== 'undefined') {
  window.renderMapErrorState = renderMapErrorState;
}
