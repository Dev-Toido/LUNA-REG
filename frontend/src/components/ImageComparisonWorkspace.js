/**
 * LUNA-REG: ImageComparisonWorkspace Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Manages dual-raster rendering canvas & multi-slot comparison viewport:
 * - 5 Canonical Slots:
 *   1. Source Image (TMC-2 Nadir / Target input)
 *   2. Reference Image (LOLA / OHRC / Base orthomosaic)
 *   3. Registered Image (Pending backend processing API)
 *   4. Overlay Image (Dynamic alpha-blended composition)
 *   5. Difference Image (Subtractive delta / residual map)
 * 
 * Features:
 * - Interactive Canvas rendering with 2D Pan & Zoom affine matrix
 * - Drag-to-pan & mouse-wheel zooming
 * - Split Slider Divider in Side-by-Side mode
 * - Opacity Alpha blending in Overlay mode
 * - Continuous flicker loop in Flicker mode
 * - Zero fake output data policy: Shows standardized pending state for ungenerated outputs.
 */

class ImageComparisonWorkspace {
  constructor(options = {}) {
    this.container = options.container || null;
    this.mode = options.mode || 'overlay'; // 'side-by-side' | 'overlay' | 'difference' | 'flicker' | 'slot'
    this.activeSlot = options.activeSlot || 'source';
    this.opacity = 0.5; // 0.0 - 1.0

    // Affine Transform State
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // Split Divider state (0.0 to 1.0, default 0.5)
    this.splitPos = 0.5;
    this.isDraggingSplit = false;

    // Flicker State
    this.flickerTimer = null;
    this.flickerIndex = 0;
    this.flickerSpeed = 600; // ms

    // Image Objects & Loaded Bitmaps
    this.sourceImg = new Image();
    this.referenceImg = new Image();
    this.registeredImg = null; // Stays null when no backend output exists
    this.differenceImg = null; // Stays null when no backend output exists

    this.sourceLoaded = false;
    this.referenceLoaded = false;

    // Default assets (Strict Zero-Demo Policy: null until provided by registration output)
    this.sourceImgUrl = null;
    this.referenceImgUrl = null;

    this.initImageLoaders();
  }

  initImageLoaders() {
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

    if (this.sourceImgUrl) this.sourceImg.src = this.sourceImgUrl;
    if (this.referenceImgUrl) this.referenceImg.src = this.referenceImgUrl;
  }

  setImageUrls(sourceUrl, referenceUrl, registeredUrl = null, differenceUrl = null) {
    if (sourceUrl) {
      this.sourceImgUrl = sourceUrl;
      this.sourceLoaded = false;
      this.sourceImg.src = sourceUrl;
    }
    if (referenceUrl) {
      this.referenceImgUrl = referenceUrl;
      this.referenceLoaded = false;
      this.referenceImg.src = referenceUrl;
    }
    if (registeredUrl) {
      this.registeredImg = new Image();
      this.registeredImg.onload = () => this.draw();
      this.registeredImg.src = registeredUrl;
    } else {
      this.registeredImg = null;
    }
    if (differenceUrl) {
      this.differenceImg = new Image();
      this.differenceImg.onload = () => this.draw();
      this.differenceImg.src = differenceUrl;
    } else {
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
    this.updateDomElements();
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

  zoomIn() {
    this.scale = Math.min(6.0, this.scale * 1.25);
    this.draw();
  }

  zoomOut() {
    this.scale = Math.max(0.2, this.scale / 1.25);
    this.draw();
  }

  fitToView() {
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
    const wrap = this.container ? this.container.querySelector('#res-canvas-viewport-wrap') : null;
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
      <div class="res-workspace-shell">
        <!-- 5-Slot Segmented Tab Selector -->
        <div class="res-slots-nav" role="tablist" aria-label="Comparison Slots">
          <button type="button" class="res-slot-btn active" data-slot="source">
            <span class="slot-dot source"></span>
            <span>1. SOURCE IMAGE</span>
          </button>
          <button type="button" class="res-slot-btn" data-slot="reference">
            <span class="slot-dot reference"></span>
            <span>2. REFERENCE IMAGE</span>
          </button>
          <button type="button" class="res-slot-btn" data-slot="registered">
            <span class="slot-dot registered"></span>
            <span>3. REGISTERED IMAGE</span>
            <span class="res-slot-tag">PENDING</span>
          </button>
          <button type="button" class="res-slot-btn" data-slot="overlay">
            <span class="slot-dot overlay"></span>
            <span>4. OVERLAY BLEND</span>
          </button>
          <button type="button" class="res-slot-btn" data-slot="difference">
            <span class="slot-dot difference"></span>
            <span>5. DIFFERENCE MAP</span>
            <span class="res-slot-tag">PENDING</span>
          </button>
        </div>

        <!-- Canvas Viewport Frame -->
        <div class="res-canvas-viewport-wrap" id="res-canvas-viewport-wrap" tabindex="0" aria-label="Interactive Lunar Raster Viewport">
          <canvas id="res-workspace-canvas" class="res-workspace-canvas"></canvas>

          <!-- Split Divider (Visible only in Side-by-Side mode) -->
          <div class="res-split-divider" id="res-split-divider" style="display: ${this.mode === 'side-by-side' ? 'block' : 'none'}; left: ${this.splitPos * 100}%;">
            <div class="res-split-pill">
              <span>‹ ›</span>
            </div>
          </div>

          <!-- HUD Watermark Tickers -->
          <div class="res-hud-overlay">
            <div class="res-hud-tag left" id="hud-tag-left">SOURCE (INPUT)</div>
            <div class="res-hud-tag right" id="hud-tag-right">REFERENCE (BASE)</div>
          </div>

          <!-- Pending State Banner (Shown when inspecting ungenerated slots) -->
          <div class="res-pending-banner" id="res-pending-banner" style="display: none;">
            <div class="res-pending-box">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div class="res-pending-text">
                <span class="res-pending-title">Awaiting Processing Output</span>
                <p class="res-pending-desc">
                  No completed registration results are available yet. Registration output will appear here after the backend processing API is connected.
                </p>
              </div>
            </div>
          </div>

          <!-- Bottom Coordinates / Scale HUD -->
          <div class="res-canvas-bottom-hud">
            <span class="hud-mono" id="hud-coords">LUNAR GIS: 43.31°S, 11.36°W</span>
            <span class="hud-mono" id="hud-zoom-lbl">ZOOM: ${(this.scale * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.resizeCanvas();
    this.draw();
  }

  resizeCanvas() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#res-workspace-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : (wrap.parentElement?.clientWidth || 800);
    const h = rect.height > 50 ? rect.height : 480;

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

  updateDomElements() {
    if (!this.container) return;
    const splitLine = this.container.querySelector('#res-split-divider');
    if (splitLine) {
      splitLine.style.display = (this.mode === 'side-by-side') ? 'block' : 'none';
      splitLine.style.left = `${this.splitPos * 100}%`;
    }

    const banner = this.container.querySelector('#res-pending-banner');
    if (banner) {
      const isPendingSlot = (this.activeSlot === 'registered' || this.activeSlot === 'difference');
      const isPendingMode = (this.mode === 'difference' && !this.differenceImg);
      banner.style.display = (isPendingSlot || isPendingMode) ? 'flex' : 'none';
    }

    const hudLeft = this.container.querySelector('#hud-tag-left');
    const hudRight = this.container.querySelector('#hud-tag-right');
    if (hudLeft && hudRight) {
      if (this.mode === 'side-by-side') {
        hudLeft.textContent = 'SOURCE (LEFT)';
        hudRight.textContent = 'REFERENCE (RIGHT)';
        hudRight.style.display = 'block';
      } else if (this.mode === 'overlay') {
        hudLeft.textContent = `OVERLAY BLEND (${(this.opacity * 100).toFixed(0)}%)`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'flicker') {
        hudLeft.textContent = `FLICKER: ${this.flickerIndex === 0 ? 'SOURCE RASTER' : 'REFERENCE RASTER'}`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'difference') {
        hudLeft.textContent = 'DIFFERENCE RESIDUAL';
        hudRight.style.display = 'none';
      } else {
        hudLeft.textContent = this.activeSlot.toUpperCase();
        hudRight.style.display = 'none';
      }
    }

    const zoomLbl = this.container.querySelector('#hud-zoom-lbl');
    if (zoomLbl) {
      zoomLbl.textContent = `ZOOM: ${(this.scale * 100).toFixed(0)}%`;
    }
  }

  draw() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#res-workspace-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep Obsidian background
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);

    // Grid pattern
    this.drawCoordinateGrid(ctx, w, h);

    // Apply Pan & Zoom transformations centered on viewport
    ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
    ctx.scale(this.scale, this.scale);

    // Determine render bounds
    const imgW = 720;
    const imgH = 480;
    const dx = -imgW / 2;
    const dy = -imgH / 2;

    if (this.mode === 'overlay') {
      this.drawOverlayMode(ctx, dx, dy, imgW, imgH);
    } else if (this.mode === 'side-by-side') {
      this.drawSideBySideMode(ctx, dx, dy, imgW, imgH, w);
    } else if (this.mode === 'flicker') {
      this.drawFlickerMode(ctx, dx, dy, imgW, imgH);
    } else if (this.mode === 'difference') {
      this.drawDifferenceMode(ctx, dx, dy, imgW, imgH);
    } else {
      // Single slot view
      this.drawSingleSlot(ctx, dx, dy, imgW, imgH);
    }

    ctx.restore();
    this.updateDomElements();
  }

  drawCoordinateGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = '#181a1f';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStandbyPrompt(ctx) {
    ctx.save();
    ctx.fillStyle = '#dfc08a';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[STANDBY • AWAITING REGISTRATION RESULTS]', 0, -10);
    ctx.fillStyle = '#8f929d';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Select an image pair or upload rasters in New Registration to run alignment.', 0, 14);
    ctx.restore();
  }

  drawOverlayMode(ctx, dx, dy, imgW, imgH) {
    if (!this.referenceLoaded && !this.sourceLoaded && !this.registeredImg) {
      this.drawStandbyPrompt(ctx);
      return;
    }

    // 1. Draw base Reference raster
    if (this.referenceLoaded) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    }

    // 2. Draw actual Registered (or Source) raster with opacity
    const topImg = this.registeredImg || this.sourceImg;
    const isTopLoaded = this.registeredImg ? true : this.sourceLoaded;
    if (isTopLoaded && topImg) {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.drawImage(topImg, dx, dy, imgW, imgH);
      ctx.restore();
    }
  }

  drawSideBySideMode(ctx, dx, dy, imgW, imgH) {
    if (!this.referenceLoaded && !this.sourceLoaded && !this.registeredImg) {
      this.drawStandbyPrompt(ctx);
      return;
    }

    const splitX = dx + (imgW * this.splitPos);

    // 1. Draw Reference (Left side)
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, imgW * this.splitPos, imgH);
    ctx.clip();
    if (this.referenceLoaded) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    }
    ctx.restore();

    // 2. Draw Registered or Source (Right side)
    const rightImg = this.registeredImg || this.sourceImg;
    const isRightLoaded = this.registeredImg ? true : this.sourceLoaded;
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, dy, imgW * (1 - this.splitPos), imgH);
    ctx.clip();
    if (isRightLoaded && rightImg) {
      ctx.drawImage(rightImg, dx, dy, imgW, imgH);
    }
    ctx.restore();

    // 3. Draw Split Line in transform coordinates
    ctx.save();
    ctx.strokeStyle = '#dfc08a';
    ctx.lineWidth = 2 / this.scale;
    ctx.beginPath();
    ctx.moveTo(splitX, dy);
    ctx.lineTo(splitX, dy + imgH);
    ctx.stroke();
    ctx.restore();
  }

  drawFlickerMode(ctx, dx, dy, imgW, imgH) {
    const tgt = this.registeredImg || this.sourceImg;
    const isTgtLoaded = this.registeredImg ? true : this.sourceLoaded;
    if (this.flickerIndex === 0 && isTgtLoaded && tgt) {
      ctx.drawImage(tgt, dx, dy, imgW, imgH);
    } else if (this.flickerIndex === 1 && this.referenceLoaded) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    } else {
      this.drawStandbyPrompt(ctx);
    }
  }

  drawDifferenceMode(ctx, dx, dy, imgW, imgH) {
    if (this.differenceImg) {
      ctx.drawImage(this.differenceImg, dx, dy, imgW, imgH);
    } else if (this.referenceLoaded && (this.registeredImg || this.sourceLoaded)) {
      if (this.referenceLoaded) {
        ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
      }
      ctx.save();
      ctx.fillStyle = 'rgba(223, 192, 138, 0.12)';
      ctx.fillRect(dx, dy, imgW, imgH);
      ctx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      ctx.lineWidth = 1.5 / this.scale;
      ctx.strokeRect(dx, dy, imgW, imgH);
      ctx.restore();
    } else {
      this.drawStandbyPrompt(ctx);
    }
  }

  drawSingleSlot(ctx, dx, dy, imgW, imgH) {
    if (this.activeSlot === 'source' && this.sourceLoaded) {
      ctx.drawImage(this.sourceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'reference' && this.referenceLoaded) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'registered' && this.registeredImg) {
      ctx.drawImage(this.registeredImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'difference' && this.differenceImg) {
      ctx.drawImage(this.differenceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'overlay') {
      this.drawOverlayMode(ctx, dx, dy, imgW, imgH);
    } else {
      this.drawStandbyPrompt(ctx);
    }
  }

  bindEvents() {
    if (!this.container) return;
    const canvas = this.container.querySelector('#res-workspace-canvas');
    const wrap = this.container.querySelector('#res-canvas-viewport-wrap');
    if (!canvas || !wrap) return;

    // Window resize observer
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });

    // Mouse drag to pan
    wrap.addEventListener('mousedown', (e) => {
      // Check if clicking split handle
      if (this.mode === 'side-by-side' && e.target.closest('#res-split-divider')) {
        this.isDraggingSplit = true;
        return;
      }
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      wrap.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingSplit) {
        const rect = wrap.getBoundingClientRect();
        const rawPos = (e.clientX - rect.left) / rect.width;
        this.splitPos = Math.max(0.05, Math.min(0.95, rawPos));
        this.draw();
        return;
      }

      if (this.isDragging) {
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
        this.draw();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isDraggingSplit = false;
      if (wrap) wrap.style.cursor = 'grab';
    });

    // Mouse wheel zoom
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.scale = Math.max(0.2, Math.min(6.0, this.scale * zoomFactor));
      this.draw();
    }, { passive: false });

    // Slot buttons click
    this.container.querySelectorAll('.res-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = btn.getAttribute('data-slot');
        this.activeSlot = slot;
        this.container.querySelectorAll('.res-slot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Automatically harmonize mode
        if (slot === 'overlay') this.setMode('overlay');
        else if (slot === 'difference') this.setMode('difference');
        else this.draw();
      });
    });
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageComparisonWorkspace;
}
if (typeof window !== 'undefined') {
  window.ImageComparisonWorkspace = ImageComparisonWorkspace;
}
