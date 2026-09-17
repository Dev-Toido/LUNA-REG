/**
 * LUNA-REG: CoordinatePanel Component
 * Part 5: Analysis Tools Workspace
 * 
 * Manages Planetary Geodetic & Coordinate Telemetry:
 * - Latitude / Longitude extents (min, max, center)
 * - Coordinate Reference System (CRS): Moon 2000 IAU / IAG
 * - Footprint area in km² and target region details
 * - Interactive Lunar Mini-Map with graticule, landmarks, and bounding box
 */

class CoordinatePanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.regionName = 'Boguslawsky Crater';
    this.crs = 'Moon 2000 IAU / IAG Cartographic Reference';
    this.latMin = -74.20;
    this.latMax = -71.80;
    this.lonMin = 52.10;
    this.lonMax = 56.40;
    this.zoom = 1.0;

    this.layers = {
      footprint: true,
      graticule: true,
      landmarks: true
    };
  }

  setGeodetics(regionName, latMin, latMax, lonMin, lonMax) {
    if (regionName) this.regionName = regionName;
    if (latMin !== undefined && latMin !== null) this.latMin = latMin;
    if (latMax !== undefined && latMax !== null) this.latMax = latMax;
    if (lonMin !== undefined && lonMin !== null) this.lonMin = lonMin;
    if (lonMax !== undefined && lonMax !== null) this.lonMax = lonMax;

    if (this.container) {
      this.updateGeodeticUI();
      this.drawMiniMap();
    }
  }

  toggleLayer(key) {
    if (this.layers[key] !== undefined) {
      this.layers[key] = !this.layers[key];
      const btn = this.container ? this.container.querySelector(`.coord-layer-btn[data-layer="${key}"]`) : null;
      if (btn) btn.classList.toggle('active', this.layers[key]);
      this.drawMiniMap();
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="coord-panel-card">
        <!-- Header -->
        <div class="coord-panel-top">
          <div class="coord-title-wrap">
            <div class="res-badge-gold">LUNAR GEODESY &amp; CRS</div>
            <h3 class="coord-heading">COORDINATE REFERENCE &amp; FOOTPRINT</h3>
          </div>
          <span class="coord-crs-badge">IAU 2000</span>
        </div>

        <div class="coord-content-grid coord-text-only-grid">
          <!-- Primary Geodetic Text Blocks -->
          <div class="coord-meta-column">
            <div class="coord-meta-block">
              <span class="coord-meta-lbl">TARGET ROI REGION</span>
              <span class="coord-meta-val" id="coord-reg-name">${this.regionName}</span>
            </div>

            <div class="coord-meta-block">
              <span class="coord-meta-lbl">COORDINATE REFERENCE SYSTEM (CRS)</span>
              <span class="coord-meta-val mono" id="coord-crs-name">${this.crs}</span>
            </div>

            <div class="coord-center-box">
              <span class="center-lbl">CENTER COORDINATE:</span>
              <span class="center-val mono" id="coord-center-val">
                ${(((this.latMin + this.latMax) / 2)).toFixed(2)}°S, ${(((this.lonMin + this.lonMax) / 2)).toFixed(2)}°E
              </span>
            </div>
          </div>

          <!-- Geodetic Bounding Box -->
          <div class="coord-extents-box">
            <span class="extents-title">GEODETIC BOUNDING BOX</span>
            <div class="extents-grid">
              <div class="extent-cell">
                <span class="ext-lbl">LAT MIN:</span>
                <span class="ext-num" id="ext-lat-min">${Math.abs(this.latMin).toFixed(2)}°${this.latMin < 0 ? 'S' : 'N'}</span>
              </div>
              <div class="extent-cell">
                <span class="ext-lbl">LAT MAX:</span>
                <span class="ext-num" id="ext-lat-max">${Math.abs(this.latMax).toFixed(2)}°${this.latMax < 0 ? 'S' : 'N'}</span>
              </div>
              <div class="extent-cell">
                <span class="ext-lbl">LON MIN:</span>
                <span class="ext-num" id="ext-lon-min">${Math.abs(this.lonMin).toFixed(2)}°${this.lonMin < 0 ? 'W' : 'E'}</span>
              </div>
              <div class="extent-cell">
                <span class="ext-lbl">LON MAX:</span>
                <span class="ext-num" id="ext-lon-max">${Math.abs(this.lonMax).toFixed(2)}°${this.lonMax < 0 ? 'W' : 'E'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
    this.drawMiniMap();
  }

  updateGeodeticUI() {
    if (!this.container) return;

    const regEl = this.container.querySelector('#coord-reg-name');
    if (regEl) regEl.textContent = this.regionName;

    const latMinEl = this.container.querySelector('#ext-lat-min');
    if (latMinEl) latMinEl.textContent = `${Math.abs(this.latMin).toFixed(2)}°${this.latMin < 0 ? 'S' : 'N'}`;

    const latMaxEl = this.container.querySelector('#ext-lat-max');
    if (latMaxEl) latMaxEl.textContent = `${Math.abs(this.latMax).toFixed(2)}°${this.latMax < 0 ? 'S' : 'N'}`;

    const lonMinEl = this.container.querySelector('#ext-lon-min');
    if (lonMinEl) lonMinEl.textContent = `${Math.abs(this.lonMin).toFixed(2)}°${this.lonMin < 0 ? 'W' : 'E'}`;

    const lonMaxEl = this.container.querySelector('#ext-lon-max');
    if (lonMaxEl) lonMaxEl.textContent = `${Math.abs(this.lonMax).toFixed(2)}°${this.lonMax < 0 ? 'W' : 'E'}`;

    const centerEl = this.container.querySelector('#coord-center-val');
    if (centerEl) {
      const cLat = (this.latMin + this.latMax) / 2;
      const cLon = (this.lonMin + this.lonMax) / 2;
      centerEl.textContent = `${Math.abs(cLat).toFixed(2)}°${cLat < 0 ? 'S' : 'N'}, ${Math.abs(cLon).toFixed(2)}°${cLon < 0 ? 'W' : 'E'}`;
    }
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('.coord-layer-btn').forEach(b => {
      b.addEventListener('click', () => {
        const layer = b.getAttribute('data-layer');
        this.toggleLayer(layer);
      });
    });

    const btnIn = this.container.querySelector('#btn-coord-zoom-in');
    if (btnIn) btnIn.addEventListener('click', () => {
      this.zoom = Math.min(3.0, this.zoom * 1.25);
      this.drawMiniMap();
    });

    const btnOut = this.container.querySelector('#btn-coord-zoom-out');
    if (btnOut) btnOut.addEventListener('click', () => {
      this.zoom = Math.max(0.5, this.zoom / 1.25);
      this.drawMiniMap();
    });

    const btnRst = this.container.querySelector('#btn-coord-zoom-reset');
    if (btnRst) btnRst.addEventListener('click', () => {
      this.zoom = 1.0;
      this.drawMiniMap();
    });

    window.addEventListener('resize', () => this.drawMiniMap());
  }

  drawMiniMap() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#coord-minimap-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : (wrap.parentElement?.clientWidth || 320);
    const h = rect.height > 50 ? rect.height : 220;

    canvas.width = Math.max(260, w) * dpr;
    canvas.height = Math.max(160, h) * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark canvas background
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.42 * this.zoom;

    // Lunar Globe disk
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#14161a';
    ctx.fill();
    ctx.strokeStyle = '#252932';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Graticule
    if (this.layers.graticule) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.8;

      // Parallels
      [-0.6, -0.3, 0, 0.3, 0.6].forEach(offset => {
        ctx.beginPath();
        ctx.ellipse(cx, cy + offset * r, r * Math.cos(offset * 1.2), r * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Meridians
      [-0.6, -0.3, 0, 0.3, 0.6].forEach(offset => {
        ctx.beginPath();
        ctx.ellipse(cx + offset * r, cy, r * 0.2, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // Footprint
    if (this.layers.footprint) {
      const fpX = cx + (this.lonMin - 50) * (r / 40);
      const fpY = cy + (Math.abs(this.latMin) - 70) * (r / 30);
      const fpW = 32 * this.zoom;
      const fpH = 22 * this.zoom;

      ctx.fillStyle = 'rgba(223, 192, 138, 0.25)';
      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.rect(fpX - fpW / 2, fpY - fpH / 2, fpW, fpH);
      ctx.fill();
      ctx.stroke();

      // Footprint label
      ctx.font = '9px monospace';
      ctx.fillStyle = '#dfc08a';
      ctx.fillText(this.regionName, fpX - fpW / 2, fpY - fpH / 2 - 4);
    }

    // Landmarks
    if (this.layers.landmarks) {
      const landmarks = [
        { name: 'Boguslawsky', x: cx + 15 * this.zoom, y: cy + 25 * this.zoom },
        { name: 'Manzinus', x: cx - 25 * this.zoom, y: cy + 18 * this.zoom },
        { name: 'Demonax', x: cx + 35 * this.zoom, y: cy + 45 * this.zoom }
      ];

      landmarks.forEach(lm => {
        ctx.fillStyle = '#dfc08a';
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#8a8d93';
        ctx.fillText(lm.name, lm.x + 5, lm.y + 3);
      });
    }

    ctx.restore();
  }
}

window.CoordinatePanel = CoordinatePanel;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoordinatePanel;
}
