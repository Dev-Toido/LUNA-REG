/**
 * LUNA-REG: CoordinateDisplay Component (Part 7)
 * GIS Heads-Up Display (HUD) showing real-time lunar geodetic coordinates, CRS datum, and dynamic scale bar
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, champagne gold accents.
 */

function renderCoordinateDisplay(options = {}) {
  const {
    cursorLat = null,
    cursorLon = null,
    scaleKm = 100,
    crs = 'Moon 2000 IAU / IAG'
  } = options;

  let coordStr = 'Hover over lunar surface';
  if (cursorLat !== null && cursorLon !== null && !isNaN(cursorLat) && !isNaN(cursorLon)) {
    const latDir = cursorLat >= 0 ? 'N' : 'S';
    const lonDir = cursorLon >= 0 ? 'E' : 'W';
    coordStr = `${Math.abs(cursorLat).toFixed(4)}° ${latDir}, ${Math.abs(cursorLon).toFixed(4)}° ${lonDir}`;
  }

  const scaleLabel = scaleKm >= 1000 
    ? `${(scaleKm / 1000).toFixed(1)}k km` 
    : `${Math.round(scaleKm)} km`;

  return `
    <div class="map-coordinate-hud" id="map-coordinate-hud" aria-label="Lunar GIS Coordinate and Scale Telemetry">
      <!-- Cursor / Viewport Coordinates -->
      <div class="hud-coord-group">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="2" x2="12" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
        </svg>
        <span class="hud-coord-text col-mono text-gold" id="hud-coord-val">${coordStr}</span>
      </div>

      <div class="hud-divider" aria-hidden="true"></div>

      <!-- CRS Datum Badge -->
      <div class="hud-crs-badge" title="Coordinate Reference System Datum">
        <span class="crs-label">CRS:</span>
        <span class="crs-val col-mono">${crs}</span>
      </div>

      <div class="hud-divider" aria-hidden="true"></div>

      <!-- Dynamic Scale Bar -->
      <div class="hud-scale-group" title="Approximate Surface Distance Scale">
        <div class="scale-bar-line"></div>
        <span class="scale-bar-label col-mono" id="hud-scale-label">${scaleLabel}</span>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderCoordinateDisplay = renderCoordinateDisplay;
}
if (typeof window !== 'undefined') {
  window.renderCoordinateDisplay = renderCoordinateDisplay;
}
