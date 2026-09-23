/**
 * LUNA-REG: ComparisonToolbar Component
 * Part 4: Planetary Mapping Workstation
 * 
 * Features:
 * - View Modes: Side-by-side, Overlay, Difference, Flicker comparison
 * - Slot Direct Selector: Source, Reference, Registered, Overlay, Difference
 * - Overlay Opacity Slider (0% - 100%)
 * - Flicker Speed Controller (0.5s, 1.0s, 2.0s) & Play/Pause
 * - Viewport Navigation Tools: Zoom In, Zoom Out, Fit to View, Reset, Fullscreen
 */

class ComparisonToolbar {
  constructor(options = {}) {
    this.container = options.container || null;
    this.mode = options.mode || 'overlay'; // 'side-by-side' | 'overlay' | 'difference' | 'flicker' | 'slot'
    this.activeSlot = options.activeSlot || 'source'; // 'source' | 'reference' | 'registered' | 'overlay' | 'difference'
    this.opacity = options.opacity !== undefined ? options.opacity : 50; // 0 - 100
    this.flickerSpeed = options.flickerSpeed || 600; // ms
    this.isFlickering = false;

    // Callbacks
    this.onModeChange = options.onModeChange || (() => {});
    this.onSlotChange = options.onSlotChange || (() => {});
    this.onOpacityChange = options.onOpacityChange || (() => {});
    this.onFlickerToggle = options.onFlickerToggle || (() => {});
    this.onFlickerSpeedChange = options.onFlickerSpeedChange || (() => {});
    this.onZoomIn = options.onZoomIn || (() => {});
    this.onZoomOut = options.onZoomOut || (() => {});
    this.onFitToView = options.onFitToView || (() => {});
    this.onReset = options.onReset || (() => {});
    this.onFullscreen = options.onFullscreen || (() => {});
  }

  setMode(mode) {
    this.mode = mode;
    this.updateUI();
    if (this.onModeChange) this.onModeChange(mode);
  }

  setActiveSlot(slot) {
    this.activeSlot = slot;
    this.updateUI();
    if (this.onSlotChange) this.onSlotChange(slot);
  }

  setOpacity(val) {
    this.opacity = Math.max(0, Math.min(100, val));
    const slider = this.container ? this.container.querySelector('#res-toolbar-opacity') : null;
    const label = this.container ? this.container.querySelector('#res-toolbar-opacity-val') : null;
    if (slider) slider.value = this.opacity;
    if (label) label.textContent = `${this.opacity}%`;
  }

  setRegistrationStatus(isAvailable) {
    this.isRegistrationAvailable = !!isAvailable;
    if (!this.container) return;
    const tag = this.container.querySelector('.comp-tag-status');
    if (tag) {
      if (this.isRegistrationAvailable) {
        tag.textContent = 'REGISTERED RASTER ACTIVE';
        tag.className = 'comp-tag-status active';
      } else {
        tag.textContent = 'AWAITING REGISTERED RASTER';
        tag.className = 'comp-tag-status';
      }
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="comp-toolbar-wrap">
        <!-- 1. MODE SELECTOR PILLS -->
        <div class="comp-modes-bar" role="tablist" aria-label="Comparison View Modes">
          <button type="button" class="comp-mode-btn ${this.mode === 'overlay' ? 'active' : ''}" data-mode="overlay" role="tab" aria-selected="${this.mode === 'overlay'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="13" height="13" rx="1"></rect>
              <rect x="8" y="8" width="13" height="13" rx="1"></rect>
            </svg>
            <span>OVERLAY VIEW</span>
          </button>

          <button type="button" class="comp-mode-btn ${this.mode === 'side-by-side' ? 'active' : ''}" data-mode="side-by-side" role="tab" aria-selected="${this.mode === 'side-by-side'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="12" y1="3" x2="12" y2="21"></line>
            </svg>
            <span>SIDE-BY-SIDE</span>
          </button>

          <button type="button" class="comp-mode-btn ${this.mode === 'difference' ? 'active' : ''}" data-mode="difference" role="tab" aria-selected="${this.mode === 'difference'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="12" r="7"></circle>
              <circle cx="15" cy="12" r="7"></circle>
            </svg>
            <span>DIFFERENCE</span>
          </button>

          <button type="button" class="comp-mode-btn ${this.mode === 'flicker' ? 'active' : ''}" data-mode="flicker" role="tab" aria-selected="${this.mode === 'flicker'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>FLICKER COMPARE</span>
          </button>
        </div>

        <!-- 2. MODE-SPECIFIC SUB-CONTROLS -->
        <div class="comp-dynamic-controls">
          <!-- Overlay Controls -->
          <div class="comp-ctrl-group" id="ctrl-group-overlay" style="display: ${this.mode === 'overlay' ? 'flex' : 'none'};">
            <span class="comp-lbl">OPACITY:</span>
            <input type="range" id="res-toolbar-opacity" class="res-slider" min="0" max="100" value="${this.opacity}" aria-label="Overlay transparency">
            <span class="res-val-pill" id="res-toolbar-opacity-val">${this.opacity}%</span>
          </div>

          <!-- Difference Controls -->
          <div class="comp-ctrl-group" id="ctrl-group-difference" style="display: ${this.mode === 'difference' ? 'flex' : 'none'};">
            <span class="comp-diff-hint">Subtractive raster residual visualizer</span>
            <span class="comp-tag-status">AWAITING REGISTERED RASTER</span>
          </div>

          <!-- Flicker Controls -->
          <div class="comp-ctrl-group" id="ctrl-group-flicker" style="display: ${this.mode === 'flicker' ? 'flex' : 'none'};">
            <button type="button" class="btn-tech-sm ${this.isFlickering ? 'primary' : ''}" id="btn-flicker-toggle">
              <span id="lbl-flicker-state">${this.isFlickering ? 'PAUSE FLICKER' : 'START FLICKER'}</span>
            </button>
            <div class="comp-flicker-speeds">
              <button type="button" class="btn-speed-pill ${this.flickerSpeed === 1000 ? 'active' : ''}" data-speed="1000">1.0s</button>
              <button type="button" class="btn-speed-pill ${this.flickerSpeed === 600 ? 'active' : ''}" data-speed="600">0.6s</button>
              <button type="button" class="btn-speed-pill ${this.flickerSpeed === 300 ? 'active' : ''}" data-speed="300">0.3s</button>
            </div>
          </div>
        </div>

        <!-- 3. VIEWPORT NAVIGATION TOOLS -->
        <div class="comp-nav-tools">
          <button type="button" class="comp-tool-btn" id="btn-comp-zoomin" title="Zoom In (+)" aria-label="Zoom In">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button type="button" class="comp-tool-btn" id="btn-comp-zoomout" title="Zoom Out (-)" aria-label="Zoom Out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button type="button" class="comp-tool-btn" id="btn-comp-fit" title="Fit to View" aria-label="Fit to View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          <button type="button" class="comp-tool-btn" id="btn-comp-reset" title="Reset Transformation" aria-label="Reset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
          <button type="button" class="comp-tool-btn" id="btn-comp-fullscreen" title="Toggle Fullscreen" aria-label="Fullscreen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  updateUI() {
    if (!this.container) return;

    // Mode buttons active states
    this.container.querySelectorAll('.comp-mode-btn').forEach(btn => {
      const isAct = btn.getAttribute('data-mode') === this.mode;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', String(isAct));
    });

    // Toggle sub-controls
    const overlayGroup = this.container.querySelector('#ctrl-group-overlay');
    const diffGroup = this.container.querySelector('#ctrl-group-difference');
    const flickerGroup = this.container.querySelector('#ctrl-group-flicker');

    if (overlayGroup) overlayGroup.style.display = (this.mode === 'overlay') ? 'flex' : 'none';
    if (diffGroup) diffGroup.style.display = (this.mode === 'difference') ? 'flex' : 'none';
    if (flickerGroup) flickerGroup.style.display = (this.mode === 'flicker') ? 'flex' : 'none';
  }

  bindEvents() {
    if (!this.container) return;

    // Mode click
    this.container.querySelectorAll('.comp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.setMode(mode);
      });
    });

    // Opacity slider
    const opacitySlider = this.container.querySelector('#res-toolbar-opacity');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setOpacity(val);
        if (this.onOpacityChange) this.onOpacityChange(val);
      });
    }

    // Flicker toggle
    const flickerBtn = this.container.querySelector('#btn-flicker-toggle');
    if (flickerBtn) {
      flickerBtn.addEventListener('click', () => {
        this.isFlickering = !this.isFlickering;
        const lbl = this.container.querySelector('#lbl-flicker-state');
        if (lbl) lbl.textContent = this.isFlickering ? 'PAUSE FLICKER' : 'START FLICKER';
        flickerBtn.classList.toggle('primary', this.isFlickering);
        if (this.onFlickerToggle) this.onFlickerToggle(this.isFlickering);
      });
    }

    // Flicker speeds
    this.container.querySelectorAll('.btn-speed-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const spd = parseInt(btn.getAttribute('data-speed'), 10);
        this.flickerSpeed = spd;
        this.container.querySelectorAll('.btn-speed-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.onFlickerSpeedChange) this.onFlickerSpeedChange(spd);
      });
    });

    // Nav Tools
    const btnZoomIn = this.container.querySelector('#btn-comp-zoomin');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.onZoomIn());

    const btnZoomOut = this.container.querySelector('#btn-comp-zoomout');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.onZoomOut());

    const btnFit = this.container.querySelector('#btn-comp-fit');
    if (btnFit) btnFit.addEventListener('click', () => this.onFitToView());

    const btnReset = this.container.querySelector('#btn-comp-reset');
    if (btnReset) btnReset.addEventListener('click', () => this.onReset());

    const btnFullscreen = this.container.querySelector('#btn-comp-fullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.onFullscreen());
  }
}

// Export for ES and window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComparisonToolbar;
}
if (typeof window !== 'undefined') {
  window.ComparisonToolbar = ComparisonToolbar;
}
