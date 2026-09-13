/**
 * LUNA-REG: LayerControlPanel Component
 * Part 5: Analysis Tools Workspace
 * 
 * Manages multi-spectral lunar layers:
 * - Source, Reference, Registered, Overlay, Difference
 * - Layer visibility toggles
 * - Per-layer opacity sliders (0 - 100%)
 * - Layer ordering (Move Up, Move Down)
 * - Blend mode selector (Normal, Screen, Multiply, Difference)
 * - Strict backend limitation: labels ungenerated layers as PENDING
 */

class LayerControlPanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.layers = [
      {
        id: 'source',
        name: '1. SOURCE RASTER (INPUT)',
        instrument: 'TMC-2',
        resolution: '5.0 m/px',
        visible: true,
        opacity: 100,
        blendMode: 'normal',
        isGenerated: true,
        badge: 'ACTIVE'
      },
      {
        id: 'reference',
        name: '2. REFERENCE RASTER (BASE)',
        instrument: 'OHRC',
        resolution: '0.32 m/px',
        visible: true,
        opacity: 100,
        blendMode: 'normal',
        isGenerated: true,
        badge: 'ACTIVE'
      },
      {
        id: 'overlay',
        name: '3. OVERLAY BLEND COMPOSITE',
        instrument: 'TMC-2 + OHRC',
        resolution: 'Dynamic',
        visible: false,
        opacity: 50,
        blendMode: 'normal',
        isGenerated: true,
        badge: 'GPU COMPOSITE'
      },
      {
        id: 'registered',
        name: '4. REGISTERED RASTER',
        instrument: 'Homography Transformed',
        resolution: 'Resampled',
        visible: false,
        opacity: 100,
        blendMode: 'normal',
        isGenerated: false,
        badge: 'PENDING'
      },
      {
        id: 'difference',
        name: '5. DIFFERENCE RESIDUAL MAP',
        instrument: 'Radiometric Residuals',
        resolution: 'Delta Grid',
        visible: false,
        opacity: 100,
        blendMode: 'difference',
        isGenerated: false,
        badge: 'PENDING'
      }
    ];

    // Callbacks
    this.onLayerChange = options.onLayerChange || (() => {});
  }

  setLayerVisibility(id, visible) {
    const layer = this.layers.find(l => l.id === id);
    if (layer) {
      layer.visible = visible;
      this.notifyChange();
    }
  }

  setLayerOpacity(id, opacity) {
    const layer = this.layers.find(l => l.id === id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(100, opacity));
      const lbl = this.container ? this.container.querySelector(`#layer-op-val-${id}`) : null;
      if (lbl) lbl.textContent = `${layer.opacity}%`;
      this.notifyChange();
    }
  }

  setLayerBlendMode(id, mode) {
    const layer = this.layers.find(l => l.id === id);
    if (layer) {
      layer.blendMode = mode;
      this.notifyChange();
    }
  }

  moveLayerUp(index) {
    if (index > 0) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index - 1];
      this.layers[index - 1] = temp;
      this.render();
      this.notifyChange();
    }
  }

  moveLayerDown(index) {
    if (index < this.layers.length - 1) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index + 1];
      this.layers[index + 1] = temp;
      this.render();
      this.notifyChange();
    }
  }

  notifyChange() {
    if (this.onLayerChange) {
      this.onLayerChange([...this.layers]);
    }
  }

  updateInstrumentInfo(sourceInstrument, refInstrument, sourceRes, refRes) {
    const srcLayer = this.layers.find(l => l.id === 'source');
    if (srcLayer) {
      if (sourceInstrument) srcLayer.instrument = sourceInstrument;
      if (sourceRes) srcLayer.resolution = `${sourceRes} m/px`;
    }

    const refLayer = this.layers.find(l => l.id === 'reference');
    if (refLayer) {
      if (refInstrument) refLayer.instrument = refInstrument;
      if (refRes) refLayer.resolution = `${refRes} m/px`;
    }

    this.render();
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="layer-panel-card">
        <div class="layer-panel-top">
          <div class="layer-panel-title-wrap">
            <div class="res-badge-gold">GIS RASTER ENGINE</div>
            <h3 class="layer-panel-heading">LAYER MANAGEMENT</h3>
          </div>
          <span class="layer-count-badge">${this.layers.length} LAYERS</span>
        </div>

        <p class="layer-panel-desc">
          Toggle layer visibility, calibrate individual alpha transparency, re-order rendering stack, and adjust blending modes.
        </p>

        <div class="layers-stack-list" id="layers-stack-list">
          ${this.layers.map((layer, idx) => `
            <div class="layer-item-row ${layer.isGenerated ? '' : 'pending'} ${layer.visible ? 'visible' : ''}" data-layer-id="${layer.id}">
              
              <!-- Header / Visibility -->
              <div class="layer-row-top">
                <label class="layer-vis-chk-wrap">
                  <input type="checkbox" class="layer-vis-chk" data-id="${layer.id}" ${layer.visible ? 'checked' : ''} ${layer.isGenerated ? '' : 'disabled'}>
                  <span class="layer-vis-custom"></span>
                  <span class="layer-name ${layer.isGenerated ? '' : 'muted'}">${layer.name}</span>
                </label>

                <div class="layer-badges-group">
                  <span class="layer-status-pill ${layer.isGenerated ? 'active' : 'pending'}">${layer.badge}</span>
                  <div class="layer-order-btns">
                    <button type="button" class="btn-order-move" data-idx="${idx}" data-dir="up" title="Move Layer Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="btn-order-move" data-idx="${idx}" data-dir="down" title="Move Layer Down" ${idx === this.layers.length - 1 ? 'disabled' : ''}>▼</button>
                  </div>
                </div>
              </div>

              <!-- Metadata ticker -->
              <div class="layer-meta-ticker">
                <span class="meta-tag">SENSOR: <strong>${layer.instrument}</strong></span>
                <span class="meta-sep">•</span>
                <span class="meta-tag">GSD: <strong>${layer.resolution}</strong></span>
              </div>

              <!-- Controls (Opacity & Blend Mode) -->
              <div class="layer-controls-grid">
                <div class="layer-op-slider-wrap">
                  <span class="ctrl-lbl">OPACITY:</span>
                  <input type="range" class="layer-slider" data-id="${layer.id}" min="0" max="100" value="${layer.opacity}" ${layer.isGenerated ? '' : 'disabled'} aria-label="${layer.name} Opacity">
                  <span class="slider-val" id="layer-op-val-${layer.id}">${layer.opacity}%</span>
                </div>

                <div class="layer-blend-wrap">
                  <span class="ctrl-lbl">BLEND:</span>
                  <select class="layer-blend-select" data-id="${layer.id}" ${layer.isGenerated ? '' : 'disabled'} aria-label="${layer.name} Blend Mode">
                    <option value="normal" ${layer.blendMode === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="difference" ${layer.blendMode === 'difference' ? 'selected' : ''}>Difference</option>
                    <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
                    <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
                  </select>
                </div>
              </div>

            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Visibility toggles
    this.container.querySelectorAll('.layer-vis-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = chk.getAttribute('data-id');
        this.setLayerVisibility(id, e.target.checked);
      });
    });

    // Opacity sliders
    this.container.querySelectorAll('.layer-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = slider.getAttribute('data-id');
        this.setLayerOpacity(id, parseInt(e.target.value, 10));
      });
    });

    // Blend modes
    this.container.querySelectorAll('.layer-blend-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const id = sel.getAttribute('data-id');
        this.setLayerBlendMode(id, e.target.value);
      });
    });

    // Order buttons
    this.container.querySelectorAll('.btn-order-move').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const dir = btn.getAttribute('data-dir');
        if (dir === 'up') this.moveLayerUp(idx);
        else if (dir === 'down') this.moveLayerDown(idx);
      });
    });
  }
}

window.LayerControlPanel = LayerControlPanel;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LayerControlPanel;
}
