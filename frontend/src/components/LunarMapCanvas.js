/**
 * LUNA-REG: LunarMapCanvas Component (Part 7)
 * High-precision multi-layer GIS canvas rendering engine for Lunar GIS exploration
 * 
 * Capabilities:
 * - HiDPI Retina sub-pixel rendering with automatic resize observation
 * - Moon 2000 IAU / IAG cylindrical geodetic coordinate projection
 * - Real-time pan, wheel zoom (0.5x - 25x), fit-to-view, and reset
 * - Layer Rendering (Region Boundaries, Source Footprints, Reference Footprints, Overlap Zones, Status Pins)
 * - Hover & click hit-testing for feature selection
 * - Real-time lunar Lat/Lon geodetic tracking
 * 
 * Palette: Strict zero blue. Obsidian black, deep charcoal, lunar grey, champagne gold.
 */

class LunarMapCanvas {
  constructor(options = {}) {
    this.container = options.container || null;
    this.canvas = null;
    this.ctx = null;

    // Viewport Transform State
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.5;
    this.maxZoom = 25.0;

    // Interaction State
    this.activeTool = 'pan'; // 'pan' | 'select'
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastPanX = 0;
    this.lastPanY = 0;

    // Data Store
    this.regions = [];
    this.products = [];
    this.pairs = [];
    this.selectedFeature = null; // { type: 'region'|'product'|'pair', id: any, data: any }
    this.hoveredFeature = null;

    // Layer Settings
    this.layers = {
      regions: { visible: true, opacity: 0.85 },
      sourceFootprints: { visible: true, opacity: 0.75 },
      referenceFootprints: { visible: true, opacity: 0.75 },
      overlapAreas: { visible: true, opacity: 0.65 },
      coverage: { visible: true, opacity: 0.90 }
    };

    // Callbacks
    this.onFeatureSelect = options.onFeatureSelect || (() => {});
    this.onCoordinateHover = options.onCoordinateHover || (() => {});
    this.onZoomChange = options.onZoomChange || (() => {});

    // Animation / Render Request
    this.rafId = null;
    this.resizeObserver = null;

    // Bind methods
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Mount canvas into target DOM container
   */
  mount(container) {
    this.container = container;
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gis-map-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'grab';

    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.attachEvents();
    this.handleResize();

    // Initial center framing
    this.resetView();
  }

  attachEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('click', this.handleClick);

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
  }

  destroy() {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('wheel', this.handleWheel);
      this.canvas.removeEventListener('click', this.handleClick);
    }
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  handleResize() {
    if (!this.container || !this.canvas) return;

    const rect = this.container.getBoundingClientRect();
    const w = Math.max(rect.width, 300);
    const h = Math.max(rect.height, 200);
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.width = w;
    this.height = h;

    this.requestRender();
  }

  setData(data = {}) {
    if (Array.isArray(data.regions)) this.regions = data.regions;
    if (Array.isArray(data.products)) this.products = data.products;
    if (Array.isArray(data.pairs)) this.pairs = data.pairs;
    this.requestRender();
  }

  setLayerSettings(layers = {}) {
    this.layers = { ...this.layers, ...layers };
    this.requestRender();
  }

  setTool(tool) {
    this.activeTool = tool;
    if (this.canvas) {
      this.canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    }
  }

  setSelectedFeature(feature) {
    this.selectedFeature = feature;
    this.requestRender();
  }

  handleMouseDown(e) {
    if (e.button !== 0) return; // Only primary mouse button

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.lastPanX = this.panX;
    this.lastPanY = this.panY;

    if (this.canvas) {
      this.canvas.style.cursor = 'grabbing';
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Real-time Coordinate Telemetry
    if (mouseX >= 0 && mouseX <= this.width && mouseY >= 0 && mouseY <= this.height) {
      const { lat, lon } = this.screenToLunar(mouseX, mouseY);
      this.onCoordinateHover(lat, lon);

      // Hit-test on hover for pointer changes
      if (!this.isDragging) {
        const hit = this.hitTest(mouseX, mouseY);
        if (hit !== this.hoveredFeature) {
          this.hoveredFeature = hit;
          this.requestRender();
        }
        if (this.activeTool === 'select') {
          this.canvas.style.cursor = hit ? 'pointer' : 'crosshair';
        }
      }
    }

    if (!this.isDragging) return;

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    this.panX = this.lastPanX + dx;
    this.panY = this.lastPanY + dy;

    this.requestRender();
  }

  handleMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.canvas) {
      this.canvas.style.cursor = this.activeTool === 'pan' ? 'grab' : 'crosshair';
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

    if (newZoom !== this.zoom) {
      // Zoom centered on cursor
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.onZoomChange(this.zoom);
      this.requestRender();
    }
  }

  handleClick(e) {
    // Only handle feature selection if not heavily dragged
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const feature = this.hitTest(mouseX, mouseY);
    this.selectedFeature = feature;
    this.onFeatureSelect(feature);
    this.requestRender();
  }

  zoomIn() {
    this.setZoomAtCenter(this.zoom * 1.3);
  }

  zoomOut() {
    this.setZoomAtCenter(this.zoom / 1.3);
  }

  setZoomAtCenter(targetZoom) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

    this.panX = cx - (cx - this.panX) * (newZoom / this.zoom);
    this.panY = cy - (cy - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.onZoomChange(this.zoom);
    this.requestRender();
  }

  resetView() {
    this.zoom = 1.0;
    this.panX = (this.width - 720) / 2;
    this.panY = (this.height - 360) / 2;
    this.onZoomChange(this.zoom);
    this.requestRender();
  }

  /**
   * Fit viewport bounds around all valid geodetic features or selected item
   */
  fitToView(targetFeature = null) {
    let bounds = null;

    if (targetFeature && targetFeature.data) {
      bounds = this.extractFeatureBounds(targetFeature.data);
    } else {
      bounds = this.calculateCombinedBounds();
    }

    if (!bounds) {
      this.resetView();
      return;
    }

    // Convert geodetic bounds to base coordinates (360x180 at zoom 1.0 = 720x360)
    const p1 = this.lunarToBaseScreen(bounds.latMax, bounds.lonMin);
    const p2 = this.lunarToBaseScreen(bounds.latMin, bounds.lonMax);

    const boxW = Math.max(Math.abs(p2.x - p1.x), 40);
    const boxH = Math.max(Math.abs(p2.y - p1.y), 40);

    const padding = 80;
    const scaleX = (this.width - padding * 2) / boxW;
    const scaleY = (this.height - padding * 2) / boxH;
    const fitZoom = Math.max(this.minZoom, Math.min(6.0, Math.min(scaleX, scaleY)));

    const boxCenterX = (p1.x + p2.x) / 2;
    const boxCenterY = (p1.y + p2.y) / 2;

    this.zoom = fitZoom;
    this.panX = this.width / 2 - boxCenterX * fitZoom;
    this.panY = this.height / 2 - boxCenterY * fitZoom;

    this.onZoomChange(this.zoom);
    this.requestRender();
  }

  calculateCombinedBounds() {
    let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
    let found = false;

    // Check regions
    this.regions.forEach(r => {
      const b = this.extractFeatureBounds(r);
      if (b) {
        latMin = Math.min(latMin, b.latMin);
        latMax = Math.max(latMax, b.latMax);
        lonMin = Math.min(lonMin, b.lonMin);
        lonMax = Math.max(lonMax, b.lonMax);
        found = true;
      }
    });

    // Check products
    this.products.forEach(p => {
      const b = this.extractFeatureBounds(p);
      if (b) {
        latMin = Math.min(latMin, b.latMin);
        latMax = Math.max(latMax, b.latMax);
        lonMin = Math.min(lonMin, b.lonMin);
        lonMax = Math.max(lonMax, b.lonMax);
        found = true;
      }
    });

    return found ? { latMin, latMax, lonMin, lonMax } : null;
  }

  extractFeatureBounds(item) {
    if (!item) return null;

    const latMin = item.lat_min ?? item.footprint_lat_min ?? item.min_latitude;
    const latMax = item.lat_max ?? item.footprint_lat_max ?? item.max_latitude;
    const lonMin = item.lon_min ?? item.footprint_lon_min ?? item.min_longitude;
    const lonMax = item.lon_max ?? item.footprint_lon_max ?? item.max_longitude;

    if (latMin !== undefined && latMin !== null &&
        latMax !== undefined && latMax !== null &&
        lonMin !== undefined && lonMin !== null &&
        lonMax !== undefined && lonMax !== null) {
      return {
        latMin: Number(latMin),
        latMax: Number(latMax),
        lonMin: Number(lonMin),
        lonMax: Number(lonMax)
      };
    }

    return null;
  }

  /**
   * Geodetic Lunar Coordinate Mapping (Equirectangular Projection)
   * Moon: Lon [-180°..+180°], Lat [-90°..+90°]
   * Base Map: 720 px width, 360 px height
   */
  lunarToBaseScreen(lat, lon) {
    const x = ((lon + 180) / 360) * 720;
    const y = ((90 - lat) / 180) * 360;
    return { x, y };
  }

  baseScreenToLunar(x, y) {
    const lon = (x / 720) * 360 - 180;
    const lat = 90 - (y / 360) * 180;
    return { lat, lon };
  }

  screenToLunar(screenX, screenY) {
    const baseX = (screenX - this.panX) / this.zoom;
    const baseY = (screenY - this.panY) / this.zoom;
    return this.baseScreenToLunar(baseX, baseY);
  }

  lunarToScreen(lat, lon) {
    const { x: baseX, y: baseY } = this.lunarToBaseScreen(lat, lon);
    return {
      x: baseX * this.zoom + this.panX,
      y: baseY * this.zoom + this.panY
    };
  }

  requestRender() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => this.render());
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Deep obsidian background
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Save initial state for viewport transforms
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw Moon Basemap Surface (720 x 360)
    this.drawLunarBasemap(ctx);

    // 2. Draw Geodetic Graticule Grid
    this.drawGraticule(ctx);

    // 3. Draw Layers (Regions, Footprints, Overlaps, Status Pins)
    if (this.layers.regions.visible) {
      this.drawRegionBoundaries(ctx, this.layers.regions.opacity);
    }
    if (this.layers.sourceFootprints.visible) {
      this.drawSourceFootprints(ctx, this.layers.sourceFootprints.opacity);
    }
    if (this.layers.referenceFootprints.visible) {
      this.drawReferenceFootprints(ctx, this.layers.referenceFootprints.opacity);
    }
    if (this.layers.overlapAreas.visible) {
      this.drawOverlapAreas(ctx, this.layers.overlapAreas.opacity);
    }
    if (this.layers.coverage.visible) {
      this.drawRegistrationStatusPins(ctx, this.layers.coverage.opacity);
    }

    // 4. Highlight Selected Feature
    if (this.selectedFeature) {
      this.drawSelectionHighlight(ctx, this.selectedFeature);
    }

    ctx.restore();
  }

  drawLunarBasemap(ctx) {
    // Lunar sphere / surface gradient in equirectangular projection
    const grad = ctx.createLinearGradient(0, 0, 0, 360);
    grad.addColorStop(0.0, '#101216');
    grad.addColorStop(0.5, '#16191f');
    grad.addColorStop(1.0, '#101216');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 360);

    // Lunar Maria Silhouettes (ISRO / IAU landmarks: Mare Imbrium, Serenitatis, Tranquillitatis, South Pole)
    ctx.fillStyle = 'rgba(10, 11, 14, 0.55)';
    // Mare Imbrium
    ctx.beginPath();
    ctx.arc(320, 110, 52, 0, Math.PI * 2);
    ctx.fill();
    // Mare Serenitatis
    ctx.beginPath();
    ctx.arc(395, 120, 38, 0, Math.PI * 2);
    ctx.fill();
    // Mare Tranquillitatis
    ctx.beginPath();
    ctx.arc(420, 160, 42, 0, Math.PI * 2);
    ctx.fill();
    // Oceanus Procellarum
    ctx.beginPath();
    ctx.ellipse(240, 140, 70, 50, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // South Pole Cold Trap PSR Zone (Lat < -70° => Y > 320)
    ctx.fillStyle = 'rgba(6, 7, 9, 0.85)';
    ctx.fillRect(0, 320, 720, 40);

    // Lunar Map Boundary Line
    ctx.strokeStyle = '#2d3340';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 720, 360);
  }

  drawGraticule(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(142, 147, 157, 0.15)';
    ctx.lineWidth = 0.6;
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(142, 147, 157, 0.45)';

    // Parallels (every 30° Lat)
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * 360;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(720, y);
      ctx.stroke();

      const label = lat === 0 ? '0°' : (lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`);
      ctx.fillText(label, 4, y - 2);
    }

    // Meridians (every 45° Lon)
    for (let lon = -135; lon <= 135; lon += 45) {
      const x = ((lon + 180) / 360) * 720;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 360);
      ctx.stroke();

      const label = lon === 0 ? '0°' : (lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`);
      ctx.fillText(label, x + 2, 356);
    }

    // Prime Meridian (0°) and Equator (0°) highlighted
    ctx.strokeStyle = 'rgba(223, 192, 138, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(360, 0);
    ctx.lineTo(360, 360);
    ctx.moveTo(0, 180);
    ctx.lineTo(720, 180);
    ctx.stroke();

    ctx.restore();
  }

  drawRegionBoundaries(ctx, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;

    this.regions.forEach(r => {
      const b = this.extractFeatureBounds(r);
      if (!b) return;

      const p1 = this.lunarToBaseScreen(b.latMax, b.lonMin);
      const p2 = this.lunarToBaseScreen(b.latMin, b.lonMax);
      const w = Math.max(p2.x - p1.x, 3);
      const h = Math.max(p2.y - p1.y, 3);

      // Gold solid border with soft wash
      ctx.fillStyle = 'rgba(223, 192, 138, 0.08)';
      ctx.fillRect(p1.x, p1.y, w, h);

      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p1.x, p1.y, w, h);

      // Region Name Tag
      ctx.font = '9px monospace';
      ctx.fillStyle = '#dfc08a';
      ctx.fillText(r.name || `REG-#${r.id}`, p1.x + 2, p1.y - 3);
    });

    ctx.restore();
  }

  drawSourceFootprints(ctx, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#e5a93b'; // Warm Amber
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);

    this.products.forEach(p => {
      const b = this.extractFeatureBounds(p);
      if (!b) return;

      const p1 = this.lunarToBaseScreen(b.latMax, b.lonMin);
      const p2 = this.lunarToBaseScreen(b.latMin, b.lonMax);
      const w = Math.max(p2.x - p1.x, 2);
      const h = Math.max(p2.y - p1.y, 2);

      ctx.fillStyle = 'rgba(229, 169, 59, 0.08)';
      ctx.fillRect(p1.x, p1.y, w, h);
      ctx.strokeRect(p1.x, p1.y, w, h);
    });

    ctx.restore();
  }

  drawReferenceFootprints(ctx, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#eaebee'; // Off-white ivory
    ctx.lineWidth = 1.0;
    ctx.setLineDash([]);

    this.products.forEach(p => {
      const b = this.extractFeatureBounds(p);
      if (!b) return;

      const p1 = this.lunarToBaseScreen(b.latMax, b.lonMin);
      const p2 = this.lunarToBaseScreen(b.latMin, b.lonMax);
      const w = Math.max(p2.x - p1.x, 2);
      const h = Math.max(p2.y - p1.y, 2);

      ctx.strokeRect(p1.x - 1, p1.y - 1, w + 2, h + 2);
    });

    ctx.restore();
  }

  drawOverlapAreas(ctx, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;

    this.pairs.forEach(pair => {
      // Find source & reference products for geometric intersection
      const srcProd = this.products.find(p => p.id === pair.source_product_id);
      const refProd = this.products.find(p => p.id === pair.reference_product_id);

      if (!srcProd || !refProd) return;

      const bSrc = this.extractFeatureBounds(srcProd);
      const bRef = this.extractFeatureBounds(refProd);

      if (!bSrc || !bRef) return;

      // Compute intersection bounds
      const intLatMin = Math.max(bSrc.latMin, bRef.latMin);
      const intLatMax = Math.min(bSrc.latMax, bRef.latMax);
      const intLonMin = Math.max(bSrc.lonMin, bRef.lonMin);
      const intLonMax = Math.min(bSrc.lonMax, bRef.lonMax);

      if (intLatMin < intLatMax && intLonMin < intLonMax) {
        const p1 = this.lunarToBaseScreen(intLatMax, intLonMin);
        const p2 = this.lunarToBaseScreen(intLatMin, intLonMax);
        const w = Math.max(p2.x - p1.x, 2);
        const h = Math.max(p2.y - p1.y, 2);

        // Semi-transparent champagne gold overlap
        ctx.fillStyle = 'rgba(223, 192, 138, 0.22)';
        ctx.fillRect(p1.x, p1.y, w, h);

        ctx.strokeStyle = '#dfc08a';
        ctx.lineWidth = 1.0;
        ctx.strokeRect(p1.x, p1.y, w, h);
      }
    });

    ctx.restore();
  }

  drawRegistrationStatusPins(ctx, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;

    this.pairs.forEach(pair => {
      const srcProd = this.products.find(p => p.id === pair.source_product_id);
      if (!srcProd) return;

      const b = this.extractFeatureBounds(srcProd);
      if (!b) return;

      const centerLat = (b.latMin + b.latMax) / 2;
      const centerLon = (b.lonMin + b.lonMax) / 2;
      const p = this.lunarToBaseScreen(centerLat, centerLon);

      const isVerified = (pair.overlap_status || '').toUpperCase() === 'VERIFIED';
      const pinColor = isVerified ? '#5cb85c' : '#dfc08a';

      // Circular telemetry pin
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pinColor;
      ctx.fill();

      ctx.strokeStyle = '#07080a';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.restore();
  }

  drawSelectionHighlight(ctx, feature) {
    const b = this.extractFeatureBounds(feature.data);
    if (!b) return;

    const p1 = this.lunarToBaseScreen(b.latMax, b.lonMin);
    const p2 = this.lunarToBaseScreen(b.latMin, b.lonMax);
    const w = Math.max(p2.x - p1.x, 4);
    const h = Math.max(p2.y - p1.y, 4);

    ctx.save();
    ctx.strokeStyle = '#dfc08a';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(p1.x - 3, p1.y - 3, w + 6, h + 6);

    // Corner targeting reticle ticks
    ctx.setLineDash([]);
    const tick = 6;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(p1.x - 5, p1.y - 5 + tick);
    ctx.lineTo(p1.x - 5, p1.y - 5);
    ctx.lineTo(p1.x - 5 + tick, p1.y - 5);
    // Top-right
    ctx.moveTo(p1.x + w + 5 - tick, p1.y - 5);
    ctx.lineTo(p1.x + w + 5, p1.y - 5);
    ctx.lineTo(p1.x + w + 5, p1.y - 5 + tick);
    // Bottom-left
    ctx.moveTo(p1.x - 5, p1.y + h + 5 - tick);
    ctx.lineTo(p1.x - 5, p1.y + h + 5);
    ctx.lineTo(p1.x - 5 + tick, p1.y + h + 5);
    // Bottom-right
    ctx.moveTo(p1.x + w + 5 - tick, p1.y + h + 5);
    ctx.lineTo(p1.x + w + 5, p1.y + h + 5);
    ctx.lineTo(p1.x + w + 5, p1.y + h + 5 - tick);
    ctx.stroke();

    ctx.restore();
  }

  hitTest(screenX, screenY) {
    const { lat, lon } = this.screenToLunar(screenX, screenY);

    // 1. Hit-test pairs
    for (let i = 0; i < this.pairs.length; i++) {
      const pair = this.pairs[i];
      const srcProd = this.products.find(p => p.id === pair.source_product_id);
      if (srcProd) {
        const b = this.extractFeatureBounds(srcProd);
        if (b && this.pointInBounds(lat, lon, b)) {
          return { type: 'pair', id: pair.id, data: pair };
        }
      }
    }

    // 2. Hit-test products
    for (let i = 0; i < this.products.length; i++) {
      const prod = this.products[i];
      const b = this.extractFeatureBounds(prod);
      if (b && this.pointInBounds(lat, lon, b)) {
        return { type: 'product', id: prod.id, data: prod };
      }
    }

    // 3. Hit-test regions
    for (let i = 0; i < this.regions.length; i++) {
      const reg = this.regions[i];
      const b = this.extractFeatureBounds(reg);
      if (b && this.pointInBounds(lat, lon, b)) {
        return { type: 'region', id: reg.id, data: reg };
      }
    }

    return null;
  }

  pointInBounds(lat, lon, b) {
    // Add small tolerance for very small footprints
    const tol = 1.0 / this.zoom;
    return lat >= (b.latMin - tol) && lat <= (b.latMax + tol) &&
           lon >= (b.lonMin - tol) && lon <= (b.lonMax + tol);
  }
}

if (typeof exports !== 'undefined') {
  exports.LunarMapCanvas = LunarMapCanvas;
}
if (typeof window !== 'undefined') {
  window.LunarMapCanvas = LunarMapCanvas;
}
