/**
 * LUNA-REG: ImageInspector Component
 * Part 5: Analysis Tools Workspace
 * 
 * Provides interactive viewport navigation and telemetry HUD:
 * - Zoom In (+), Zoom Out (-), Fit-to-screen, 1:1 Actual Pixels, Fullscreen
 * - Active tool selection: Pan (hand), Crosshair, Point, Distance, Area
 * - Telemetry status HUD: Zoom %, Canvas GSD resolution, Cursor X/Y, Lunar Lat/Lon
 */

class ImageInspector {
  constructor(options = {}) {
    this.container = options.container || null;
    this.activeTool = options.activeTool || 'pan'; // 'pan' | 'crosshair' | 'point' | 'distance' | 'area'
    this.zoom = 1.0;
    this.resolutionM = 5.0; // Default TMC-2 resolution
    this.cursorPos = { x: 0, y: 0, lat: -74.20, lon: 54.12 };

    // Callbacks
    this.onToolChange = options.onToolChange || (() => {});
    this.onZoomIn = options.onZoomIn || (() => {});
    this.onZoomOut = options.onZoomOut || (() => {});
    this.onFitToScreen = options.onFitToScreen || (() => {});
    this.onResetZoom = options.onResetZoom || (() => {});
    this.onToggleFullscreen = options.onToggleFullscreen || (() => {});
  }

  setTool(tool) {
    this.activeTool = tool;
    this.updateToolButtons();
    if (this.onToolChange) this.onToolChange(tool);
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.1, Math.min(10.0, zoom));
    const lbl = this.container ? this.container.querySelector('#inspect-zoom-val') : null;
    if (lbl) lbl.textContent = `${(this.zoom * 100).toFixed(0)}%`;
  }

  setResolution(mPerPx) {
    this.resolutionM = mPerPx;
    const lbl = this.container ? this.container.querySelector('#inspect-gsd-val') : null;
    if (lbl) {
      lbl.textContent = mPerPx ? `${mPerPx.toFixed(2)} m/px` : '—';
    }
  }

  setCursorTelemetry(pxX, pxY, lat, lon) {
    this.cursorPos = { x: Math.round(pxX), y: Math.round(pxY), lat, lon };
    if (!this.container) return;

    const pxLbl = this.container.querySelector('#inspect-pixel-coords');
    if (pxLbl) {
      pxLbl.textContent = `X: ${this.cursorPos.x}, Y: ${this.cursorPos.y}`;
    }

    const geoLbl = this.container.querySelector('#inspect-geo-coords');
    if (geoLbl) {
      if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) {
        const latStr = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`;
        const lonStr = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
        geoLbl.textContent = `${latStr}, ${lonStr}`;
      } else {
        geoLbl.textContent = '—';
      }
    }
  }

  updateToolButtons() {
    if (!this.container) return;
    this.container.querySelectorAll('.inspect-tool-btn').forEach(b => {
      const tool = b.getAttribute('data-tool');
      const isActive = tool === this.activeTool;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="inspect-toolbar-shell">
        <!-- 1. Interactive Tool Selectors -->
        <div class="inspect-tool-group" role="toolbar" aria-label="Inspection Tools">
          <button type="button" class="inspect-tool-btn ${this.activeTool === 'pan' ? 'active' : ''}" data-tool="pan" title="Pan Canvas (Space + Drag)" aria-label="Pan Tool">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
            </svg>
            <span>PAN</span>
          </button>

          <button type="button" class="inspect-tool-btn ${this.activeTool === 'crosshair' ? 'active' : ''}" data-tool="crosshair" title="Crosshair Inspector (Hover for Pixel Coordinates)" aria-label="Crosshair Inspector">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="22" y1="12" x2="18" y2="12"></line>
              <line x1="6" y1="12" x2="2" y2="12"></line>
              <line x1="12" y1="6" x2="12" y2="2"></line>
              <line x1="12" y1="22" x2="12" y2="18"></line>
            </svg>
            <span>INSPECT</span>
          </button>

          <div class="inspect-tool-sep"></div>

          <button type="button" class="inspect-tool-btn ${this.activeTool === 'point' ? 'active' : ''}" data-tool="point" title="Point Telemetry Marker" aria-label="Point Marker Tool">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>POINT</span>
          </button>

          <button type="button" class="inspect-tool-btn ${this.activeTool === 'distance' ? 'active' : ''}" data-tool="distance" title="Distance Measure Line (Click two points)" aria-label="Distance Tool">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"></path>
              <line x1="14.5" y1="9.5" x2="16.5" y2="11.5"></line>
              <line x1="10.5" y1="13.5" x2="12.5" y2="15.5"></line>
              <line x1="6.5" y1="17.5" x2="8.5" y2="19.5"></line>
            </svg>
            <span>DISTANCE</span>
          </button>

          <button type="button" class="inspect-tool-btn ${this.activeTool === 'area' ? 'active' : ''}" data-tool="area" title="Area Measure Polygon (Click vertices, double click to close)" aria-label="Area Tool">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <span>AREA</span>
          </button>
        </div>

        <!-- 2. Viewport Navigation Buttons -->
        <div class="inspect-nav-group">
          <button type="button" class="inspect-btn-icon" id="inspect-btn-zoom-in" title="Zoom In (+)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>

          <button type="button" class="inspect-btn-icon" id="inspect-btn-zoom-out" title="Zoom Out (-)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>

          <button type="button" class="inspect-btn-icon" id="inspect-btn-fit" title="Fit to Screen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>

          <button type="button" class="inspect-btn-icon" id="inspect-btn-reset" title="1:1 Actual Pixels">
            <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 700;">1:1</span>
          </button>

          <button type="button" class="inspect-btn-icon" id="inspect-btn-fs" title="Toggle Fullscreen Viewport">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>

        <!-- 3. Telemetry Readout Tickers -->
        <div class="inspect-telemetry-hud">
          <div class="inspect-hud-item">
            <span class="hud-lbl">ZOOM:</span>
            <span class="hud-val gold" id="inspect-zoom-val">${(this.zoom * 100).toFixed(0)}%</span>
          </div>

          <div class="inspect-hud-item">
            <span class="hud-lbl">GSD:</span>
            <span class="hud-val" id="inspect-gsd-val">${this.resolutionM.toFixed(2)} m/px</span>
          </div>

          <div class="inspect-hud-item">
            <span class="hud-lbl">PIXEL:</span>
            <span class="hud-val mono" id="inspect-pixel-coords">X: 0, Y: 0</span>
          </div>

          <div class="inspect-hud-item">
            <span class="hud-lbl">LUNAR:</span>
            <span class="hud-val mono gold" id="inspect-geo-coords">74.20°S, 54.12°E</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Tool switching
    this.container.querySelectorAll('.inspect-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this.setTool(tool);
      });
    });

    // Zoom controls
    const btnIn = this.container.querySelector('#inspect-btn-zoom-in');
    if (btnIn) btnIn.addEventListener('click', () => this.onZoomIn());

    const btnOut = this.container.querySelector('#inspect-btn-zoom-out');
    if (btnOut) btnOut.addEventListener('click', () => this.onZoomOut());

    const btnFit = this.container.querySelector('#inspect-btn-fit');
    if (btnFit) btnFit.addEventListener('click', () => this.onFitToScreen());

    const btnReset = this.container.querySelector('#inspect-btn-reset');
    if (btnReset) btnReset.addEventListener('click', () => this.onResetZoom());

    const btnFs = this.container.querySelector('#inspect-btn-fs');
    if (btnFs) btnFs.addEventListener('click', () => this.onToggleFullscreen());
  }
}

window.ImageInspector = ImageInspector;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageInspector;
}
