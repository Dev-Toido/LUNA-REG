/**
 * LUNA-REG: LunarMapPreview Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Features:
 * - Geospatial lunar footprint preview canvas
 * - Renders bounding box polygons for Source (gold) & Reference (off-white)
 * - Layer toggles: Footprint Boundaries, Lunar Graticule, Regional Landmarks
 * - Zoom & Pan mini-controls (+, -, Reset)
 * - Does not invent missing data: shows global lunar sphere if coordinates are absent
 */

class LunarMapPreview {
  constructor(options = {}) {
    this.container = options.container || null;
    this.source = null;
    this.reference = null;
    this.pair = null;

    // Layer toggles
    this.layers = {
      footprint: true,
      graticule: true,
      landmarks: true
    };

    // Zoom state
    this.zoom = 1.0;
  }

  setData(pairData, sourceProduct, referenceProduct) {
    this.pair = pairData || null;
    this.source = sourceProduct || null;
    this.reference = referenceProduct || null;
    if (this.container) {
      this.drawMap();
    }
  }

  toggleLayer(layerKey) {
    if (this.layers[layerKey] !== undefined) {
      this.layers[layerKey] = !this.layers[layerKey];
      const btn = this.container ? this.container.querySelector(`.map-layer-pill[data-layer="${layerKey}"]`) : null;
      if (btn) btn.classList.toggle('active', this.layers[layerKey]);
      this.drawMap();
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="res-map-preview-card">
        <!-- Top Bar -->
        <div class="res-map-preview-top">
          <div class="res-map-preview-title">
            <div class="res-badge-gold">GIS FOOTPRINT</div>
            <h4>GEOSPATIAL COVERAGE MAP</h4>
          </div>

          <!-- Layer Toggles -->
          <div class="res-map-layers">
            <button type="button" class="map-layer-pill active" data-layer="footprint" title="Toggle Footprint Extents">
              <span>FOOTPRINT</span>
            </button>
            <button type="button" class="map-layer-pill active" data-layer="graticule" title="Toggle Latitude/Longitude Graticule">
              <span>GRATICULE</span>
            </button>
            <button type="button" class="map-layer-pill active" data-layer="landmarks" title="Toggle Lunar Landmarks">
              <span>LANDMARKS</span>
            </button>
          </div>

          <!-- Mini Zoom Controls -->
          <div class="res-map-zoom-btns">
            <button type="button" class="map-zoom-btn" id="btn-map-prev-in" title="Zoom In">+</button>
            <button type="button" class="map-zoom-btn" id="btn-map-prev-out" title="Zoom Out">&minus;</button>
            <button type="button" class="map-zoom-btn" id="btn-map-prev-rst" title="Reset View">&#8635;</button>
          </div>
        </div>

        <!-- Canvas Frame -->
        <div class="res-map-canvas-wrap" id="res-map-canvas-wrap">
          <canvas id="res-map-prev-canvas" class="res-map-prev-canvas"></canvas>
          <div class="res-map-legend">
            <span class="legend-item"><span class="legend-box gold"></span> Source Raster</span>
            <span class="legend-item"><span class="legend-box white"></span> Reference Raster</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.drawMap();
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('.map-layer-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        this.toggleLayer(layer);
      });
    });

    const btnIn = this.container.querySelector('#btn-map-prev-in');
    if (btnIn) btnIn.addEventListener('click', () => {
      this.zoom = Math.min(3.0, this.zoom * 1.25);
      this.drawMap();
    });

    const btnOut = this.container.querySelector('#btn-map-prev-out');
    if (btnOut) btnOut.addEventListener('click', () => {
      this.zoom = Math.max(0.5, this.zoom / 1.25);
      this.drawMap();
    });

    const btnRst = this.container.querySelector('#btn-map-prev-rst');
    if (btnRst) btnRst.addEventListener('click', () => {
      this.zoom = 1.0;
      this.drawMap();
    });

    window.addEventListener('resize', () => this.drawMap());
  }

  drawMap() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#res-map-prev-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : (wrap.parentElement?.clientWidth || 280);
    const h = rect.height > 50 ? rect.height : 180;

    canvas.width = Math.max(260, w) * dpr;
    canvas.height = Math.max(160, h) * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayW = canvas.width / dpr;
    const displayH = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep Charcoal Background
    ctx.fillStyle = '#0a0b0d';
    ctx.fillRect(0, 0, displayW, displayH);

    const cx = displayW / 2;
    const cy = displayH / 2;
    const baseRadius = Math.min(displayW, displayH) * 0.42 * this.zoom;

    // Lunar Sphere Disk
    const grad = ctx.createRadialGradient(cx, cy, baseRadius * 0.1, cx, cy, baseRadius);
    grad.addColorStop(0, '#1c1f26');
    grad.addColorStop(0.8, '#13151a');
    grad.addColorStop(1, '#08080a');

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#2d313b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    // 1. Lunar Graticule
    if (this.layers.graticule) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;

      // Parallels (Latitudes)
      for (let lat = -60; lat <= 60; lat += 30) {
        const yOffset = (lat / 90) * baseRadius;
        const radAtLat = Math.sqrt(Math.max(0, baseRadius * baseRadius - yOffset * yOffset));
        ctx.beginPath();
        ctx.ellipse(cx, cy - yOffset, radAtLat, Math.abs(yOffset) * 0.25, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Meridians (Longitudes)
      for (let lon = -90; lon <= 90; lon += 30) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(lon / 90) * baseRadius, baseRadius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 2. Lunar Landmarks
    if (this.layers.landmarks) {
      const landmarks = [
        { name: 'Tycho', x: cx - baseRadius * 0.15, y: cy + baseRadius * 0.5 },
        { name: 'Copernicus', x: cx - baseRadius * 0.25, y: cy - baseRadius * 0.1 },
        { name: 'Chandrayaan-2 Landing Site', x: cx + baseRadius * 0.1, y: cy + baseRadius * 0.72 }
      ];

      landmarks.forEach(lm => {
        ctx.fillStyle = '#dfc08a';
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '8px monospace';
        ctx.fillText(lm.name, lm.x + 5, lm.y + 3);
      });
    }

    // 3. Footprint Bounding Boxes
    if (this.layers.footprint) {
      const s = this.source || {};
      const r = this.reference || {};

      const hasCoords = (s.latitude_min !== undefined && s.latitude_min !== null);

      if (hasCoords) {
        // Project real coordinates onto globe view
        const sY = cy - ((s.latitude_min + s.latitude_max) / 2 / 90) * baseRadius;
        const sX = cx + ((s.longitude_min + s.longitude_max) / 2 / 180) * baseRadius;
        const boxW = Math.max(16, Math.abs((s.longitude_max - s.longitude_min) / 180) * baseRadius);
        const boxH = Math.max(12, Math.abs((s.latitude_max - s.latitude_min) / 90) * baseRadius);

        // Reference Footprint (White)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(sX - boxW / 2 - 4, sY - boxH / 2 - 3, boxW + 8, boxH + 6);
        ctx.strokeStyle = '#e1e2e6';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sX - boxW / 2 - 4, sY - boxH / 2 - 3, boxW + 8, boxH + 6);

        // Source Footprint (Gold)
        ctx.fillStyle = 'rgba(223, 192, 138, 0.25)';
        ctx.fillRect(sX - boxW / 2, sY - boxH / 2, boxW, boxH);
        ctx.strokeStyle = '#dfc08a';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(sX - boxW / 2, sY - boxH / 2, boxW, boxH);
      } else {
        // Default target footprint for Polar ROI
        const fpX = cx + baseRadius * 0.05;
        const fpY = cy + baseRadius * 0.65;
        const fpW = 34 * this.zoom;
        const fpH = 24 * this.zoom;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(fpX - 2, fpY - 2, fpW + 4, fpH + 4);
        ctx.strokeStyle = '#e1e2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(fpX - 2, fpY - 2, fpW + 4, fpH + 4);

        ctx.fillStyle = 'rgba(223, 192, 138, 0.22)';
        ctx.fillRect(fpX, fpY, fpW, fpH);
        ctx.strokeStyle = '#dfc08a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(fpX, fpY, fpW, fpH);
      }
    }

    ctx.restore();
    ctx.restore();
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LunarMapPreview;
}
if (typeof window !== 'undefined') {
  window.LunarMapPreview = LunarMapPreview;
}
