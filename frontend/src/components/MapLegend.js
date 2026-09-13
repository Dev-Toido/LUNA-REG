/**
 * LUNA-REG: MapLegend Component (Part 7)
 * Cartographic legend displaying layer symbology, styles, and status indicators
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, champagne gold, amber, ivory.
 */

function renderMapLegend(options = {}) {
  const {
    isCollapsed = false
  } = options;

  return `
    <div class="map-legend ${isCollapsed ? 'collapsed' : ''}" id="map-legend" aria-label="Cartographic Map Legend">
      <div class="legend-header" id="legend-toggle-header">
        <span class="legend-title">GIS SYMBOLOGY</span>
        <button type="button" class="btn-legend-collapse" id="btn-toggle-legend" title="Toggle Legend Display">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="${isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline>
          </svg>
        </button>
      </div>

      <div class="legend-body">
        <div class="legend-item">
          <span class="legend-symbol symbol-region-boundary"></span>
          <span class="legend-label">Target Region Geodetic Boundary</span>
        </div>

        <div class="legend-item">
          <span class="legend-symbol symbol-source-footprint"></span>
          <span class="legend-label">Source Raster Footprint (Sensor A)</span>
        </div>

        <div class="legend-item">
          <span class="legend-symbol symbol-reference-footprint"></span>
          <span class="legend-label">Reference Raster Footprint (Sensor B)</span>
        </div>

        <div class="legend-item">
          <span class="legend-symbol symbol-overlap-area"></span>
          <span class="legend-label">Pair Spatial Overlap Polygon</span>
        </div>

        <div class="legend-item">
          <span class="legend-symbol symbol-status-verified"></span>
          <span class="legend-label">Verified Registration Pair</span>
        </div>

        <div class="legend-item">
          <span class="legend-symbol symbol-status-pending"></span>
          <span class="legend-label">Unverified / Pending Verification</span>
        </div>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMapLegend = renderMapLegend;
}
if (typeof window !== 'undefined') {
  window.renderMapLegend = renderMapLegend;
}
