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
    this.registeredImg = null;
    this.differenceImg = null;

    this.sourceLoaded = false;
    this.referenceLoaded = false;
    this.registeredLoaded = false;
    this.differenceLoaded = false;
    this.isLoading = false;
    this.loadError = null;

    // Default assets (Strict Zero-Demo Policy: null until provided by registration output)
    this.sourceImgUrl = null;
    this.referenceImgUrl = null;

    this.initImageLoaders();
  }

  initImageLoaders() {
    this.sourceImg.onload = () => {
      this.sourceLoaded = true;
      this.draw();
      this.updateDomElements();
    };
    this.sourceImg.onerror = () => {
      this.sourceLoaded = false;
      this.draw();
      this.updateDomElements();
    };

    this.referenceImg.onload = () => {
      this.referenceLoaded = true;
      this.draw();
      this.updateDomElements();
    };
    this.referenceImg.onerror = () => {
      this.referenceLoaded = false;
      this.draw();
      this.updateDomElements();
    };

    if (this.sourceImgUrl) this.sourceImg.src = this.sourceImgUrl;
    if (this.referenceImgUrl) this.referenceImg.src = this.referenceImgUrl;
  }

  setImageUrls(sourceUrl, referenceUrl, registeredUrl = null, differenceUrl = null) {
    if (!sourceUrl && !referenceUrl && !registeredUrl && !differenceUrl) {
      this.sourceImgUrl = null;
      this.referenceImgUrl = null;
      this.sourceLoaded = false;
      this.referenceLoaded = false;
      this.registeredLoaded = false;
      this.differenceLoaded = false;
      this.registeredImg = null;
      this.differenceImg = null;
      this.isLoading = false;
      this.loadError = null;
      this.draw();
      this.updateDomElements();
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    let pendingCount = 0;

    const notifyLoadProgress = () => {
      pendingCount--;
      if (pendingCount <= 0) {
        this.isLoading = false;
        this.draw();
        this.updateDomElements();
      }
    };

    if (sourceUrl) {
      this.sourceImgUrl = sourceUrl;
      this.sourceLoaded = false;
      pendingCount++;
      this.sourceImg.onload = () => {
        this.sourceLoaded = true;
        notifyLoadProgress();
      };
      this.sourceImg.onerror = () => {
        this.sourceLoaded = false;
        notifyLoadProgress();
      };
      this.sourceImg.src = sourceUrl;
      if (this.sourceImg.complete && this.sourceImg.naturalWidth > 0) {
        this.sourceLoaded = true;
        pendingCount--;
      }
    }

    if (referenceUrl) {
      this.referenceImgUrl = referenceUrl;
      this.referenceLoaded = false;
      pendingCount++;
      this.referenceImg.onload = () => {
        this.referenceLoaded = true;
        notifyLoadProgress();
      };
      this.referenceImg.onerror = () => {
        this.referenceLoaded = false;
        notifyLoadProgress();
      };
      this.referenceImg.src = referenceUrl;
      if (this.referenceImg.complete && this.referenceImg.naturalWidth > 0) {
        this.referenceLoaded = true;
        pendingCount--;
      }
    }

    if (registeredUrl) {
      this.registeredLoaded = false;
      pendingCount++;
      this.registeredImg = new Image();
      this.registeredImg.onload = () => {
        this.registeredLoaded = true;
        notifyLoadProgress();
      };
      this.registeredImg.onerror = () => {
        this.registeredLoaded = false;
        notifyLoadProgress();
      };
      this.registeredImg.src = registeredUrl;
      if (this.registeredImg.complete && this.registeredImg.naturalWidth > 0) {
        this.registeredLoaded = true;
        pendingCount--;
      }
    } else {
      this.registeredImg = null;
      this.registeredLoaded = false;
    }

    if (differenceUrl) {
      this.differenceLoaded = false;
      pendingCount++;
      this.differenceImg = new Image();
      this.differenceImg.onload = () => {
        this.differenceLoaded = true;
        notifyLoadProgress();
      };
      this.differenceImg.onerror = () => {
        this.differenceLoaded = false;
        notifyLoadProgress();
      };
      this.differenceImg.src = differenceUrl;
      if (this.differenceImg.complete && this.differenceImg.naturalWidth > 0) {
        this.differenceLoaded = true;
        pendingCount--;
      }
    } else {
      this.differenceImg = null;
      this.differenceLoaded = false;
    }

    if (pendingCount <= 0) {
      this.isLoading = false;
    }
    this.draw();
    this.updateDomElements();
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

    const hasRegistered = !!((this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0));
    const hasDifference = !!((this.differenceLoaded && this.differenceImg) || (this.differenceImg && this.differenceImg.complete && this.differenceImg.naturalWidth > 0));

    const regTag = this.container.querySelector('[data-slot="registered"] .res-slot-tag');
    if (regTag) {
      if (hasRegistered) {
        regTag.textContent = 'ACTIVE';
        regTag.className = 'res-slot-tag active';
      } else {
        regTag.textContent = 'PENDING';
        regTag.className = 'res-slot-tag';
      }
    }

    const diffTag = this.container.querySelector('[data-slot="difference"] .res-slot-tag');
    if (diffTag) {
      if (hasDifference) {
        diffTag.textContent = 'ACTIVE';
        diffTag.className = 'res-slot-tag active';
      } else {
        diffTag.textContent = 'PENDING';
        diffTag.className = 'res-slot-tag';
      }
    }

    const banner = this.container.querySelector('#res-pending-banner');
    if (banner) {
      const isPendingSlot = (this.activeSlot === 'registered' && !hasRegistered) || (this.activeSlot === 'difference' && !hasDifference);
      const isPendingMode = (this.mode === 'difference' && !hasDifference && !hasRegistered);
      banner.style.display = (isPendingSlot || isPendingMode) ? 'flex' : 'none';
    }

    const hudLeft = this.container.querySelector('#hud-tag-left');
    const hudRight = this.container.querySelector('#hud-tag-right');
    if (hudLeft && hudRight) {
      if (this.mode === 'side-by-side') {
        hudLeft.textContent = 'REFERENCE (LEFT)';
        hudRight.textContent = hasRegistered ? 'REGISTERED (RIGHT)' : 'SOURCE (RIGHT)';
        hudRight.style.display = 'block';
      } else if (this.mode === 'overlay') {
        hudLeft.textContent = hasRegistered
          ? `ALIGNED OVERLAY (${(this.opacity * 100).toFixed(0)}% OPACITY)`
          : `OVERLAY BLEND (${(this.opacity * 100).toFixed(0)}%)`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'flicker') {
        hudLeft.textContent = `FLICKER: ${this.flickerIndex === 0 ? (hasRegistered ? 'REGISTERED RASTER' : 'SOURCE RASTER') : 'REFERENCE RASTER'}`;
        hudRight.style.display = 'none';
      } else if (this.mode === 'difference') {
        hudLeft.textContent = 'DIFFERENCE RESIDUAL';
        hudRight.style.display = 'none';
      } else {
        hudLeft.textContent = (this.activeSlot === 'registered') ? 'REGISTERED ALIGNED RASTER' : this.activeSlot.toUpperCase();
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

    // Determine render bounds preserving natural aspect ratio
    const activeRef = this.referenceLoaded ? this.referenceImg : ((this.registeredLoaded && this.registeredImg) ? this.registeredImg : this.sourceImg);
    let imgW = 720;
    let imgH = 480;
    if (activeRef && activeRef.naturalWidth && activeRef.naturalHeight) {
      const aspect = activeRef.naturalWidth / activeRef.naturalHeight;
      if (aspect >= 1) {
        imgW = 720;
        imgH = Math.round(720 / aspect);
      } else {
        imgH = 480;
        imgW = Math.round(480 * aspect);
      }
    }
    const dx = -imgW / 2;
    const dy = -imgH / 2;

    if (this.mode === 'overlay') {
      this.drawOverlayMode(ctx, dx, dy, imgW, imgH);
    } else if (this.mode === 'side-by-side') {
      this.drawSideBySideMode(ctx, dx, dy, imgW, imgH);
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

  drawLoadingPrompt(ctx) {
    ctx.save();
    ctx.fillStyle = '#dfc08a';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[PROCESSING • RENDERING ALIGNED RASTERS]', 0, -10);
    ctx.fillStyle = '#8f929d';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Decoding sub-pixel projective warp and residual difference layer...', 0, 14);
    ctx.restore();
  }

  drawErrorPrompt(ctx, msg) {
    ctx.save();
    ctx.fillStyle = '#e06c75';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[RASTER DECODING NOTICE]', 0, -10);
    ctx.fillStyle = '#8f929d';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(msg || 'Unable to decode raster image format.', 0, 14);
    ctx.restore();
  }

  drawOverlayMode(ctx, dx, dy, imgW, imgH) {
    if (this.isLoading) {
      this.drawLoadingPrompt(ctx);
      return;
    }
    if (this.loadError) {
      this.drawErrorPrompt(ctx, this.loadError);
      return;
    }
    const hasReg = (this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0);
    const hasRef = this.referenceLoaded || (this.referenceImg && this.referenceImg.complete && this.referenceImg.naturalWidth > 0);
    const hasSrc = this.sourceLoaded || (this.sourceImg && this.sourceImg.complete && this.sourceImg.naturalWidth > 0);

    if (!hasRef && !hasSrc && !hasReg) {
      this.drawStandbyPrompt(ctx);
      return;
    }

    // 1. Draw base Reference raster (or Source if Reference not available)
    if (hasRef) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    } else if (hasSrc) {
      ctx.drawImage(this.sourceImg, dx, dy, imgW, imgH);
    }

    // 2. Draw actual Registered (or Source) raster with opacity
    const topImg = hasReg ? this.registeredImg : (hasRef && hasSrc ? this.sourceImg : null);
    if (topImg && topImg !== (hasRef ? this.referenceImg : this.sourceImg)) {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.drawImage(topImg, dx, dy, imgW, imgH);
      ctx.restore();
    }
  }

  drawSideBySideMode(ctx, dx, dy, imgW, imgH) {
    if (this.isLoading) {
      this.drawLoadingPrompt(ctx);
      return;
    }
    if (this.loadError) {
      this.drawErrorPrompt(ctx, this.loadError);
      return;
    }
    const hasReg = (this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0);
    const hasRef = this.referenceLoaded || (this.referenceImg && this.referenceImg.complete && this.referenceImg.naturalWidth > 0);
    const hasSrc = this.sourceLoaded || (this.sourceImg && this.sourceImg.complete && this.sourceImg.naturalWidth > 0);

    if (!hasRef && !hasSrc && !hasReg) {
      this.drawStandbyPrompt(ctx);
      return;
    }

    const splitX = dx + (imgW * this.splitPos);

    // 1. Draw Reference (Left side)
    const leftImg = hasRef ? this.referenceImg : this.sourceImg;
    if (leftImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, imgW * this.splitPos, imgH);
      ctx.clip();
      ctx.drawImage(leftImg, dx, dy, imgW, imgH);
      ctx.restore();
    }

    // 2. Draw Registered or Source (Right side)
    const rightImg = hasReg ? this.registeredImg : (hasSrc ? this.sourceImg : this.referenceImg);
    if (rightImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, dy, imgW * (1 - this.splitPos), imgH);
      ctx.clip();
      ctx.drawImage(rightImg, dx, dy, imgW, imgH);
      ctx.restore();
    }

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
    if (this.isLoading) {
      this.drawLoadingPrompt(ctx);
      return;
    }
    if (this.loadError) {
      this.drawErrorPrompt(ctx, this.loadError);
      return;
    }
    const hasReg = (this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0);
    const hasRef = this.referenceLoaded || (this.referenceImg && this.referenceImg.complete && this.referenceImg.naturalWidth > 0);
    const hasSrc = this.sourceLoaded || (this.sourceImg && this.sourceImg.complete && this.sourceImg.naturalWidth > 0);

    const rightImg = hasReg ? this.registeredImg : (hasSrc ? this.sourceImg : null);
    const leftImg = hasRef ? this.referenceImg : null;

    if (!leftImg && !rightImg) {
      this.drawStandbyPrompt(ctx);
      return;
    }

    if (this.flickerIndex === 0 && rightImg) {
      ctx.drawImage(rightImg, dx, dy, imgW, imgH);
    } else if (leftImg) {
      ctx.drawImage(leftImg, dx, dy, imgW, imgH);
    } else if (rightImg) {
      ctx.drawImage(rightImg, dx, dy, imgW, imgH);
    }
  }

  drawDifferenceMode(ctx, dx, dy, imgW, imgH) {
    if (this.isLoading) {
      this.drawLoadingPrompt(ctx);
      return;
    }
    if (this.loadError) {
      this.drawErrorPrompt(ctx, this.loadError);
      return;
    }
    const hasDiff = (this.differenceLoaded && this.differenceImg) || (this.differenceImg && this.differenceImg.complete && this.differenceImg.naturalWidth > 0);
    const hasReg = (this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0);
    const hasRef = this.referenceLoaded || (this.referenceImg && this.referenceImg.complete && this.referenceImg.naturalWidth > 0);
    const hasSrc = this.sourceLoaded || (this.sourceImg && this.sourceImg.complete && this.sourceImg.naturalWidth > 0);

    if (hasDiff) {
      ctx.drawImage(this.differenceImg, dx, dy, imgW, imgH);
    } else if (hasRef && (hasReg || hasSrc)) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.drawImage(hasReg ? this.registeredImg : this.sourceImg, dx, dy, imgW, imgH);
      ctx.restore();
    } else if (hasReg) {
      ctx.drawImage(this.registeredImg, dx, dy, imgW, imgH);
    } else {
      this.drawStandbyPrompt(ctx);
    }
  }

  drawSingleSlot(ctx, dx, dy, imgW, imgH) {
    if (this.isLoading) {
      this.drawLoadingPrompt(ctx);
      return;
    }
    if (this.loadError) {
      this.drawErrorPrompt(ctx, this.loadError);
      return;
    }
    const hasReg = (this.registeredLoaded && this.registeredImg) || (this.registeredImg && this.registeredImg.complete && this.registeredImg.naturalWidth > 0);
    const hasRef = this.referenceLoaded || (this.referenceImg && this.referenceImg.complete && this.referenceImg.naturalWidth > 0);
    const hasSrc = this.sourceLoaded || (this.sourceImg && this.sourceImg.complete && this.sourceImg.naturalWidth > 0);
    const hasDiff = (this.differenceLoaded && this.differenceImg) || (this.differenceImg && this.differenceImg.complete && this.differenceImg.naturalWidth > 0);

    if (this.activeSlot === 'source' && hasSrc) {
      ctx.drawImage(this.sourceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'reference' && hasRef) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'registered' && hasReg) {
      ctx.drawImage(this.registeredImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'difference' && hasDiff) {
      ctx.drawImage(this.differenceImg, dx, dy, imgW, imgH);
    } else if (this.activeSlot === 'overlay') {
      this.drawOverlayMode(ctx, dx, dy, imgW, imgH);
    } else if (hasReg) {
      ctx.drawImage(this.registeredImg, dx, dy, imgW, imgH);
    } else if (hasRef) {
      ctx.drawImage(this.referenceImg, dx, dy, imgW, imgH);
    } else if (hasSrc) {
      ctx.drawImage(this.sourceImg, dx, dy, imgW, imgH);
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
        if (slot === 'overlay') {
          this.setMode('overlay');
        } else if (slot === 'difference') {
          this.setMode('difference');
        } else {
          this.mode = 'slot';
          this.stopFlicker();
          this.updateDomElements();
          this.draw();
        }

        if (typeof this.onSlotChange === 'function') {
          this.onSlotChange(slot);
        }
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
