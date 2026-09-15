/**
 * LUNA-REG: MapLayerPanel Component (Part 7)
 * GIS Layer Stack Controller with visibility toggles and alpha opacity sliders
 * 
 * Layers:
 * 1. Region Boundary Layer (Geodetic bounding polygons)
 * 2. Source Image Footprint Layer (Sensor A coverage)
 * 3. Reference Image Footprint Layer (Sensor B coverage)
 * 4. Overlap Area Layer (Coupling intersection zones)
 * 5. Registration Coverage Layer (Alignment telemetry pins/badges)
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, lunar grey, champagne gold.
 */

function renderMapLayerPanel(options = {}) {
  const {
    layers = {
      regions: { visible: true, opacity: 0.85, count: 0 },
      sourceFootprints: { visible: true, opacity: 0.75, count: 0 },
      referenceFootprints: { visible: true, opacity: 0.75, count: 0 },
      overlapAreas: { visible: true, opacity: 0.65, count: 0 },
      coverage: { visible: true, opacity: 0.90, count: 0 }
    },
    isCollapsed = false
  } = options;

  return `
    <div class="map-layer-panel ${isCollapsed ? 'collapsed' : ''}" id="map-layer-panel" aria-label="Map Layer Visibility and Opacity">
      <div class="layer-panel-header" id="layer-panel-toggle-header">
        <div class="layer-header-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span>GIS MAP LAYERS</span>
        </div>
        <button type="button" class="btn-layer-collapse" id="btn-toggle-layer-panel" title="Collapse/Expand Layer Panel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="${isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline>
          </svg>
        </button>
      </div>

      <div class="layer-panel-body">
        <!-- Layer 1: Region Boundaries -->
        <div class="layer-item-row" data-layer-key="regions">
          <div class="layer-meta-top">
            <label class="layer-checkbox-label">
              <input type="checkbox" 
                     class="layer-toggle-chk" 
                     id="chk-layer-regions" 
                     data-layer="regions" 
                     ${layers.regions.visible ? 'checked' : ''}>
              <span class="layer-color-chip chip-regions" title="Gold solid line"></span>
              <span class="layer-name">Region Boundaries</span>
            </label>
            <span class="layer-count-badge" id="badge-count-regions">${layers.regions.count}</span>
          </div>
          <div class="layer-slider-row">
            <span class="slider-label">Opacity:</span>
            <input type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value="${layers.regions.opacity}" 
                   class="layer-opacity-slider" 
                   id="slider-opacity-regions" 
                   data-layer="regions">
            <span class="slider-val" id="val-opacity-regions">${Math.round(layers.regions.opacity * 100)}%</span>
          </div>
        </div>

        <!-- Layer 2: Source Footprints -->
        <div class="layer-item-row" data-layer-key="sourceFootprints">
          <div class="layer-meta-top">
            <label class="layer-checkbox-label">
              <input type="checkbox" 
                     class="layer-toggle-chk" 
                     id="chk-layer-source" 
                     data-layer="sourceFootprints" 
                     ${layers.sourceFootprints.visible ? 'checked' : ''}>
              <span class="layer-color-chip chip-source" title="Amber dashed footprint"></span>
              <span class="layer-name">Source Footprints</span>
            </label>
            <span class="layer-count-badge" id="badge-count-source">${layers.sourceFootprints.count}</span>
          </div>
          <div class="layer-slider-row">
            <span class="slider-label">Opacity:</span>
            <input type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value="${layers.sourceFootprints.opacity}" 
                   class="layer-opacity-slider" 
                   id="slider-opacity-source" 
                   data-layer="sourceFootprints">
            <span class="slider-val" id="val-opacity-source">${Math.round(layers.sourceFootprints.opacity * 100)}%</span>
          </div>
        </div>

        <!-- Layer 3: Reference Footprints -->
        <div class="layer-item-row" data-layer-key="referenceFootprints">
          <div class="layer-meta-top">
            <label class="layer-checkbox-label">
              <input type="checkbox" 
                     class="layer-toggle-chk" 
                     id="chk-layer-reference" 
                     data-layer="referenceFootprints" 
                     ${layers.referenceFootprints.visible ? 'checked' : ''}>
              <span class="layer-color-chip chip-reference" title="Ivory solid footprint"></span>
              <span class="layer-name">Reference Footprints</span>
            </label>
            <span class="layer-count-badge" id="badge-count-reference">${layers.referenceFootprints.count}</span>
          </div>
          <div class="layer-slider-row">
            <span class="slider-label">Opacity:</span>
            <input type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value="${layers.referenceFootprints.opacity}" 
                   class="layer-opacity-slider" 
                   id="slider-opacity-reference" 
                   data-layer="referenceFootprints">
            <span class="slider-val" id="val-opacity-reference">${Math.round(layers.referenceFootprints.opacity * 100)}%</span>
          </div>
        </div>

        <!-- Layer 4: Overlap Area Layer -->
        <div class="layer-item-row" data-layer-key="overlapAreas">
          <div class="layer-meta-top">
            <label class="layer-checkbox-label">
              <input type="checkbox" 
                     class="layer-toggle-chk" 
                     id="chk-layer-overlap" 
                     data-layer="overlapAreas" 
                     ${layers.overlapAreas.visible ? 'checked' : ''}>
              <span class="layer-color-chip chip-overlap" title="Champagne hatch overlap"></span>
              <span class="layer-name">Pair Overlap Areas</span>
            </label>
            <span class="layer-count-badge" id="badge-count-overlap">${layers.overlapAreas.count}</span>
          </div>
          <div class="layer-slider-row">
            <span class="slider-label">Opacity:</span>
            <input type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value="${layers.overlapAreas.opacity}" 
                   class="layer-opacity-slider" 
                   id="slider-opacity-overlap" 
                   data-layer="overlapAreas">
            <span class="slider-val" id="val-opacity-overlap">${Math.round(layers.overlapAreas.opacity * 100)}%</span>
          </div>
        </div>

        <!-- Layer 5: Registration Coverage -->
        <div class="layer-item-row" data-layer-key="coverage">
          <div class="layer-meta-top">
            <label class="layer-checkbox-label">
              <input type="checkbox" 
                     class="layer-toggle-chk" 
                     id="chk-layer-coverage" 
                     data-layer="coverage" 
                     ${layers.coverage.visible ? 'checked' : ''}>
              <span class="layer-color-chip chip-coverage" title="Green/gold status badges"></span>
              <span class="layer-name">Registration Status Pins</span>
            </label>
            <span class="layer-count-badge" id="badge-count-coverage">${layers.coverage.count}</span>
          </div>
          <div class="layer-slider-row">
            <span class="slider-label">Opacity:</span>
            <input type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value="${layers.coverage.opacity}" 
                   class="layer-opacity-slider" 
                   id="slider-opacity-coverage" 
                   data-layer="coverage">
            <span class="slider-val" id="val-opacity-coverage">${Math.round(layers.coverage.opacity * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderMapLayerPanel = renderMapLayerPanel;
}
if (typeof window !== 'undefined') {
  window.renderMapLayerPanel = renderMapLayerPanel;
}
