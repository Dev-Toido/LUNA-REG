/**
 * LUNA-REG: MapEmptyState Component (Part 7)
 * High-tech radar sweep loading indicator and empty GIS layer notifications
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, lunar grey, champagne gold.
 */

function renderMapEmptyState(options = {}) {
  const {
    type = 'loading', // 'loading' | 'empty'
    title = 'SYNCHRONIZING LUNAR GIS...',
    message = 'Streaming geodetic footprints and telemetry from canonical catalog.'
  } = options;

  if (type === 'loading') {
    return `
      <div class="map-state-overlay loading" id="map-state-overlay">
        <div class="map-radar-card">
          <div class="radar-scope">
            <div class="radar-sweep"></div>
            <div class="radar-crosshair-h"></div>
            <div class="radar-crosshair-v"></div>
            <div class="radar-circle-1"></div>
            <div class="radar-circle-2"></div>
            <div class="radar-blip blip-1"></div>
            <div class="radar-blip blip-2"></div>
          </div>
          <div class="radar-text-group">
            <h4 class="radar-title text-gold">${title}</h4>
            <p class="radar-desc">${message}</p>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="map-state-overlay empty" id="map-state-overlay">
      <div class="map-state-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-gold">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h4 class="state-card-title text-gold">${title}</h4>
        <p class="state-card-desc">${message}</p>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMapEmptyState = renderMapEmptyState;
}
if (typeof window !== 'undefined') {
  window.renderMapEmptyState = renderMapEmptyState;
}
