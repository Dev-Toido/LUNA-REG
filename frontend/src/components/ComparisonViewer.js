/**
 * LUNA-REG: ComparisonViewer Component
 * Part 5: Analysis Tools Workspace
 * 
 * Core High-Precision Lunar Canvas Engine:
 * - Side-by-side split curtain comparison with draggable divider
 * - Overlay blend with dynamic GPU alpha compositing
 * - Temporal flicker comparison with variable speeds (250ms - 2000ms)
 * - Difference residual inspection
 * - Synchronized pan, zoom, scale transforms
 * - Real-time pixel coordinate tracking & hover loupe
 * - Interactive measurement vertices capture (Point, Distance, Area)
 * - Safe sizing guards preventing 0px collapse
 */

class ComparisonViewer {
  constructor(options = {}) {
    this.container = options.container || null;
    this.mode = options.mode || 'side-by-side'; // 'side-by-side' | 'overlay' | 'flicker' | 'difference'
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.splitPos = 0.5; // 0.0 - 1.0
    this.opacity = 0.5;
    this.flickerSpeed = 500; // ms
    this.flickerIndex = 0;
    this.flickerTimer = null;
    this.isDraggingSplit = false;
    this.isPanning = false;
    this.startPan = { x: 0, y: 0 };

    // Active tool from ImageInspector
    this.activeTool = 'pan'; // 'pan' | 'crosshair' | 'point' | 'distance' | 'area'

    // Measurement drawing state
    this.measurePoints = []; // Temporary vertices for active line / polygon
    this.onMeasureAdd = options.onMeasureAdd || (() => {});
    this.onCursorMove = options.onCursorMove || (() => {});

    // Raster images
    this.sourceImg = new Image();
    this.referenceImg = new Image();
    this.registeredImg = null;
    this.differenceImg = null;

    this.sourceLoaded = false;
    this.referenceLoaded = false;

    // Default assets (Strict Zero-Demo Policy: null until provided by registration output)
    this.sourceUrl = null;
    this.referenceUrl = null;
    this.registeredUrl = null;
    this.differenceUrl = null;

    // External recorded measurements to render as overlays
    this.recordedMeasurements = [];

    this.initLoaders();
  }

  initLoaders() {
    this.sourceImg.onload = () => {
      this.sourceLoaded = true;
      this.draw();
    };
    this.sourceImg.onerror = () => {
      this.sourceLoaded = false;
      this.draw();
    };

    this.referenceImg.onload = () => {
      this.referenceLoaded = true;
      this.draw();
    };
    this.referenceImg.onerror = () => {
      this.referenceLoaded = false;
      this.draw();
    };

    if (this.sourceUrl) this.sourceImg.src = this.sourceUrl;
    if (this.referenceUrl) this.referenceImg.src = this.referenceUrl;
  }

  setImageUrls(sourceUrl, referenceUrl, registeredUrl = null, differenceUrl = null) {
    if (sourceUrl) {
      this.sourceUrl = sourceUrl;
      this.sourceLoaded = false;
      this.sourceImg.src = sourceUrl;
    } else {
      this.sourceUrl = null;
      this.sourceLoaded = false;
      this.sourceImg = new Image();
      this.initLoaders();
    }
    if (referenceUrl) {
      this.referenceUrl = referenceUrl;
      this.referenceLoaded = false;
      this.referenceImg.src = referenceUrl;
    } else {
      this.referenceUrl = null;
      this.referenceLoaded = false;
      this.referenceImg = new Image();
      this.initLoaders();
    }
    if (registeredUrl) {
      this.registeredUrl = registeredUrl;
      this.registeredImg = new Image();
      this.registeredImg.onload = () => this.draw();
      this.registeredImg.src = registeredUrl;
      if (this.registeredImg.complete && this.registeredImg.naturalWidth > 0) {
        this.draw();
      }
    } else {
      this.registeredUrl = null;
      this.registeredImg = null;
    }
    if (differenceUrl) {
      this.differenceUrl = differenceUrl;
      this.differenceImg = new Image();
      this.differenceImg.onload = () => this.draw();
      this.differenceImg.src = differenceUrl;
      if (this.differenceImg.complete && this.differenceImg.naturalWidth > 0) {
        this.draw();
      }
    } else {
      this.differenceUrl = null;
      this.differenceImg = null;
    }
    this.draw();
  }

  setMode(mode) {
    this.mode = mode;
    this.stopFlicker();
    if (this.mode === 'flicker') {
      this.startFlicker();
    }
    this.updateModeUI();
    this.draw();
  }

  setOpacity(val) {
    this.opacity = Math.max(0, Math.min(1, val / 100));
    this.draw();
  }

  setFlickerSpeed(ms) {
    this.flickerSpeed = ms;
    if (this.mode === 'flicker') {
      this.stopFlicker();
      this.startFlicker();
    }
  }

  startFlicker() {
    this.stopFlicker();
    this.flickerIndex = 0;
    this.flickerTimer = setInterval(() => {
      this.flickerIndex = (this.flickerIndex + 1) % 2;
      this.draw();
    }, this.flickerSpeed);
  }

  stopFlicker() {
    if (this.flickerTimer) {
      clearInterval(this.flickerTimer);
      this.flickerTimer = null;
    }
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    this.measurePoints = [];
    const canvasWrap = this.container ? this.container.querySelector('#viewer-canvas-wrap') : null;
    if (canvasWrap) {
      canvasWrap.className = `viewer-canvas-wrap tool-${tool}`;
    }
    this.draw();
  }

  setMeasurements(measurements) {
    this.recordedMeasurements = measurements || [];
    this.draw();
  }

  zoomIn() {
    this.scale = Math.min(10.0, this.scale * 1.25);
    this.draw();
  }

  zoomOut() {
    this.scale = Math.max(0.1, this.scale / 1.25);
    this.draw();
  }

  fitToScreen() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.draw();
  }

  resetTransform() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.splitPos = 0.5;
    this.draw();
  }

  toggleFullscreen() {
    const wrap = this.container ? this.container.querySelector('#viewer-canvas-wrap') : null;
    if (!wrap) return;
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="viewer-shell">
        
        <!-- Top Mode Selector Bar -->
        <div class="viewer-mode-bar" role="tablist" aria-label="Comparison Modes">
          <div class="viewer-modes-left">
            <button type="button" class="view-mode-pill ${this.mode === 'side-by-side' ? 'active' : ''}" data-mode="side-by-side" role="tab" aria-selected="${this.mode === 'side-by-side'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
              <span>SIDE-BY-SIDE SPLIT</span>
            </button>

            <button type="button" class="view-mode-pill ${this.mode === 'overlay' ? 'active' : ''}" data-mode="overlay" role="tab" aria-selected="${this.mode === 'overlay'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="13" height="13" rx="1"></rect>
                <rect x="8" y="8" width="13" height="13" rx="1"></rect>
              </svg>
              <span>OVERLAY BLEND</span>
            </button>

            <button type="button" class="view-mode-pill ${this.mode === 'flicker' ? 'active' : ''}" data-mode="flicker" role="tab" aria-selected="${this.mode === 'flicker'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>FLICKER COMPARE</span>
            </button>

            <button type="button" class="view-mode-pill ${this.mode === 'difference' ? 'active' : ''}" data-mode="difference" role="tab" aria-selected="${this.mode === 'difference'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="12" r="7"></circle>
                <circle cx="15" cy="12" r="7"></circle>
              </svg>
              <span>DIFFERENCE RESIDUAL</span>
            </button>
          </div>

          <!-- Dynamic Mode Controls -->
          <div class="viewer-mode-controls">
            <!-- Overlay slider -->
            <div class="mode-ctrl-group" id="viewer-ctrl-overlay" style="display: ${this.mode === 'overlay' ? 'flex' : 'none'};">
              <span class="ctrl-tag">ALPHA:</span>
              <input type="range" class="viewer-mini-slider" id="viewer-overlay-slider" min="0" max="100" value="${(this.opacity * 100).toFixed(0)}" aria-label="Overlay transparency">
              <span class="ctrl-tag-val" id="viewer-overlay-val">${(this.opacity * 100).toFixed(0)}%</span>
            </div>

            <!-- Flicker speeds -->
            <div class="mode-ctrl-group" id="viewer-ctrl-flicker" style="display: ${this.mode === 'flicker' ? 'flex' : 'none'};">
              <span class="ctrl-tag">INTERVAL:</span>
              <div class="flicker-speed-pills">
                <button type="button" class="btn-flicker-speed ${this.flickerSpeed === 250 ? 'active' : ''}" data-speed="250">0.25s</button>
                <button type="button" class="btn-flicker-speed ${this.flickerSpeed === 500 ? 'active' : ''}" data-speed="500">0.5s</button>
                <button type="button" class="btn-flicker-speed ${this.flickerSpeed === 1000 ? 'active' : ''}" data-speed="1000">1.0s</button>
                <button type="button" class="btn-flicker-speed ${this.flickerSpeed === 2000 ? 'active' : ''}" data-speed="2000">2.0s</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Canvas Frame -->
        <div class="viewer-canvas-wrap tool-${this.activeTool}" id="viewer-canvas-wrap" tabindex="0" aria-label="Interactive Lunar Workspace Canvas">
          <canvas id="viewer-main-canvas" class="viewer-main-canvas"></canvas>

          <!-- Split Divider Line -->
          <div class="viewer-split-divider" id="viewer-split-divider" style="display: ${this.mode === 'side-by-side' ? 'block' : 'none'}; left: ${this.splitPos * 100}%;">
            <div class="viewer-split-handle">
              <span>‹ ›</span>
            </div>
          </div>

          <!-- HUD Floating Overlays -->
          <div class="viewer-hud-overlay">
            <div class="viewer-hud-tag left" id="viewer-tag-left">SOURCE: TMC-2 NADIR</div>
            <div class="viewer-hud-tag right" id="viewer-tag-right">REFERENCE: OHRC BASE</div>
          </div>

          <!-- Pending Output Warning Banner (shown when difference is selected without registered output) -->
          <div class="viewer-pending-banner" id="viewer-pending-banner" style="display: none;">
            <div class="pending-banner-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div class="pending-banner-text">
                <span class="pending-banner-title">ANALYSIS ENGINE STANDBY</span>
                <p class="pending-banner-desc">
                  Analysis tools will become active when registration output is available.
                </p>
              </div>
            </div>
          </div>

          <!-- Measurement Hint Toast -->
          <div class="viewer-measure-hint" id="viewer-measure-hint" style="display: none;">
            <span id="viewer-hint-text">Click two points on the terrain to measure distance.</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.resizeCanvas();
    this.draw();
  }

  bindEvents() {
    if (!this.container) return;

    // View mode pills
    this.container.querySelectorAll('.view-mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.setMode(mode);
      });
    });

    // Overlay slider
    const ovSlider = this.container.querySelector('#viewer-overlay-slider');
    if (ovSlider) {
      ovSlider.addEventListener('input', (e) => {
        this.setOpacity(parseInt(e.target.value, 10));
        const valLbl = this.container.querySelector('#viewer-overlay-val');
        if (valLbl) valLbl.textContent = `${e.target.value}%`;
      });
    }

    // Flicker speed pills
    this.container.querySelectorAll('.btn-flicker-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.getAttribute('data-speed'), 10);
        this.container.querySelectorAll('.btn-flicker-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setFlickerSpeed(speed);
      });
    });

    // Canvas interactivity
    const wrap = this.container.querySelector('#viewer-canvas-wrap');
    const canvas = this.container.querySelector('#viewer-main-canvas');
    if (!wrap || !canvas) return;

    // Mouse Move (Tracking coordinates + Pan / Split dragging)
    wrap.addEventListener('mousemove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // Handle Split dragging
      if (this.isDraggingSplit && this.mode === 'side-by-side') {
        this.splitPos = Math.max(0.05, Math.min(0.95, clientX / rect.width));
        const divider = this.container.querySelector('#viewer-split-divider');
        if (divider) divider.style.left = `${this.splitPos * 100}%`;
        this.draw();
        return;
      }

      // Handle Canvas Panning
      if (this.isPanning) {
        this.panX += (e.clientX - this.startPan.x);
        this.panY += (e.clientY - this.startPan.y);
        this.startPan = { x: e.clientX, y: e.clientY };
        this.draw();
        return;
      }

      // Calculate sensor pixel coordinates based on pan & zoom
      const imgX = (clientX - (rect.width / 2) - this.panX) / this.scale + 400;
      const imgY = (clientY - (rect.height / 2) - this.panY) / this.scale + 260;

      // Approximate lunar South Pole coordinates (Boguslawsky Crater)
      const lat = -74.20 + (imgY / 1000) * 0.4;
      const lon = 52.10 + (imgX / 1000) * 0.6;

      if (this.onCursorMove) {
        this.onCursorMove(imgX, imgY, lat, lon);
      }
    });

    // Mouse Down (Start Pan or Start Split or Record Point)
    wrap.addEventListener('mousedown', (e) => {
      const rect = wrap.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const splitPx = rect.width * this.splitPos;

      // Check if clicking near split divider
      if (this.mode === 'side-by-side' && Math.abs(clientX - splitPx) < 18) {
        this.isDraggingSplit = true;
        e.preventDefault();
        return;
      }

      // Active Tool: Pan
      if (this.activeTool === 'pan' || e.button === 1 || e.spaceKey) {
        this.isPanning = true;
        this.startPan = { x: e.clientX, y: e.clientY };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }

      // Measurement tools
      if (this.activeTool === 'point' || this.activeTool === 'distance' || this.activeTool === 'area') {
        const clientY = e.clientY - rect.top;
        const imgX = (clientX - (rect.width / 2) - this.panX) / this.scale + 400;
        const imgY = (clientY - (rect.height / 2) - this.panY) / this.scale + 260;
        const lat = -74.20 + (imgY / 1000) * 0.4;
        const lon = 52.10 + (imgX / 1000) * 0.6;

        this.handleMeasurementClick(imgX, imgY, lat, lon);
      }
    });

    // Mouse Up
    window.addEventListener('mouseup', () => {
      this.isDraggingSplit = false;
      this.isPanning = false;
      if (wrap) wrap.style.cursor = '';
    });

    // Double click (Close polygon area measurement)
    wrap.addEventListener('dblclick', () => {
      if (this.activeTool === 'area' && this.measurePoints.length >= 3) {
        this.commitAreaMeasurement();
      }
    });

    // Wheel (Zoom)
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.scale = Math.max(0.1, Math.min(10.0, this.scale * zoomFactor));
      this.draw();
    }, { passive: false });

    // Window resize
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });
  }

  handleMeasurementClick(imgX, imgY, lat, lon) {
    if (this.activeTool === 'point') {
      const pt = {
        id: `PT-${Date.now().toString().slice(-4)}`,
        type: 'Point',
        x: Math.round(imgX),
        y: Math.round(imgY),
        lat,
        lon,
        value: `(${Math.round(imgX)}, ${Math.round(imgY)})`,
        unit: 'px',
        timestamp: new Date().toLocaleTimeString()
      };
      if (this.onMeasureAdd) this.onMeasureAdd(pt);
      this.draw();
    } else if (this.activeTool === 'distance') {
      this.measurePoints.push({ x: imgX, y: imgY, lat, lon });
      if (this.measurePoints.length === 2) {
        const p1 = this.measurePoints[0];
        const p2 = this.measurePoints[1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        const gsd = 5.0; // 5m per pixel
        const distKm = (pixelDist * gsd) / 1000;

        const distRecord = {
          id: `DIST-${Date.now().toString().slice(-4)}`,
          type: 'Distance',
          p1: { x: Math.round(p1.x), y: Math.round(p1.y) },
          p2: { x: Math.round(p2.x), y: Math.round(p2.y) },
          pixelDist: Math.round(pixelDist),
          value: distKm >= 1.0 ? `${distKm.toFixed(2)} km` : `${(distKm * 1000).toFixed(0)} m`,
          unit: distKm >= 1.0 ? 'km' : 'm',
          timestamp: new Date().toLocaleTimeString()
        };

        if (this.onMeasureAdd) this.onMeasureAdd(distRecord);
        this.measurePoints = [];
      }
      this.draw();
    } else if (this.activeTool === 'area') {
      this.measurePoints.push({ x: imgX, y: imgY, lat, lon });
      this.draw();
    }
  }

  commitAreaMeasurement() {
    if (this.measurePoints.length < 3) return;

    // Polygon area via shoelace formula
    let areaPx = 0;
    const n = this.measurePoints.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      areaPx += this.measurePoints[i].x * this.measurePoints[j].y;
      areaPx -= this.measurePoints[j].x * this.measurePoints[i].y;
    }
    areaPx = Math.abs(areaPx) / 2;
    const gsd = 5.0;
    const areaSqM = areaPx * (gsd * gsd);
    const areaSqKm = areaSqM / 1000000;

    const areaRecord = {
      id: `AREA-${Date.now().toString().slice(-4)}`,
      type: 'Area',
      vertices: this.measurePoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      value: `${areaSqKm.toFixed(3)} km²`,
      unit: 'km²',
      timestamp: new Date().toLocaleTimeString()
    };

    if (this.onMeasureAdd) this.onMeasureAdd(areaRecord);
    this.measurePoints = [];
    this.draw();
  }

  resizeCanvas() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#viewer-main-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : (wrap.parentElement?.clientWidth || 800);
    const h = rect.height > 50 ? rect.height : 520;

    canvas.width = Math.max(300, w) * dpr;
    canvas.height = Math.max(200, h) * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
  }

  updateModeUI() {
    if (!this.container) return;

    // Divider line visibility
    const divider = this.container.querySelector('#viewer-split-divider');
    if (divider) {
      divider.style.display = (this.mode === 'side-by-side') ? 'block' : 'none';
      divider.style.left = `${this.splitPos * 100}%`;
    }

    // Dynamic mode control boxes
    const ovCtrl = this.container.querySelector('#viewer-ctrl-overlay');
    if (ovCtrl) ovCtrl.style.display = (this.mode === 'overlay') ? 'flex' : 'none';

    const flkCtrl = this.container.querySelector('#viewer-ctrl-flicker');
    if (flkCtrl) flkCtrl.style.display = (this.mode === 'flicker') ? 'flex' : 'none';

    // Banner visibility
    const banner = this.container.querySelector('#viewer-pending-banner');
    if (banner) {
      banner.style.display = (this.mode === 'difference' && !this.differenceImg) ? 'flex' : 'none';
    }

    // HUD tags
    const hudLeft = this.container.querySelector('#viewer-tag-left');
    const hudRight = this.container.querySelector('#viewer-tag-right');
    if (hudLeft && hudRight) {
      if (this.mode === 'side-by-side') {
        hudLeft.textContent = 'SOURCE: TMC-2 (LEFT)';
        hudRight.textContent = 'REFERENCE: OHRC (RIGHT)';
        hudRight.style.display = 'block';
      } else if (this.mode === 'overlay') {
        hudLeft.textContent = `OVERLAY BLEND: ${(this.opacity * 100).toFixed(0)}% ALPHA`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'flicker') {
        hudLeft.textContent = `FLICKER: ${this.flickerIndex === 0 ? 'SOURCE (TMC-2)' : 'REFERENCE (OHRC)'}`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'difference') {
        hudLeft.textContent = 'DIFFERENCE RESIDUAL';
        hudRight.style.display = 'none';
      }
    }
  }

  draw() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#viewer-main-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clear background
    ctx.fillStyle = '#060709';
    ctx.fillRect(0, 0, w, h);

    // 2. Compute raster transforms
    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;
    const imgW = 800 * this.scale;
    const imgH = 520 * this.scale;
    const destX = centerX - imgW / 2;
    const destY = centerY - imgH / 2;

    if (!this.referenceLoaded && !this.sourceLoaded && !this.registeredImg) {
      ctx.fillStyle = '#dfc08a';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ANALYSIS ENGINE STANDBY]', centerX, centerY - 10);
      ctx.fillStyle = '#8f929d';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('Execute image registration to activate multi-spectral raster layers & analysis.', centerX, centerY + 14);
      ctx.restore();
      return;
    }

    const tgtRaster = this.registeredImg || this.sourceImg;
    const isTgtLoaded = this.registeredImg ? true : (this.sourceLoaded && this.sourceImg.complete);

    // 3. Render according to Mode
    if (this.mode === 'side-by-side') {
      const splitPx = w * this.splitPos;

      // Draw Registered / Source Target Image (clipped to left half)
      if (isTgtLoaded && tgtRaster) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitPx, h);
        ctx.clip();
        ctx.drawImage(tgtRaster, destX, destY, imgW, imgH);
        ctx.restore();
      }

      // Draw Reference Image (clipped to right half)
      if (this.referenceLoaded && this.referenceImg.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(splitPx, 0, w - splitPx, h);
        ctx.clip();
        ctx.drawImage(this.referenceImg, destX, destY, imgW, imgH);
        ctx.restore();
      }

    } else if (this.mode === 'overlay') {
      // Draw Base Reference
      if (this.referenceLoaded && this.referenceImg.complete) {
        ctx.drawImage(this.referenceImg, destX, destY, imgW, imgH);
      }
      // Draw Registered / Source Target on top with opacity
      if (isTgtLoaded && tgtRaster) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.drawImage(tgtRaster, destX, destY, imgW, imgH);
        ctx.restore();
      }

    } else if (this.mode === 'flicker') {
      const imgToDraw = (this.flickerIndex === 0) ? tgtRaster : this.referenceImg;
      if (imgToDraw && imgToDraw.complete) {
        ctx.drawImage(imgToDraw, destX, destY, imgW, imgH);
      }

    } else if (this.mode === 'difference') {
      if (this.differenceImg && this.differenceImg.complete) {
        ctx.drawImage(this.differenceImg, destX, destY, imgW, imgH);
      } else {
        if (this.referenceLoaded && this.referenceImg.complete) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.drawImage(this.referenceImg, destX, destY, imgW, imgH);
          ctx.restore();
        }
      }
    }

    // 4. Render Recorded Measurements
    this.renderMeasurementOverlays(ctx, destX, destY);

    // 5. Render In-Progress Active Measurement
    this.renderActiveMeasurement(ctx, destX, destY);

    ctx.restore();
  }

  renderMeasurementOverlays(ctx, destX, destY) {
    if (!this.recordedMeasurements || this.recordedMeasurements.length === 0) return;

    ctx.save();
    this.recordedMeasurements.forEach(m => {
      if (m.type === 'Point') {
        const cx = destX + (m.x - 400 + 400) * this.scale;
        const cy = destY + (m.y - 260 + 260) * this.scale;

        ctx.fillStyle = '#dfc08a';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '10px monospace';
        ctx.fillStyle = '#f0ede6';
        ctx.fillText(m.id, cx + 8, cy - 6);

      } else if (m.type === 'Distance') {
        const x1 = destX + m.p1.x * this.scale;
        const y1 = destY + m.p1.y * this.scale;
        const x2 = destX + m.p2.x * this.scale;
        const y2 = destY + m.p2.y * this.scale;

        // Line
        ctx.strokeStyle = '#dfc08a';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Endpoints
        ctx.fillStyle = '#dfc08a';
        ctx.beginPath();
        ctx.arc(x1, y1, 4, 0, Math.PI * 2);
        ctx.arc(x2, y2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Label at midpoint
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#dfc08a';
        ctx.fillText(m.value, mx + 6, my - 6);

      } else if (m.type === 'Area' && m.vertices) {
        ctx.strokeStyle = '#dfc08a';
        ctx.fillStyle = 'rgba(223, 192, 138, 0.15)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        m.vertices.forEach((v, idx) => {
          const vx = destX + v.x * this.scale;
          const vy = destY + v.y * this.scale;
          if (idx === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  renderActiveMeasurement(ctx, destX, destY) {
    if (!this.measurePoints || this.measurePoints.length === 0) return;

    ctx.save();
    if (this.activeTool === 'distance' && this.measurePoints.length === 1) {
      const p1 = this.measurePoints[0];
      const x1 = destX + p1.x * this.scale;
      const y1 = destY + p1.y * this.scale;

      ctx.fillStyle = '#dfc08a';
      ctx.beginPath();
      ctx.arc(x1, y1, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.activeTool === 'area') {
      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      this.measurePoints.forEach((p, idx) => {
        const px = destX + p.x * this.scale;
        const py = destY + p.y * this.scale;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);

        // Vertex dot
        ctx.fillStyle = '#dfc08a';
        ctx.arc(px, py, 3, 0, Math.PI * 2);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

window.ComparisonViewer = ComparisonViewer;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComparisonViewer;
}
