/**
 * LUNA-REG: MapToolbar Component (Part 7)
 * Interactive GIS viewport navigation tools for Lunar Map
 * 
 * Features:
 * - Pan / Hand tool mode
 * - Feature selection tool mode
 * - Zoom In (+) / Zoom Out (-)
 * - Fit-to-view (automatic extent framing)
 * - Reset view (100% nadir)
 * - Fullscreen toggle
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, champagne gold accents.
 */

function renderMapToolbar(options = {}) {
  const {
    activeTool = 'pan', // 'pan' | 'select'
    isFullscreen = false,
    zoomLevel = 1.0
  } = options;

  const zoomPct = Math.round(zoomLevel * 100);

  return `
    <div class="map-toolbar" role="toolbar" aria-label="Lunar Map Navigation Toolbar">
      <!-- Tool Modes -->
      <div class="toolbar-tool-group">
        <button type="button" 
                class="toolbar-btn ${activeTool === 'pan' ? 'active' : ''}" 
                id="tool-btn-pan" 
                data-tool="pan" 
                title="Pan Navigation Mode (Drag to move map)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
          </svg>
          <span class="toolbar-btn-label">PAN</span>
        </button>

        <button type="button" 
                class="toolbar-btn ${activeTool === 'select' ? 'active' : ''}" 
                id="tool-btn-select" 
                data-tool="select" 
                title="Feature Select Mode (Click footprints/regions)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path>
            <path d="M13 13l6 6"></path>
          </svg>
          <span class="toolbar-btn-label">SELECT</span>
        </button>
      </div>

      <div class="toolbar-divider" aria-hidden="true"></div>

      <!-- Zoom Controls -->
      <div class="toolbar-tool-group">
        <button type="button" class="toolbar-btn" id="map-btn-zoomin" title="Zoom In (+)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>

        <div class="toolbar-zoom-readout" id="map-zoom-readout" title="Current Zoom Scale">
          ${zoomPct}%
        </div>

        <button type="button" class="toolbar-btn" id="map-btn-zoomout" title="Zoom Out (-)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
      </div>

      <div class="toolbar-divider" aria-hidden="true"></div>

      <!-- Extent Framing & Viewport Actions -->
      <div class="toolbar-tool-group">
        <button type="button" class="toolbar-btn" id="map-btn-fit" title="Fit to View (Frame all footprints & regions)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          <span class="toolbar-btn-label">FIT EXTENTS</span>
        </button>

        <button type="button" class="toolbar-btn" id="map-btn-reset" title="Reset View (Return to initial 100% nadir framing)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span class="toolbar-btn-label">RESET</span>
        </button>

        <button type="button" class="toolbar-btn ${isFullscreen ? 'active' : ''}" id="map-btn-fullscreen" title="Toggle Fullscreen GIS Workspace">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${isFullscreen ? `
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            ` : `
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <polyline points="21 15 21 21 15 21"></polyline>
              <polyline points="3 9 3 3 9 3"></polyline>
            `}
          </svg>
        </button>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMapToolbar = renderMapToolbar;
}
if (typeof window !== 'undefined') {
  window.renderMapToolbar = renderMapToolbar;
}
