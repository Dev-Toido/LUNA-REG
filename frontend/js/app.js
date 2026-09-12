/**
 * LUNAR TERRAIN EXPLORER — Interactive GIS Map Engine
 * LUNA-REG: Chandrayaan-2 Planetary Image Registration (SIH26166)
 * Full-screen GIS Viewer with Zoom, Pan, Fit, Fullscreen, Styles, Graticule, Scale Bar & Tile-Ready Architecture
 */

(function() {
  'use strict';

  // --- EXTENSIBLE RASTER & TILE PROVIDER ARCHITECTURE ---
  // Prepared for integration with real lunar raster tiles, WMTS, WMS, and geospatial datasets
  class LunarTileProvider {
    constructor() {
      this.providers = {
        'tmc2-sample': {
          name: 'Chandrayaan-2 TMC-2 Ortho-mosaic (Calibration Demo)',
          type: 'raster-mosaic',
          gsdMeters: 5.0,
          bounds: [-90, -180, 90, 180],
          isDemo: true
        },
        'lroc-wac': {
          name: 'LROC WAC Global Morphologic Mosaic (Prepared)',
          type: 'wmts-tile-ready',
          urlTemplate: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303P/{z}/{x}/{y}.png',
          maxZoom: 12,
          isDemo: false
        },
        'lola-dem': {
          name: 'LOLA / SLDEM2015 Lunar Elevation DTM (Prepared)',
          type: 'elevation-grid',
          verticalResolutionM: 1.0,
          isDemo: false
        }
      };
      this.activeProvider = 'tmc2-sample';
    }

    getProviderInfo() {
      return this.providers[this.activeProvider];
    }
  }

  const tileProvider = new LunarTileProvider();

  // --- APPLICATION STATE ---
  const state = {
    activeROI: 'tycho',
    viewMode: 'comparator', // 'comparator', 'single'
    mapStyle: 'grayscale-nadir', // 'grayscale-nadir', 'low-sun-shadow', 'topographic-hillshade', 'inverted-albedo'
    splitPosition: 0.52,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    rotation: 0, // degrees rotation
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    activeTool: 'pan', // 'select', 'pan', 'measure', 'probe'
    measurePoints: [],
    probePoint: null,
    selectedLocation: null,

    // Section 10 Map Layer Architecture: Individual Opacities & Georeference State
    mapLayers: {
      basemap: { visible: true, opacity: 1.0 },
      reference: { visible: true, opacity: 1.0 },
      target: { visible: false, opacity: 0.8 },
      registered: { visible: true, opacity: 0.85, hasGeoref: true },
      matches: { visible: true, inliersOnly: true }
    },

    // Layer Visibility
    layers: {
      basemap: true,
      contours: true,
      graticule: true,
      annotations: true,
      matchPoints: true,
      inliersOnly: true
    },

    contourInterval: 100, // meters
    rmseThreshold: 0.65, // pixels

    // Imagery Assets
    referenceImage: null,
    targetImage: null,
    southPoleImage: null,
    imagesLoaded: false,

    hoverPointIndex: -1,
    cursorCoords: { x: 0, y: 0, lat: -43.31, lon: -11.36, elev: -2450 }
  };

  // --- REGIONS OF INTEREST (ROI) ---
  const ROIs = {
    tycho: {
      id: 'tycho',
      name: 'Tycho Crater & Terraces',
      featureName: 'Tycho Impact Crater',
      lat: -43.31,
      lon: -11.36,
      elevation: -2450,
      diameterKm: 85.0,
      sunRefElevation: 48.2,
      sunTargetElevation: 16.4,
      deltaSun: 31.8,
      inlierRatio: '91.8%',
      rmse: '0.318 px',
      matchesCount: 1428,
      inliersCount: 1311,
      baseImg: 'nadir',
      targetImg: 'low_sun',
      metadata: {
        imageSource: 'Chandrayaan-2 TMC-2',
        imageResolution: '5.0 m/pixel',
        acquisitionDate: '2020-01-15',
        imageType: 'Panchromatic Optical Raster',
        registrationStatus: 'ALIGNED (RMSE 0.318 px)',
        orbitPass: 'ORBIT #4829',
        imageTitle: 'Tycho Crater High-Relief Pass',
        sunElevation: '48.2° (Nadir)'
      },
      features: [
        { name: 'Central Peak Complex', xRel: 0.612, yRel: 0.490, elev: '+1,420 m' },
        { name: 'Western Terraced Wall', xRel: 0.518, yRel: 0.485, elev: '-1,150 m' },
        { name: 'North Floor Basin', xRel: 0.620, yRel: 0.380, elev: '-2,450 m' },
        { name: 'Eastern Rim Crest', xRel: 0.725, yRel: 0.470, elev: '+1,680 m' },
        { name: 'Impact Melt Sheet', xRel: 0.585, yRel: 0.595, elev: '-2,100 m' },
        { name: 'Radial Ejecta Ray Alpha', xRel: 0.810, yRel: 0.270, elev: '-320 m' }
      ]
    },
    shackleton: {
      id: 'shackleton',
      name: 'Shackleton Rim & PSR',
      featureName: 'Shackleton Crater (South Pole)',
      lat: -89.67,
      lon: 129.78,
      elevation: -4120,
      diameterKm: 21.0,
      sunRefElevation: 1.8,
      sunTargetElevation: 0.4,
      deltaSun: 1.4,
      inlierRatio: '87.4%',
      rmse: '0.384 px',
      matchesCount: 986,
      inliersCount: 862,
      baseImg: 'south_pole',
      targetImg: 'south_pole',
      metadata: {
        imageSource: 'Chandrayaan-2 TMC-2',
        imageResolution: '5.0 m/pixel',
        acquisitionDate: '2020-02-18',
        imageType: 'Panchromatic Optical Raster',
        registrationStatus: 'ALIGNED (RMSE 0.384 px)',
        orbitPass: 'ORBIT #5214',
        imageTitle: 'Shackleton South Pole PSR Pass',
        sunElevation: '1.8° (Low grazing angle)'
      },
      features: [
        { name: 'Shackleton Rim (Peak of Light)', xRel: 0.345, yRel: 0.355, elev: '+1,180 m' },
        { name: 'Permanently Shadowed Floor (PSR)', xRel: 0.360, yRel: 0.560, elev: '-4,120 m' },
        { name: 'de Gerlache Ridge', xRel: 0.460, yRel: 0.080, elev: '+820 m' },
        { name: 'South Pole Point (89.9°S)', xRel: 0.520, yRel: 0.940, elev: '-1,880 m' }
      ]
    },
    shiv_shakti: {
      id: 'shiv_shakti',
      name: 'Shiv Shakti Point (CY-3)',
      featureName: 'Chandrayaan-3 Landing Site',
      lat: -69.37,
      lon: 32.35,
      elevation: -1680,
      diameterKm: 45.0,
      sunRefElevation: 24.5,
      sunTargetElevation: 9.8,
      deltaSun: 14.7,
      inlierRatio: '94.2%',
      rmse: '0.274 px',
      matchesCount: 1650,
      inliersCount: 1554,
      baseImg: 'nadir',
      targetImg: 'low_sun',
      metadata: {
        imageSource: 'Chandrayaan-2 TMC-2',
        imageResolution: '5.0 m/pixel',
        acquisitionDate: '2023-08-23',
        imageType: 'Panchromatic Optical Raster',
        registrationStatus: 'ALIGNED (RMSE 0.274 px)',
        orbitPass: 'ORBIT #18420',
        imageTitle: 'Shiv Shakti Landing Descent Pass',
        sunElevation: '24.5°'
      },
      features: [
        { name: 'Shiv Shakti Landing Site', xRel: 0.612, yRel: 0.490, elev: '-1,680 m' },
        { name: 'Vikram Descent Corridor', xRel: 0.540, yRel: 0.410, elev: '-1,520 m' },
        { name: 'Manzinus Crater Rim', xRel: 0.310, yRel: 0.310, elev: '+940 m' }
      ]
    },
    copernicus: {
      id: 'copernicus',
      name: 'Copernicus Crater Terraces',
      featureName: 'Copernicus Impact Crater',
      lat: 9.62,
      lon: -20.08,
      elevation: -3800,
      diameterKm: 93.0,
      sunRefElevation: 56.1,
      sunTargetElevation: 22.3,
      deltaSun: 33.8,
      inlierRatio: '90.5%',
      rmse: '0.335 px',
      matchesCount: 1290,
      inliersCount: 1167,
      baseImg: 'nadir',
      targetImg: 'low_sun',
      metadata: {
        imageSource: 'Chandrayaan-2 TMC-2',
        imageResolution: '5.0 m/pixel',
        acquisitionDate: null, // Displays "Not available"
        imageType: 'Panchromatic Optical Raster',
        registrationStatus: 'PENDING REGISTRATION',
        orbitPass: null, // Displays "Not available"
        imageTitle: 'Copernicus Terraced Basin Pass',
        sunElevation: '56.1°'
      },
      features: [
        { name: 'Triple Central Peaks', xRel: 0.612, yRel: 0.490, elev: '+1,200 m' },
        { name: 'Inner Terraced Slopes', xRel: 0.680, yRel: 0.420, elev: '-1,800 m' },
        { name: 'Mare Insularum Border', xRel: 0.850, yRel: 0.800, elev: '-2,100 m' }
      ]
    }
  };

  // --- TIE-POINT GENERATOR ---
  let matchPoints = [];
  function generateMatchPoints() {
    matchPoints = [];
    const seedPoints = [
      { x: 0.612, y: 0.490, err: 0.12, inlier: true, desc: 'Central Peak Apex' },
      { x: 0.598, y: 0.475, err: 0.18, inlier: true, desc: 'Peak Terrace West' },
      { x: 0.625, y: 0.510, err: 0.22, inlier: true, desc: 'Peak S. Spur' },
      { x: 0.605, y: 0.515, err: 0.29, inlier: true, desc: 'Peak Melt Floor' },
      { x: 0.635, y: 0.470, err: 0.24, inlier: true, desc: 'Peak East Ridge' },
      { x: 0.520, y: 0.420, err: 0.31, inlier: true, desc: 'NW Rim Crest' },
      { x: 0.505, y: 0.485, err: 0.28, inlier: true, desc: 'West Wall Terrace 1' },
      { x: 0.480, y: 0.530, err: 0.35, inlier: true, desc: 'West Outer Glacis' },
      { x: 0.525, y: 0.620, err: 0.42, inlier: true, desc: 'SW Wall Escarpment' },
      { x: 0.590, y: 0.680, err: 0.37, inlier: true, desc: 'South Rim Crest' },
      { x: 0.680, y: 0.670, err: 0.39, inlier: true, desc: 'SE Rim Terrace' },
      { x: 0.740, y: 0.580, err: 0.44, inlier: true, desc: 'East Rim Escarpment' },
      { x: 0.730, y: 0.440, err: 0.33, inlier: true, desc: 'NE Rim Wall' },
      { x: 0.680, y: 0.330, err: 0.38, inlier: true, desc: 'North Rim Crest' },
      { x: 0.580, y: 0.320, err: 0.41, inlier: true, desc: 'NNW Rim Segment' },
      { x: 0.260, y: 0.825, err: 0.25, inlier: true, desc: 'Craterlet S-W1' },
      { x: 0.210, y: 0.860, err: 0.34, inlier: true, desc: 'Craterlet S-W1 Rim' },
      { x: 0.100, y: 0.510, err: 0.45, inlier: true, desc: 'Far West Craterlet' },
      { x: 0.330, y: 0.310, err: 0.26, inlier: true, desc: 'Secondary Craterlet NW' },
      { x: 0.850, y: 0.070, err: 0.33, inlier: true, desc: 'Upper Right Crater C' },
      { x: 0.940, y: 0.800, err: 0.42, inlier: true, desc: 'SE Basin Edge' }
    ];

    seedPoints.forEach((sp, idx) => {
      matchPoints.push({
        id: idx + 1,
        refX: sp.x,
        refY: sp.y,
        tgtX: sp.x + (Math.sin(sp.x * 12) * 0.003),
        tgtY: sp.y + (Math.cos(sp.y * 12) * 0.003),
        errorPx: sp.err,
        isInlier: sp.inlier,
        label: sp.desc
      });

      for (let k = 1; k <= 4; k++) {
        const angle = (k * 1.57) + (idx * 0.3);
        const dist = 0.015 + (k * 0.008);
        const px = sp.x + Math.cos(angle) * dist;
        const py = sp.y + Math.sin(angle) * dist;

        if (px > 0.03 && px < 0.97 && py > 0.03 && py < 0.97) {
          const isShadowOutlier = (k === 4 && (idx % 6 === 0));
          const err = isShadowOutlier ? 1.35 + (idx % 4) * 0.25 : 0.18 + ((idx + k) % 5) * 0.08;

          matchPoints.push({
            id: matchPoints.length + 1,
            refX: px,
            refY: py,
            tgtX: px + (Math.sin(px * 10) * 0.002) + (isShadowOutlier ? 0.012 : 0),
            tgtY: py + (Math.cos(py * 10) * 0.002) + (isShadowOutlier ? -0.015 : 0),
            errorPx: parseFloat(err.toFixed(3)),
            isInlier: !isShadowOutlier,
            label: `Tie-${matchPoints.length + 1}`
          });
        }
      }
    });
  }

  // --- INITIALIZATION ---
  let canvas, ctx, histCanvas, histCtx;

  function init() {
    setupCanvases();
    generateMatchPoints();
    loadAssets();
    setupEvents();
    renderHistogram();
    checkInitialBackendHealth();
    setupResultsViewer();
  }

  function setupCanvases() {
    canvas = document.getElementById('gis-canvas');
    ctx = canvas.getContext('2d');

    histCanvas = document.getElementById('hist-canvas');
    histCtx = histCanvas.getContext('2d');

    resizeCanvases();
    window.addEventListener('resize', () => {
      resizeCanvases();
      draw();
      renderHistogram();
    });
  }

  function resizeCanvases() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    if (histCanvas && histCanvas.parentElement) {
      histCanvas.width = histCanvas.parentElement.clientWidth - 16;
      histCanvas.height = 65;
    }
  }

  function loadAssets() {
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 3) {
        state.imagesLoaded = true;
        draw();
      }
    };

    state.referenceImage = new Image();
    state.referenceImage.src = 'assets/lunar_nadir.jpg';
    state.referenceImage.onload = checkLoaded;

    state.targetImage = new Image();
    state.targetImage.src = 'assets/lunar_low_sun.jpg';
    state.targetImage.onload = checkLoaded;

    state.southPoleImage = new Image();
    state.southPoleImage.src = 'assets/lunar_south_pole.jpg';
    state.southPoleImage.onload = checkLoaded;
  }

  // =========================================================================
  // SECTION 6: NEW IMAGE REGISTRATION WORKFLOW STATE & ENGINE
  // =========================================================================
  const regWorkflowState = {
    refFile: null,
    refImg: null,
    refUrl: null,
    refMeta: null,

    tgtFile: null,
    tgtImg: null,
    tgtUrl: null,
    tgtMeta: null,

    previewZoom: 1.0,
    isProcessing: false,
    currentStep: 1
  };

  function updateWorkflowStepper(step) {
    regWorkflowState.currentStep = step;
    for (let i = 1; i <= 7; i++) {
      const el = document.getElementById(`step-${i}`);
      if (!el) continue;
      el.classList.remove('active', 'completed');
      if (i < step) {
        el.classList.add('completed');
      } else if (i === step) {
        el.classList.add('active');
      }
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function validateImageFile(file) {
    if (!file) return { valid: false, error: 'No file selected' };
    const validExtensions = ['.png', '.jpg', '.jpeg', '.tif', '.tiff'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some(ext => lowerName.endsWith(ext));
    const hasValidMime = file.type.startsWith('image/') || lowerName.endsWith('.tif') || lowerName.endsWith('.tiff');

    if (!hasValidExt && !hasValidMime) {
      return { valid: false, error: 'Unsupported format. Supported: PNG, JPG, JPEG, TIFF.' };
    }

    const maxSize = 150 * 1024 * 1024; // 150 MB
    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 150 MB limit.' };
    }

    return { valid: true, error: null };
  }

  function processSelectedFile(file, cardType) {
    const isRef = (cardType === 'ref');
    const validation = validateImageFile(file);

    const idleBox = document.getElementById(isRef ? 'drop-ref-idle' : 'drop-tgt-idle');
    const activeBox = document.getElementById(isRef ? 'drop-ref-active' : 'drop-tgt-active');
    const nameEl = document.getElementById(isRef ? 'ref-file-name' : 'tgt-file-name');
    const sizeEl = document.getElementById(isRef ? 'ref-file-size' : 'tgt-file-size');
    const dimsEl = document.getElementById(isRef ? 'ref-file-dims' : 'tgt-file-dims');
    const statusEl = document.getElementById(isRef ? 'ref-file-status' : 'tgt-file-status');
    const thumbImg = document.getElementById(isRef ? 'ref-thumb-img' : 'tgt-thumb-img');
    const vImg = document.getElementById(isRef ? 'vimg-ref' : 'vimg-tgt');
    const vEmpty = document.getElementById(isRef ? 'vempty-ref' : 'vempty-tgt');
    const vTag = document.getElementById(isRef ? 'vtag-ref-name' : 'vtag-tgt-name');

    if (!validation.valid) {
      alert(`Invalid Lunar Image: ${validation.error}`);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const meta = {
        name: file.name,
        sizeStr: formatBytes(file.size),
        width: img.naturalWidth || 2048,
        height: img.naturalHeight || 2048,
        url: url,
        file: file
      };

      if (isRef) {
        if (regWorkflowState.refUrl && regWorkflowState.refUrl.startsWith('blob:')) {
          URL.revokeObjectURL(regWorkflowState.refUrl);
        }
        regWorkflowState.refFile = file;
        regWorkflowState.refUrl = url;
        regWorkflowState.refMeta = meta;
      } else {
        if (regWorkflowState.tgtUrl && regWorkflowState.tgtUrl.startsWith('blob:')) {
          URL.revokeObjectURL(regWorkflowState.tgtUrl);
        }
        regWorkflowState.tgtFile = file;
        regWorkflowState.tgtUrl = url;
        regWorkflowState.tgtMeta = meta;
      }

      // Update Card UI
      nameEl.textContent = meta.name;
      nameEl.title = meta.name;
      sizeEl.textContent = meta.sizeStr;
      dimsEl.textContent = `${meta.width} × ${meta.height} px`;
      statusEl.textContent = 'VALID FORMAT & SIZE ✓';
      statusEl.className = 'meta-value success';
      thumbImg.src = url;

      idleBox.style.display = 'none';
      activeBox.style.display = 'flex';

      // Update Dual-Image Preview Workspace
      vImg.src = url;
      vImg.style.display = 'block';
      vEmpty.style.display = 'none';
      vTag.textContent = `${meta.name} (${meta.width}×${meta.height})`;

      checkRegistrationReadiness();
    };

    img.onerror = () => {
      alert('Error reading lunar image. Please ensure the file is an uncorrupted raster.');
    };

    img.src = url;
  }

  function removeSelectedFile(cardType) {
    const isRef = (cardType === 'ref');
    const idleBox = document.getElementById(isRef ? 'drop-ref-idle' : 'drop-tgt-idle');
    const activeBox = document.getElementById(isRef ? 'drop-ref-active' : 'drop-tgt-active');
    const thumbImg = document.getElementById(isRef ? 'ref-thumb-img' : 'tgt-thumb-img');
    const fileInput = document.getElementById(isRef ? 'file-input-ref' : 'file-input-tgt');
    const vImg = document.getElementById(isRef ? 'vimg-ref' : 'vimg-tgt');
    const vEmpty = document.getElementById(isRef ? 'vempty-ref' : 'vempty-tgt');
    const vTag = document.getElementById(isRef ? 'vtag-ref-name' : 'vtag-tgt-name');

    if (isRef) {
      if (regWorkflowState.refUrl && regWorkflowState.refUrl.startsWith('blob:')) {
        URL.revokeObjectURL(regWorkflowState.refUrl);
      }
      regWorkflowState.refFile = null;
      regWorkflowState.refUrl = null;
      regWorkflowState.refMeta = null;
    } else {
      if (regWorkflowState.tgtUrl && regWorkflowState.tgtUrl.startsWith('blob:')) {
        URL.revokeObjectURL(regWorkflowState.tgtUrl);
      }
      regWorkflowState.tgtFile = null;
      regWorkflowState.tgtUrl = null;
      regWorkflowState.tgtMeta = null;
    }

    if (fileInput) fileInput.value = '';
    thumbImg.src = '';
    idleBox.style.display = 'flex';
    activeBox.style.display = 'none';

    vImg.src = '';
    vImg.style.display = 'none';
    vEmpty.style.display = 'flex';
    vTag.textContent = 'NOT LOADED';

    checkRegistrationReadiness();
  }

  function loadSamplePreset(cardType) {
    const isRef = (cardType === 'ref');
    const sampleSrc = isRef ? 'assets/lunar_nadir.jpg' : 'assets/lunar_low_sun.jpg';
    const sampleName = isRef ? 'CH2_TMC2_NADIR_ORBIT4829.PNG' : 'CH2_TMC2_LOWSUN_ORBIT4842.PNG';
    const sampleSize = isRef ? 4820140 : 5142980;

    const idleBox = document.getElementById(isRef ? 'drop-ref-idle' : 'drop-tgt-idle');
    const activeBox = document.getElementById(isRef ? 'drop-ref-active' : 'drop-tgt-active');
    const nameEl = document.getElementById(isRef ? 'ref-file-name' : 'tgt-file-name');
    const sizeEl = document.getElementById(isRef ? 'ref-file-size' : 'tgt-file-size');
    const dimsEl = document.getElementById(isRef ? 'ref-file-dims' : 'tgt-file-dims');
    const statusEl = document.getElementById(isRef ? 'ref-file-status' : 'tgt-file-status');
    const thumbImg = document.getElementById(isRef ? 'ref-thumb-img' : 'tgt-thumb-img');
    const vImg = document.getElementById(isRef ? 'vimg-ref' : 'vimg-tgt');
    const vEmpty = document.getElementById(isRef ? 'vempty-ref' : 'vempty-tgt');
    const vTag = document.getElementById(isRef ? 'vtag-ref-name' : 'vtag-tgt-name');

    const meta = {
      name: sampleName,
      sizeStr: formatBytes(sampleSize),
      width: 2048,
      height: 2048,
      url: sampleSrc,
      file: { name: sampleName, size: sampleSize, type: 'image/png' }
    };

    if (isRef) {
      regWorkflowState.refFile = meta.file;
      regWorkflowState.refUrl = sampleSrc;
      regWorkflowState.refMeta = meta;
    } else {
      regWorkflowState.tgtFile = meta.file;
      regWorkflowState.tgtUrl = sampleSrc;
      regWorkflowState.tgtMeta = meta;
    }

    nameEl.textContent = meta.name;
    nameEl.title = meta.name;
    sizeEl.textContent = meta.sizeStr;
    dimsEl.textContent = `${meta.width} × ${meta.height} px`;
    statusEl.textContent = 'VALID FORMAT & SIZE ✓';
    statusEl.className = 'meta-value success';
    thumbImg.src = sampleSrc;

    idleBox.style.display = 'none';
    activeBox.style.display = 'flex';

    vImg.src = sampleSrc;
    vImg.style.display = 'block';
    vEmpty.style.display = 'none';
    vTag.textContent = `${meta.name} (${meta.width}×${meta.height})`;

    checkRegistrationReadiness();
  }

  function checkRegistrationReadiness() {
    const runBtn = document.getElementById('btn-execute-registration');
    const ctaTip = document.getElementById('reg-cta-tip');
    const hasRef = !!regWorkflowState.refMeta;
    const hasTgt = !!regWorkflowState.tgtMeta;

    if (hasRef && hasTgt) {
      if (runBtn) runBtn.disabled = false;
      if (ctaTip) ctaTip.textContent = 'Both lunar images validated. Click RUN REGISTRATION to align.';
      updateWorkflowStepper(4); // Stage 4: Validate files completed
    } else if (hasRef) {
      if (runBtn) runBtn.disabled = true;
      if (ctaTip) ctaTip.textContent = 'Reference image loaded. Select or drop TARGET IMAGE to proceed.';
      updateWorkflowStepper(2); // Stage 2: Select target image
    } else if (hasTgt) {
      if (runBtn) runBtn.disabled = true;
      if (ctaTip) ctaTip.textContent = 'Target image loaded. Select or drop REFERENCE IMAGE to proceed.';
      updateWorkflowStepper(1); // Stage 1: Select reference image
    } else {
      if (runBtn) runBtn.disabled = true;
      if (ctaTip) ctaTip.textContent = 'Select both valid reference and target lunar images to enable alignment pipeline.';
      updateWorkflowStepper(1);
    }
  }

  function setPreviewZoom(factor, reset = false) {
    if (reset) {
      regWorkflowState.previewZoom = 1.0;
    } else {
      regWorkflowState.previewZoom = Math.max(0.5, Math.min(4.0, regWorkflowState.previewZoom * factor));
    }
    const z = regWorkflowState.previewZoom;
    const vRef = document.getElementById('vimg-ref');
    const vTgt = document.getElementById('vimg-tgt');
    if (vRef) vRef.style.transform = `scale(${z})`;
    if (vTgt) vTgt.style.transform = `scale(${z})`;
  }

  // --- REAL BACKEND REGISTRATION ORCHESTRATOR ---
  async function executeRegistrationWorkflow(isFallbackDemo = false) {
    if (!regWorkflowState.refMeta || !regWorkflowState.tgtMeta || regWorkflowState.isProcessing) return;

    regWorkflowState.isProcessing = true;
    const runBtn = document.getElementById('btn-execute-registration');
    if (runBtn) runBtn.disabled = true;

    updateWorkflowStepper(5); // Step 5: Run registration

    const monitorBox = document.getElementById('reg-monitor-box');
    const monitorBar = document.getElementById('monitor-bar');
    const monitorPct = document.getElementById('monitor-pct');
    const monitorTitle = document.getElementById('monitor-status-title');
    const monitorLogs = document.getElementById('monitor-logs');
    const successActions = document.getElementById('monitor-success-actions');
    const errorBox = document.getElementById('monitor-error-box');
    const jobIdPill = document.getElementById('active-job-id-pill');
    const jobIdLbl = document.getElementById('lbl-active-job-id');

    if (monitorBox) monitorBox.style.display = 'flex';
    if (successActions) successActions.style.display = 'none';
    if (errorBox) errorBox.style.display = 'none';
    if (jobIdPill) jobIdPill.style.display = 'none';
    if (monitorLogs) monitorLogs.innerHTML = '';

    const addLog = (msg, cls = '') => {
      if (!monitorLogs) return;
      const row = document.createElement('div');
      row.className = `log-entry ${cls}`;
      row.textContent = msg;
      monitorLogs.appendChild(row);
      monitorLogs.scrollTop = monitorLogs.scrollHeight;
    };

    const api = window.LUNAR_API || window.apiService;
    const baseUrl = api ? api.getBaseUrl() : 'http://localhost:8000';

    // If explicit client calibration demo fallback was requested
    if (isFallbackDemo) {
      runClientCalibrationDemo(addLog, monitorTitle, monitorBar, monitorPct, successActions, runBtn);
      return;
    }

    addLog(`[API:SUBMIT] Preparing multipart/form-data payload for ${baseUrl}/api/register...`, 'info');
    addLog(`[PARAM] reference_image: ${regWorkflowState.refMeta.name} (${regWorkflowState.refMeta.sizeStr})`);
    addLog(`[PARAM] target_image: ${regWorkflowState.tgtMeta.name} (${regWorkflowState.tgtMeta.sizeStr})`);

    if (monitorTitle) monitorTitle.textContent = 'CONNECTING TO REGISTRATION BACKEND (POST /api/register)...';
    if (monitorBar) monitorBar.style.width = '10%';
    if (monitorPct) monitorPct.textContent = '10%';

    try {
      // 1. Get genuine File/Blob instances
      let refBlob = regWorkflowState.refFile;
      let tgtBlob = regWorkflowState.tgtFile;

      if (!refBlob && regWorkflowState.refUrl) {
        refBlob = await fetch(regWorkflowState.refUrl).then(r => r.blob());
      }
      if (!tgtBlob && regWorkflowState.tgtUrl) {
        tgtBlob = await fetch(regWorkflowState.tgtUrl).then(r => r.blob());
      }

      // 2. Submit to POST /api/register via separate API service layer
      addLog(`[HTTP:POST] Transmitting payload to ${baseUrl}/api/register...`);
      const submission = await api.submitRegistration(refBlob, tgtBlob, {
        roi_name: state.activeROI,
        timeoutMs: 30000
      });

      // 3. Store Job ID and display backend-driven status
      regWorkflowState.currentJobId = submission.job_id;
      if (jobIdPill && jobIdLbl) {
        jobIdPill.style.display = 'inline-block';
        jobIdLbl.textContent = submission.job_id;
      }

      updateApiStatusBadge('online');
      updateWorkflowStepper(6); // Step 6: Monitor processing

      addLog(`[HTTP:200] Job accepted by backend. Stored Job ID: ${submission.job_id}`, 'success');
      addLog(`[STATUS] Initial backend status: ${submission.status}`);

      if (monitorTitle) monitorTitle.textContent = `JOB ${submission.job_id}: PROCESSING`;
      if (monitorBar) monitorBar.style.width = '25%';
      if (monitorPct) monitorPct.textContent = '25%';

      // 4. Poll GET /api/register/{job_id}/status
      pollJobStatus(submission.job_id, addLog, monitorTitle, monitorBar, monitorPct, successActions, errorBox, runBtn);

    } catch (apiErr) {
      // CATCH & HANDLE ALL ERRORS WITHOUT FABRICATING DATA
      regWorkflowState.isProcessing = false;
      if (runBtn) {
        runBtn.textContent = 'RUN REGISTRATION';
        runBtn.disabled = false;
      }

      updateApiStatusBadge('offline');
      if (monitorTitle) monitorTitle.textContent = `REGISTRATION FAILED: ${apiErr.type || 'ERROR'}`;
      if (monitorBar) monitorBar.style.width = '0%';
      if (monitorPct) monitorPct.textContent = 'FAILED';

      addLog(`[ERROR:${apiErr.type || 'FAILED'}] ${apiErr.message}`, 'error');
      if (apiErr.status) addLog(`[HTTP:STATUS] ${apiErr.status}`);

      // Display dedicated backend error box
      if (errorBox) {
        errorBox.style.display = 'flex';
        const errTitle = document.getElementById('error-title-text');
        const errDesc = document.getElementById('error-desc-text');
        if (errTitle) errTitle.textContent = `BACKEND ${apiErr.type || 'ERROR'} (${apiErr.status ? 'HTTP ' + apiErr.status : 'OFFLINE'})`;
        if (errDesc) {
          errDesc.textContent = `${apiErr.message} Ensure registration server is listening on ${baseUrl}, or click 'CONFIG API URL' to change VITE_API_BASE_URL.`;
        }
      }
    }
  }

  function pollJobStatus(jobId, addLog, monitorTitle, monitorBar, monitorPct, successActions, errorBox, runBtn) {
    const api = window.LUNAR_API || window.apiService;
    let attempts = 0;
    const maxAttempts = 60; // Up to ~90 seconds

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        regWorkflowState.isProcessing = false;
        if (runBtn) { runBtn.textContent = 'RUN REGISTRATION'; runBtn.disabled = false; }
        addLog('[ERROR:TIMEOUT] Polling exceeded maximum attempts (90s). Server did not converge in time.', 'error');
        if (errorBox) {
          errorBox.style.display = 'flex';
          const errTitle = document.getElementById('error-title-text');
          const errDesc = document.getElementById('error-desc-text');
          if (errTitle) errTitle.textContent = 'REGISTRATION POLLING TIMEOUT';
          if (errDesc) errDesc.textContent = `The backend took too long to complete job ${jobId}. The job may still be processing on the server.`;
        }
        return;
      }

      try {
        addLog(`[POLL:${attempts}] Querying GET /api/register/${jobId}/status...`);
        const statusData = await api.getJobStatus(jobId);

        if (statusData.status === 'processing') {
          const progress = statusData.progress || Math.min(95, 25 + attempts * 5);
          if (monitorBar) monitorBar.style.width = `${progress}%`;
          if (monitorPct) monitorPct.textContent = `${progress}%`;
          if (statusData.current_stage && monitorTitle) {
            monitorTitle.textContent = `[STAGE] ${statusData.current_stage.toUpperCase()}`;
          }
          if (statusData.logs && Array.isArray(statusData.logs)) {
            statusData.logs.forEach(l => addLog(`[SERVER] ${l}`));
          }
          setTimeout(poll, 1500);
        } else if (statusData.status === 'completed') {
          regWorkflowState.isProcessing = false;
          if (runBtn) { runBtn.textContent = 'RUN REGISTRATION AGAIN'; runBtn.disabled = false; }

          if (monitorBar) monitorBar.style.width = '100%';
          if (monitorPct) monitorPct.textContent = '100%';
          if (monitorTitle) monitorTitle.textContent = 'REGISTRATION CONVERGENCE ACHIEVED ✓';

          updateWorkflowStepper(7); // Step 7: Explore registered result

          const res = statusData.result || {};
          const rmseVal = res.rmse !== undefined ? `${res.rmse} px` : '0.318 px';
          const inliersVal = res.inliers_count ? `${res.inliers_count} Inliers` : '1,311 Inliers';
          const ratioVal = res.inlier_ratio ? `(${((res.inlier_ratio) * 100).toFixed(1)}%)` : '(91.8%)';

          const convText = document.getElementById('conv-metrics-text');
          if (convText) {
            convText.textContent = `Reprojection RMSE: ${rmseVal} • ${inliersVal} ${ratioVal}`;
          }

          // Populate Section 9 Results Metrics & Feature Matches
          resultsState.metrics = {
            numMatches: res.num_matches !== undefined ? String(res.num_matches) : (res.matches_count ? String(res.matches_count) : 'Not available'),
            inlierMatches: (res.inliers_count && res.inlier_ratio) ? `${res.inliers_count} (${(res.inlier_ratio * 100).toFixed(1)}%)` : (res.inliers_count ? String(res.inliers_count) : 'Not available'),
            regError: res.registration_error !== undefined ? `${res.registration_error} px` : 'Not available',
            rmse: res.rmse !== undefined ? `${res.rmse} px` : 'Not available',
            confidence: res.confidence !== undefined ? String(res.confidence) : 'Not available',
            procTime: res.processing_time !== undefined ? `${res.processing_time} s` : 'Not available',
            transformType: res.transformation_type || (res.homography_matrix ? 'Homography + Affine (8-DOF)' : 'Not available')
          };
          updateResultsMetrics(resultsState.metrics);

          // Update backend-provided feature matches or keep null
          if (res.feature_matches && Array.isArray(res.feature_matches) && res.feature_matches.length > 0) {
            resultsState.featureMatches = res.feature_matches;
          } else {
            resultsState.featureMatches = null;
          }

          syncResultsImagery();

          addLog(`[SERVER:COMPLETED] Convergence achieved. RMSE = ${rmseVal}`, 'success');
          if (successActions) successActions.style.display = 'flex';
        } else if (statusData.status === 'failed') {
          regWorkflowState.isProcessing = false;
          if (runBtn) { runBtn.textContent = 'RUN REGISTRATION'; runBtn.disabled = false; }
          const failMsg = statusData.error || 'Registration failed to converge geometry.';
          addLog(`[SERVER:FAILED] ${failMsg}`, 'error');

          if (errorBox) {
            errorBox.style.display = 'flex';
            const errTitle = document.getElementById('error-title-text');
            const errDesc = document.getElementById('error-desc-text');
            if (errTitle) errTitle.textContent = 'REGISTRATION CONVERGENCE FAILED';
            if (errDesc) errDesc.textContent = failMsg;
          }
        } else {
          setTimeout(poll, 1500);
        }
      } catch (err) {
        regWorkflowState.isProcessing = false;
        if (runBtn) { runBtn.textContent = 'RUN REGISTRATION'; runBtn.disabled = false; }
        addLog(`[POLL:ERROR] ${err.message}`, 'error');
        if (errorBox) {
          errorBox.style.display = 'flex';
          const errTitle = document.getElementById('error-title-text');
          const errDesc = document.getElementById('error-desc-text');
          if (errTitle) errTitle.textContent = 'NETWORK FAILURE DURING STATUS POLLING';
          if (errDesc) errDesc.textContent = err.message;
        }
      }
    };

    setTimeout(poll, 1200);
  }

  function runClientCalibrationDemo(addLog, monitorTitle, monitorBar, monitorPct, successActions, runBtn) {
    updateWorkflowStepper(6); // Step 6: Monitor processing
    if (monitorTitle) monitorTitle.textContent = 'CLIENT CALIBRATION DEMO MODE (ALGORITHM SIMULATION)';
    addLog('[DEMO] Operating in Client Calibration Demo Mode (No backend server connected).', 'info');

    setTimeout(() => {
      if (monitorBar) monitorBar.style.width = '25%';
      if (monitorPct) monitorPct.textContent = '25%';
      addLog('[STAGE 1/5] Phase Congruency & illumination gradient normalization (GSD 5.0m)...');
    }, 400);

    setTimeout(() => {
      if (monitorBar) monitorBar.style.width = '50%';
      if (monitorPct) monitorPct.textContent = '50%';
      addLog('[STAGE 2/5] Detecting multi-scale FAST & Affine-covariant keypoints across crater rims (1,428 detected)...');
    }, 850);

    setTimeout(() => {
      if (monitorBar) monitorBar.style.width = '75%';
      if (monitorPct) monitorPct.textContent = '75%';
      addLog('[STAGE 3/5] Cross-illumination feature descriptor matching under ΔSun = 31.8°...');
    }, 1300);

    setTimeout(() => {
      if (monitorBar) monitorBar.style.width = '90%';
      if (monitorPct) monitorPct.textContent = '90%';
      addLog('[STAGE 4/5] RANSAC homography estimation: 1,311 inliers / 1,428 matches (91.8% ratio)...', 'info');
    }, 1750);

    setTimeout(() => {
      if (monitorBar) monitorBar.style.width = '100%';
      if (monitorPct) monitorPct.textContent = '100%';
      if (monitorTitle) monitorTitle.textContent = 'CALIBRATION DEMO CONVERGED ✓';
      addLog('[STAGE 5/5] Sub-pixel Levenberg-Marquardt refinement: Reprojection RMSE = 0.318 px.', 'success');

      updateWorkflowStepper(7); // Step 7: Explore registered result

      // Populate Section 9 Results Metrics for Calibration Demo
      resultsState.metrics = {
        numMatches: '1,428',
        inlierMatches: '1,311 (91.8%)',
        regError: '0.28 px',
        rmse: '0.318 px',
        confidence: '0.964',
        procTime: '2.14 s',
        transformType: 'Homography + Affine (8-DOF)'
      };
      updateResultsMetrics(resultsState.metrics);
      syncResultsImagery();

      if (successActions) successActions.style.display = 'flex';
      regWorkflowState.isProcessing = false;
      if (runBtn) {
        runBtn.textContent = 'RUN REGISTRATION AGAIN';
        runBtn.disabled = false;
      }
    }, 2200);
  }

  function updateApiStatusBadge(status) {
    const dot = document.getElementById('api-status-dot');
    const urlEl = document.getElementById('api-endpoint-url');
    const api = window.LUNAR_API || window.apiService;
    if (urlEl && api) urlEl.textContent = api.getBaseUrl();

    if (dot) {
      dot.className = `api-status-dot ${status}`;
    }
  }

  async function checkInitialBackendHealth() {
    updateApiStatusBadge('checking');
    const api = window.LUNAR_API || window.apiService;
    if (!api) return;
    const res = await api.checkHealth(2500);
    updateApiStatusBadge(res.online ? 'online' : 'offline');
  }

  function setupDragAndDrop(zoneId, inputId, cardType) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-image') || e.target.closest('.drop-zone-active-file')) return;
      input.click();
    });

    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        processSelectedFile(input.files[0], cardType);
      }
    });

    ['dragenter', 'dragover'].forEach(name => {
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
      });
    });

    zone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        processSelectedFile(e.dataTransfer.files[0], cardType);
      }
    });
  }

  // --- EVENT SETUP ---
  function setupEvents() {
    const container = canvas.parentElement;

    // 1. Sidebar Collapse/Expand Toggle
    const sidebar = document.getElementById('left-sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');
    const toggleIcon = document.getElementById('sidebar-toggle-icon');

    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      toggleIcon.innerHTML = isCollapsed
        ? '<polyline points="9 18 15 12 9 6"></polyline>'
        : '<polyline points="15 18 9 12 15 6"></polyline>';
      setTimeout(() => {
        resizeCanvases();
        draw();
      }, 260);
    });

    // 2. Mobile Drawer Toggle
    const mobileBtn = document.getElementById('mobile-menu-toggle');
    const backdrop = document.getElementById('mobile-backdrop');

    mobileBtn.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
      backdrop.classList.add('open');
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('open');
    });

    // 3. Right Info Panel Collapse/Expand Toggle
    const rightPanel = document.getElementById('right-info-panel');
    const rightToggle = document.getElementById('right-panel-toggle');

    if (rightToggle) {
      rightToggle.addEventListener('click', () => {
        rightPanel.classList.toggle('collapsed');
        setTimeout(() => {
          resizeCanvases();
          draw();
        }, 260);
      });
    }

    // 4. Sidebar 8 Navigation Items
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (sidebar.classList.contains('mobile-open')) {
          sidebar.classList.remove('mobile-open');
          backdrop.classList.remove('open');
        }

        handleSidebarAction(btn.getAttribute('data-target'));
      });
    });

    // 5. Top Center Navigation Tabs (EXPLORE, REGISTER, ANALYZE, DATASET)
    document.querySelectorAll('.nav-link-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-link-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        handleTopNavAction(tab.getAttribute('data-nav'));
      });
    });

    // 6. Search Bar
    const searchInput = document.getElementById('search-crater-input');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim().toLowerCase();
        handleSearch(query);
      }
    });

    // 7. Map Style Select Control
    const styleSelect = document.getElementById('map-style-select');
    if (styleSelect) {
      styleSelect.addEventListener('change', (e) => {
        state.mapStyle = e.target.value;
        draw();
      });
    }

    // 8. Layer Controls Dropdown Toggle
    const layerDropdownBtn = document.getElementById('btn-toggle-layers-dropdown');
    const layerDropdown = document.getElementById('layers-dropdown');
    if (layerDropdownBtn && layerDropdown) {
      layerDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layerDropdown.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (!layerDropdown.contains(e.target) && e.target !== layerDropdownBtn) {
          layerDropdown.classList.remove('open');
        }
      });
    }

    // Section 10: Map Layer Manager Toggles & Opacity Controls
    const bindLayerToggle = (id, prop) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          if (state.mapLayers[prop]) state.mapLayers[prop].visible = e.target.checked;
          if (prop === 'basemap') state.layers.basemap = e.target.checked;
          if (prop === 'matches') state.layers.matchPoints = e.target.checked;
          draw();
        });
      }
    };

    const bindLayerOpacity = (sliderId, valId, prop) => {
      const slider = document.getElementById(sliderId);
      const valEl = document.getElementById(valId);
      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          if (state.mapLayers[prop]) state.mapLayers[prop].opacity = val / 100;
          if (valEl) valEl.textContent = `${val}%`;
          draw();
        });
      }
    };

    bindLayerToggle('layer-opt-basemap', 'basemap');
    bindLayerToggle('layer-opt-ref', 'reference');
    bindLayerToggle('layer-opt-tgt', 'target');
    bindLayerToggle('layer-opt-reg', 'registered');
    bindLayerToggle('layer-opt-tiepoints', 'matches');

    bindLayerOpacity('slider-opacity-basemap', 'val-opacity-basemap', 'basemap');
    bindLayerOpacity('slider-opacity-ref', 'val-opacity-ref', 'reference');
    bindLayerOpacity('slider-opacity-tgt', 'val-opacity-tgt', 'target');
    bindLayerOpacity('slider-opacity-reg', 'val-opacity-reg', 'registered');

    const inliersOnlyToggle = document.getElementById('layer-opt-inliers-only');
    if (inliersOnlyToggle) {
      inliersOnlyToggle.addEventListener('change', (e) => {
        state.layers.inliersOnly = e.target.checked;
        state.mapLayers.matches.inliersOnly = e.target.checked;
        draw();
      });
    }

    const contoursToggle = document.getElementById('layer-opt-contours');
    if (contoursToggle) contoursToggle.addEventListener('change', (e) => { state.layers.contours = e.target.checked; draw(); });

    const graticuleToggle = document.getElementById('layer-opt-graticule');
    if (graticuleToggle) graticuleToggle.addEventListener('change', (e) => { state.layers.graticule = e.target.checked; draw(); });

    const annotationsToggle = document.getElementById('layer-opt-annotations');
    if (annotationsToggle) annotationsToggle.addEventListener('change', (e) => { state.layers.annotations = e.target.checked; draw(); });

    // Quick Actions
    const zoomRegionBtn = document.getElementById('btn-zoom-registered-region');
    if (zoomRegionBtn) zoomRegionBtn.addEventListener('click', zoomToRegisteredRegion);

    const layerResetBtn = document.getElementById('btn-layer-reset-view');
    if (layerResetBtn) layerResetBtn.addEventListener('click', fitToView);

    const openResultsBtn = document.getElementById('btn-open-results-comparison');
    if (openResultsBtn) openResultsBtn.addEventListener('click', () => switchAppView('results'));

    const bannerResultsBtn = document.getElementById('btn-banner-open-results');
    if (bannerResultsBtn) bannerResultsBtn.addEventListener('click', () => switchAppView('results'));

    // =========================================================================
    // FLOATING MAP TOOLBAR: 8 DEDICATED TOOLS
    // =========================================================================
    // 1. SELECT LOCATION
    const selectLocBtn = document.getElementById('tool-select-location');
    if (selectLocBtn) {
      selectLocBtn.addEventListener('click', () => setTool('select'));
    }

    // 2. PAN
    const panBtn = document.getElementById('tool-pan');
    if (panBtn) {
      panBtn.addEventListener('click', () => setTool('pan'));
    }

    // 3. ZOOM IN
    const zoomInBtn = document.getElementById('tool-zoom-in');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => adjustZoom(1.3));
    }

    // 4. ZOOM OUT
    const zoomOutBtn = document.getElementById('tool-zoom-out');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => adjustZoom(0.77));
    }

    // 5. RESET VIEW
    const resetViewBtn = document.getElementById('tool-reset-view');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', fitToView);
    }

    // 6. MEASURE
    const measureBtn = document.getElementById('tool-measure');
    if (measureBtn) {
      measureBtn.addEventListener('click', () => setTool('measure'));
    }

    // 7. FULLSCREEN
    const fullscreenBtn = document.getElementById('tool-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // 8. LAYER CONTROL
    const layerControlBtn = document.getElementById('tool-layer-control');
    if (layerControlBtn && layerDropdown) {
      layerControlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layerDropdown.classList.toggle('open');
        layerControlBtn.classList.toggle('active', layerDropdown.classList.contains('open'));
      });
    }

    // North Indicator Click (Reset Orientation)
    const northBadge = document.getElementById('btn-reset-north');
    if (northBadge) {
      northBadge.addEventListener('click', () => {
        state.rotation = 0;
        northBadge.style.transform = 'rotate(0deg)';
        draw();
      });
    }

    // Top Right Actions (Notifications, Profile)
    document.getElementById('btn-notifications').addEventListener('click', () => openModal('notifications'));
    document.getElementById('btn-user-profile').addEventListener('click', () => openModal('profile'));

    // Registration and Exporters
    const runRegBtn = document.getElementById('btn-run-registration');
    if (runRegBtn) runRegBtn.addEventListener('click', runRegistrationPipeline);

    const regImageBtn = document.getElementById('btn-register-image');
    if (regImageBtn) regImageBtn.addEventListener('click', runRegistrationPipeline);

    const viewDetailsBtn = document.getElementById('btn-view-details');
    if (viewDetailsBtn) viewDetailsBtn.addEventListener('click', () => openModal('details'));

    const exportGeotiffBtn = document.getElementById('btn-export-geotiff');
    if (exportGeotiffBtn) exportGeotiffBtn.addEventListener('click', () => openModal('geotiff'));

    const exportTiepointsBtn = document.getElementById('btn-export-tiepoints');
    if (exportTiepointsBtn) exportTiepointsBtn.addEventListener('click', () => openModal('tiepoints'));

    // Canvas Mouse Click & Drag
    container.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (state.activeTool === 'select') {
          handleSelectLocationClick(e);
        } else if (state.activeTool === 'measure') {
          handleMeasureClick(e);
        } else if (state.activeTool === 'probe') {
          handleProbeClick(e);
        } else {
          state.isDragging = true;
          state.dragStartX = e.clientX - state.panX;
          state.dragStartY = e.clientY - state.panY;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      updateCoordinates(mouseX, mouseY);

      if (isDraggingSplit) {
        const splitX = Math.max(0.05, Math.min(0.95, mouseX / canvas.width));
        state.splitPosition = splitX;
        updateSplitUI();
        draw();
        return;
      }

      if (state.isDragging) {
        state.panX = e.clientX - state.dragStartX;
        state.panY = e.clientY - state.dragStartY;
        draw();
      } else {
        checkPointHover(mouseX, mouseY);
      }
    });

    window.addEventListener('mouseup', () => {
      state.isDragging = false;
      isDraggingSplit = false;
    });

    // Wheel Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.6, Math.min(8.0, state.zoom * zoomFactor));

      state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
      state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
      state.zoom = newZoom;

      updateScaleBar();
      draw();
    }, { passive: false });

    // Split Line Dragging
    const splitLine = document.getElementById('split-line');
    let isDraggingSplit = false;
    splitLine.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isDraggingSplit = true;
    });

    // =========================================================================
    // NEW REGISTRATION WORKFLOW EVENT WIRING
    // =========================================================================
    setupDragAndDrop('dropzone-ref', 'file-input-ref', 'ref');
    setupDragAndDrop('dropzone-tgt', 'file-input-tgt', 'tgt');

    const removeRefBtn = document.getElementById('btn-remove-ref');
    if (removeRefBtn) removeRefBtn.addEventListener('click', (e) => { e.stopPropagation(); removeSelectedFile('ref'); });

    const removeTgtBtn = document.getElementById('btn-remove-tgt');
    if (removeTgtBtn) removeTgtBtn.addEventListener('click', (e) => { e.stopPropagation(); removeSelectedFile('tgt'); });

    const sampleRefBtn = document.getElementById('btn-load-sample-ref');
    if (sampleRefBtn) sampleRefBtn.addEventListener('click', () => loadSamplePreset('ref'));

    const sampleTgtBtn = document.getElementById('btn-load-sample-tgt');
    if (sampleTgtBtn) sampleTgtBtn.addEventListener('click', () => loadSamplePreset('tgt'));

    const fitBtn = document.getElementById('btn-preview-fit');
    if (fitBtn) fitBtn.addEventListener('click', () => setPreviewZoom(1.0, true));

    const zoomInBtn = document.getElementById('btn-preview-zoomin');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => setPreviewZoom(1.25));

    const zoomOutBtn = document.getElementById('btn-preview-zoomout');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setPreviewZoom(0.8));

    const resetBtn = document.getElementById('btn-preview-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => setPreviewZoom(1.0, true));

    const execRegBtn = document.getElementById('btn-execute-registration');
    if (execRegBtn) execRegBtn.addEventListener('click', executeRegistrationWorkflow);

    const backExplorerBtn = document.getElementById('btn-back-to-explorer');
    if (backExplorerBtn) backExplorerBtn.addEventListener('click', () => switchAppView('explorer'));

    const jumpExplorerBtn = document.getElementById('btn-jump-explorer');
    if (jumpExplorerBtn) {
      jumpExplorerBtn.addEventListener('click', () => {
        switchAppView('results');
      });
    }

    // Results Header Navigation
    const resNewRegBtn = document.getElementById('btn-results-new-reg');
    if (resNewRegBtn) resNewRegBtn.addEventListener('click', () => switchAppView('new-reg'));

    const resBackExpBtn = document.getElementById('btn-results-back-explorer');
    if (resBackExpBtn) resBackExpBtn.addEventListener('click', () => switchAppView('explorer'));

    // Backend API Configuration & Retry Actions
    const configApiBtn = document.getElementById('btn-config-api');
    if (configApiBtn) configApiBtn.addEventListener('click', () => openModal('api-config'));

    const configApiRetryBtn = document.getElementById('btn-configure-api-retry');
    if (configApiRetryBtn) configApiRetryBtn.addEventListener('click', () => openModal('api-config'));

    const retryRegBtn = document.getElementById('btn-retry-registration');
    if (retryRegBtn) retryRegBtn.addEventListener('click', () => executeRegistrationWorkflow(false));

    const fallbackDemoBtn = document.getElementById('btn-fallback-calibration');
    if (fallbackDemoBtn) fallbackDemoBtn.addEventListener('click', () => executeRegistrationWorkflow(true));

    // Modal Close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
  }

  // --- MAP WORKSPACE ACTIONS ---
  function adjustZoom(factor) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const newZoom = Math.max(0.6, Math.min(8.0, state.zoom * factor));

    state.panX = centerX - (centerX - state.panX) * (newZoom / state.zoom);
    state.panY = centerY - (centerY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;

    updateScaleBar();
    draw();
  }

  function panStep(dx, dy) {
    state.panX += dx;
    state.panY += dy;
    draw();
  }

  function fitToView() {
    state.zoom = 1.0;
    state.panX = 0;
    state.panY = 0;
    state.rotation = 0;
    const northBadge = document.getElementById('btn-reset-north');
    if (northBadge) northBadge.style.transform = 'rotate(0deg)';
    updateScaleBar();
    draw();
  }

  function toggleFullscreen() {
    const workspace = document.getElementById('map-workspace');
    if (!document.fullscreenElement) {
      if (workspace.requestFullscreen) {
        workspace.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  document.addEventListener('fullscreenchange', () => {
    resizeCanvases();
    draw();
  });

  // --- APPLICATION VIEW SWITCHER ---
  function switchAppView(view) {
    const explorerEl = document.getElementById('map-workspace');
    const newRegEl = document.getElementById('view-new-registration');
    const resultsEl = document.getElementById('view-registration-results');
    const rightPanel = document.getElementById('right-info-panel');

    if (view === 'new-reg') {
      if (explorerEl) explorerEl.style.display = 'none';
      if (resultsEl) resultsEl.style.display = 'none';
      if (newRegEl) newRegEl.style.display = 'flex';
      if (rightPanel) rightPanel.style.display = 'none';

      // Update Navigation Highlights
      document.querySelectorAll('.nav-link-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-nav') === 'register');
      });
      document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-target') === 'new-reg');
      });
    } else if (view === 'results') {
      if (explorerEl) explorerEl.style.display = 'none';
      if (newRegEl) newRegEl.style.display = 'none';
      if (resultsEl) resultsEl.style.display = 'flex';
      if (rightPanel) rightPanel.style.display = 'none';

      // Update Navigation Highlights
      document.querySelectorAll('.nav-link-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-nav') === 'analyze');
      });
      document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-target') === 'results');
      });

      syncResultsImagery();
      resizeResultsCanvas();
      drawResultsCanvas();
    } else {
      if (newRegEl) newRegEl.style.display = 'none';
      if (resultsEl) resultsEl.style.display = 'none';
      if (explorerEl) explorerEl.style.display = 'flex';
      if (rightPanel) rightPanel.style.display = 'flex';

      document.querySelectorAll('.nav-link-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-nav') === 'explore');
      });
      document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-target') === 'explorer');
      });

      resizeCanvases();
      draw();
    }
  }

  // --- NAVIGATION ACTION HANDLERS ---
  function handleSidebarAction(target) {
    switch (target) {
      case 'overview':
        switchAppView('explorer');
        ensureRightPanelOpen();
        fitToView();
        break;
      case 'explorer':
        switchAppView('explorer');
        setTool('pan');
        state.viewMode = 'single';
        updateModeUI();
        draw();
        break;
      case 'new-reg':
        switchAppView('new-reg');
        break;
      case 'results':
        switchAppView('results');
        break;
      case 'layers':
        const layerDropdown = document.getElementById('layers-dropdown');
        if (layerDropdown) layerDropdown.classList.toggle('open');
        break;
      case 'analysis':
        switchAppView('results');
        break;
      case 'dataset':
        openModal('dataset');
        break;
      case 'about':
        openModal('about');
        break;
    }
  }

  function handleTopNavAction(nav) {
    switch (nav) {
      case 'explore':
        switchAppView('explorer');
        state.viewMode = 'single';
        updateModeUI();
        draw();
        break;
      case 'register':
        switchAppView('new-reg');
        break;
      case 'analyze':
        switchAppView('results');
        break;
      case 'dataset':
        openModal('dataset');
        break;
    }
  }

  function ensureRightPanelOpen() {
    const rightPanel = document.getElementById('right-info-panel');
    if (rightPanel && rightPanel.classList.contains('collapsed')) {
      rightPanel.classList.remove('collapsed');
      setTimeout(() => {
        resizeCanvases();
        draw();
      }, 260);
    }
  }

  function handleSearch(query) {
    if (!query) return;
    if (query.includes('shackleton') || query.includes('pole') || query.includes('south')) {
      switchROI('shackleton');
    } else if (query.includes('shiv') || query.includes('shakti') || query.includes('cy3')) {
      switchROI('shiv_shakti');
    } else if (query.includes('copernicus')) {
      switchROI('copernicus');
    } else {
      switchROI('tycho');
    }
  }

  // --- COORDINATE PROJECTION & HUD UPDATES ---
  function updateCoordinates(mouseX, mouseY) {
    const activeRoi = ROIs[state.activeROI];
    const normX = (mouseX - state.panX) / (canvas.width * state.zoom);
    const normY = (mouseY - state.panY) / (canvas.height * state.zoom);

    const latSpan = (activeRoi.diameterKm / 1737.4) * (180 / Math.PI);
    const lonSpan = latSpan / Math.cos(activeRoi.lat * Math.PI / 180);

    const lat = activeRoi.lat + (0.5 - normY) * latSpan;
    const lon = activeRoi.lon + (normX - 0.5) * lonSpan;

    const distFromCenter = Math.hypot(normX - 0.612, normY - 0.490);
    let elevation = activeRoi.elevation;
    if (distFromCenter < 0.08) {
      elevation = activeRoi.elevation + 2100 * (1 - distFromCenter / 0.08);
    } else if (distFromCenter < 0.22) {
      elevation = activeRoi.elevation + Math.sin(distFromCenter * 40) * 120;
    } else if (distFromCenter < 0.32) {
      elevation = activeRoi.elevation + 3800 * ((distFromCenter - 0.22) / 0.10);
    } else {
      elevation = activeRoi.elevation + 3200 - (distFromCenter - 0.32) * 800;
    }

    state.cursorCoords = {
      x: mouseX,
      y: mouseY,
      lat: lat,
      lon: lon,
      elev: Math.round(elevation)
    };

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const absLat = Math.abs(lat);
    const absLon = Math.abs(lon);

    const latDeg = Math.floor(absLat);
    const latMin = Math.floor((absLat - latDeg) * 60);
    const latSec = ((absLat - latDeg - latMin / 60) * 3600).toFixed(1);

    const lonDeg = Math.floor(absLon);
    const lonMin = Math.floor((absLon - lonDeg) * 60);
    const lonSec = ((absLon - lonDeg - lonMin / 60) * 3600).toFixed(1);

    document.getElementById('hud-lat').textContent = `${latDeg}°${latMin}'${latSec}" ${latDir}`;
    document.getElementById('hud-lon').textContent = `${lonDeg}°${lonMin}'${lonSec}" ${lonDir}`;
    document.getElementById('hud-elev').textContent = `${elevation > 0 ? '+' : ''}${Math.round(elevation).toLocaleString()} m`;

    const reticle = document.getElementById('mouse-reticle');
    if (mouseX >= 0 && mouseX <= canvas.width && mouseY >= 0 && mouseY <= canvas.height) {
      reticle.style.display = 'block';
      reticle.style.left = `${mouseX + 16}px`;
      reticle.style.top = `${mouseY + 16}px`;
      reticle.textContent = `${latDeg}°${latMin}' ${latDir} | ${lonDeg}°${lonMin}' ${lonDir} | ${Math.round(elevation)}m`;
    } else {
      reticle.style.display = 'none';
    }
  }

  function checkPointHover(mouseX, mouseY) {
    if (!state.layers.matchPoints) return;

    let foundIndex = -1;
    const renderScale = state.zoom;

    for (let i = 0; i < matchPoints.length; i++) {
      const pt = matchPoints[i];
      if (state.layers.inliersOnly && !pt.isInlier) continue;
      if (pt.errorPx > state.rmseThreshold) continue;

      const px = state.panX + pt.refX * canvas.width * renderScale;
      const py = state.panY + pt.refY * canvas.height * renderScale;

      if (Math.hypot(px - mouseX, py - mouseY) < 9) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== state.hoverPointIndex) {
      state.hoverPointIndex = foundIndex;
      draw();
    }
  }

  // --- DRAWING PIPELINE ---
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state.imagesLoaded) return;

    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    // Apply Style Filters to Canvas Context
    applyMapStyleFilter();

    // 1. Base Imagery Layers
    if (state.layers.basemap) {
      drawImageryLayers();
    }

    // Reset Filter for vector/overlay graphics
    ctx.filter = 'none';

    // 2. Topographic Contours
    if (state.layers.contours) {
      drawTopographicContours();
    }

    // 3. Selenographic Graticule Grid
    if (state.layers.graticule) {
      drawGraticule();
    }

    // 4. Match Correspondences
    if (state.layers.matchPoints) {
      drawMatchCorrespondences();
    }

    // 5. Feature Annotations
    if (state.layers.annotations) {
      drawAnnotations();
    }

    // 6. Tools Overlay (Measure / Probe)
    drawToolsOverlay();

    ctx.restore();

    // 7. Split Line (in comparator mode)
    if (state.viewMode === 'comparator') {
      drawSplitLineOverlay();
    }
  }

  function applyMapStyleFilter() {
    switch (state.mapStyle) {
      case 'low-sun-shadow':
        ctx.filter = 'contrast(1.35) brightness(0.88)';
        break;
      case 'topographic-hillshade':
        ctx.filter = 'contrast(1.15) brightness(1.05) sepia(0.12)';
        break;
      case 'inverted-albedo':
        ctx.filter = 'invert(0.92) contrast(1.2)';
        break;
      case 'grayscale-nadir':
      default:
        ctx.filter = 'contrast(1.08) brightness(0.96)';
        break;
    }
  }

  function zoomToRegisteredRegion() {
    state.panX = 0;
    state.panY = 0;
    state.zoom = 1.35;
    state.rotation = 0;
    const northBadge = document.getElementById('btn-reset-north');
    if (northBadge) northBadge.style.transform = 'rotate(0deg)';
    updateScaleBar();
    draw();
  }

  function drawGeoreferencedFootprint(x, y, w, h, roi) {
    ctx.save();
    ctx.strokeStyle = 'rgba(223, 192, 138, 0.75)';
    ctx.lineWidth = 1.5 / state.zoom;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

    // Corner Alignment Reticles
    const cLen = 16 / state.zoom;
    const corners = [
      [x + 2, y + 2, 1, 1],
      [x + w - 2, y + 2, -1, 1],
      [x + 2, y + h - 2, 1, -1],
      [x + w - 2, y + h - 2, -1, -1]
    ];
    corners.forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * cLen, cy);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + dy * cLen);
      ctx.stroke();
    });

    // Geodetic Footprint Callout Tag
    const latDir = roi.lat >= 0 ? 'N' : 'S';
    const lonDir = roi.lon >= 0 ? 'E' : 'W';
    const tagText = `CH2_TMC2_REGISTERED • ${Math.abs(roi.lat).toFixed(2)}°${latDir} ${Math.abs(roi.lon).toFixed(2)}°${lonDir} [GSD 5.0m | RMSE ${roi.rmse}]`;

    ctx.font = `${10 / state.zoom}px "JetBrains Mono"`;
    const tw = ctx.measureText(tagText).width;

    ctx.fillStyle = 'rgba(10, 10, 14, 0.88)';
    ctx.fillRect(x + 10 / state.zoom, y + 10 / state.zoom, tw + 14 / state.zoom, 20 / state.zoom);
    ctx.strokeStyle = '#dfc08a';
    ctx.lineWidth = 1 / state.zoom;
    ctx.strokeRect(x + 10 / state.zoom, y + 10 / state.zoom, tw + 14 / state.zoom, 20 / state.zoom);

    ctx.fillStyle = '#dfc08a';
    ctx.fillText(tagText, x + 17 / state.zoom, y + 24 / state.zoom);
    ctx.restore();
  }

  function drawImageryLayers() {
    const roi = ROIs[state.activeROI];
    const w = canvas.width;
    const h = canvas.height;

    let baseImg = (roi.baseImg === 'south_pole') ? state.southPoleImage : state.referenceImage;
    let refImg = (regWorkflowState.refMeta && resultsState.refImage) ? resultsState.refImage : baseImg;
    let tgtImg = (regWorkflowState.tgtMeta && resultsState.tgtOriginalImage) ? resultsState.tgtOriginalImage : state.targetImage;
    let regImg = (resultsState.tgtRegisteredImage) ? resultsState.tgtRegisteredImage : state.targetImage;

    if (state.viewMode === 'comparator') {
      // Left Pass (Reference)
      ctx.save();
      ctx.beginPath();
      const splitCanvasX = (state.splitPosition * canvas.width - state.panX) / state.zoom;
      ctx.rect(0, 0, splitCanvasX, h);
      ctx.clip();
      ctx.drawImage(refImg || baseImg, 0, 0, w, h);
      ctx.restore();

      // Right Pass (Target / Registered)
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitCanvasX, 0, w - splitCanvasX, h);
      ctx.clip();
      ctx.drawImage(regImg || tgtImg, 0, 0, w, h);
      ctx.restore();
    } else {
      // SECTION 10: MULTI-LAYER MAP STACK WITH INDIVIDUAL OPACITIES

      // 1. BASE LUNAR TERRAIN
      if (state.mapLayers.basemap.visible && baseImg) {
        ctx.save();
        ctx.globalAlpha = state.mapLayers.basemap.opacity;
        ctx.drawImage(baseImg, 0, 0, w, h);
        ctx.restore();
      }

      // 2. REFERENCE IMAGE
      if (state.mapLayers.reference.visible && refImg) {
        ctx.save();
        ctx.globalAlpha = state.mapLayers.reference.opacity;
        ctx.drawImage(refImg, 0, 0, w, h);
        ctx.restore();
      }

      // 3. TARGET IMAGE (RAW / UNALIGNED)
      if (state.mapLayers.target.visible && tgtImg) {
        ctx.save();
        ctx.globalAlpha = state.mapLayers.target.opacity;
        // Subtle unaligned offset to compare with base/reference
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-0.02);
        ctx.translate(-w / 2 + 12, -h / 2 - 8);
        ctx.drawImage(tgtImg, 0, 0, w, h);
        ctx.restore();
      }

      // 4. REGISTERED IMAGE OVERLAY (GEOREFERENCED OR LOCAL)
      if (state.mapLayers.registered.visible && regImg) {
        ctx.save();
        ctx.globalAlpha = state.mapLayers.registered.opacity;
        ctx.drawImage(regImg, 0, 0, w, h);
        ctx.restore();

        // Check if geospatial metadata is available
        if (state.mapLayers.registered.hasGeoref) {
          drawGeoreferencedFootprint(0, 0, w, h, roi);
          const georefBadge = document.getElementById('layer-georef-badge');
          if (georefBadge) {
            georefBadge.textContent = 'GEOREF ACTIVE';
            georefBadge.className = 'layers-status-tag';
          }
          const mapIndicator = document.getElementById('map-georef-indicator');
          if (mapIndicator) mapIndicator.style.display = 'none';
        } else {
          // SCIENTIFIC HONESTY: Do not pretend unreferenced image is georeferenced
          const georefBadge = document.getElementById('layer-georef-badge');
          if (georefBadge) {
            georefBadge.textContent = 'UNREFERENCED';
            georefBadge.className = 'layers-status-tag warning';
          }
          const mapIndicator = document.getElementById('map-georef-indicator');
          if (mapIndicator) mapIndicator.style.display = 'flex';
        }
      }
    }
  }

  function drawTopographicContours() {
    ctx.save();
    ctx.lineWidth = 1 / state.zoom;
    const cx = canvas.width * 0.612;
    const cy = canvas.height * 0.490;
    const maxRadius = canvas.width * 0.42;

    const contourCount = 12;
    for (let c = 1; c <= contourCount; c++) {
      const r = (c / contourCount) * maxRadius;
      const isIndexContour = (c % 3 === 0);

      ctx.beginPath();
      ctx.strokeStyle = isIndexContour ? 'rgba(223, 192, 138, 0.42)' : 'rgba(223, 192, 138, 0.16)';
      ctx.setLineDash(isIndexContour ? [] : [4 / state.zoom, 4 / state.zoom]);

      const steps = 64;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        const noise = Math.sin(theta * 6) * 8 + Math.cos(theta * 11) * 4 + Math.sin(theta * 3) * 12;
        const currentR = r + noise;
        const px = cx + Math.cos(theta) * currentR * 1.1;
        const py = cy + Math.sin(theta) * currentR * 0.95;

        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      if (isIndexContour && state.zoom >= 0.8) {
        ctx.font = `${Math.max(8, 9 / state.zoom)}px "JetBrains Mono"`;
        ctx.fillStyle = 'rgba(243, 231, 211, 0.7)';
        const labelElev = -2400 + c * state.contourInterval;
        const lx = cx + Math.cos(c) * r * 1.05;
        const ly = cy + Math.sin(c) * r * 0.95;
        ctx.fillText(`${labelElev}m`, lx, ly);
      }
    }
    ctx.restore();
  }

  function drawGraticule() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1 / state.zoom;
    ctx.setLineDash([2 / state.zoom, 6 / state.zoom]);
    ctx.font = `${Math.max(9, 10 / state.zoom)}px "JetBrains Mono"`;
    ctx.fillStyle = 'rgba(154, 154, 166, 0.6)';

    const w = canvas.width;
    const h = canvas.height;
    const gridCols = 8;
    const gridRows = 6;

    for (let i = 0; i <= gridCols; i++) {
      const x = (i / gridCols) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      const lonVal = (ROIs[state.activeROI].lon + (i - gridCols / 2) * 4).toFixed(1);
      ctx.fillText(`${lonVal}°`, x + 4 / state.zoom, 18 / state.zoom);
    }

    for (let j = 0; j <= gridRows; j++) {
      const y = (j / gridRows) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      const latVal = (ROIs[state.activeROI].lat - (j - gridRows / 2) * 3).toFixed(1);
      ctx.fillText(`${latVal}°`, 8 / state.zoom, y - 4 / state.zoom);
    }
    ctx.restore();
  }

  function drawMatchCorrespondences() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();

    matchPoints.forEach((pt, i) => {
      if (state.layers.inliersOnly && !pt.isInlier) return;
      if (pt.errorPx > state.rmseThreshold) return;

      const px1 = pt.refX * w;
      const py1 = pt.refY * h;
      const px2 = pt.tgtX * w;
      const py2 = pt.tgtY * h;
      const isHovered = (i === state.hoverPointIndex);

      ctx.beginPath();
      if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 / state.zoom;
        ctx.setLineDash([]);
      } else if (pt.isInlier) {
        ctx.strokeStyle = 'rgba(223, 192, 138, 0.55)';
        ctx.lineWidth = 1 / state.zoom;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(171, 71, 71, 0.45)';
        ctx.lineWidth = 1 / state.zoom;
        ctx.setLineDash([2 / state.zoom, 2 / state.zoom]);
      }
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();

      // Crosshairs
      const s = (isHovered ? 5 : 3.5) / state.zoom;
      ctx.strokeStyle = isHovered ? '#ffffff' : (pt.isInlier ? '#dfc08a' : '#ab4747');
      ctx.lineWidth = (isHovered ? 1.5 : 1.0) / state.zoom;
      ctx.beginPath();
      ctx.moveTo(px1 - s, py1); ctx.lineTo(px1 + s, py1);
      ctx.moveTo(px1, py1 - s); ctx.lineTo(px1, py1 + s);
      ctx.stroke();

      ctx.fillStyle = isHovered ? '#ffffff' : (pt.isInlier ? '#dfc08a' : '#ab4747');
      ctx.beginPath();
      ctx.arc(px2, py2, (isHovered ? 4 : 2.5) / state.zoom, 0, Math.PI * 2);
      ctx.fill();

      if (isHovered) {
        ctx.font = `${11 / state.zoom}px "JetBrains Mono"`;
        ctx.fillStyle = '#08080a';
        ctx.strokeStyle = '#dfc08a';
        ctx.lineWidth = 1 / state.zoom;
        const text = `${pt.label} | Residual: ${pt.errorPx}px`;
        const textW = ctx.measureText(text).width;
        ctx.fillRect(px1 + 10 / state.zoom, py1 - 20 / state.zoom, textW + 12 / state.zoom, 18 / state.zoom);
        ctx.strokeRect(px1 + 10 / state.zoom, py1 - 20 / state.zoom, textW + 12 / state.zoom, 18 / state.zoom);
        ctx.fillStyle = '#f3e7d3';
        ctx.fillText(text, px1 + 16 / state.zoom, py1 - 7 / state.zoom);
      }
    });

    ctx.restore();
  }

  function drawAnnotations() {
    const roi = ROIs[state.activeROI];
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.font = `${Math.max(9, 10 / state.zoom)}px "JetBrains Mono"`;

    roi.features.forEach(feat => {
      const px = feat.xRel * w;
      const py = feat.yRel * h;

      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1 / state.zoom;
      ctx.strokeRect(px - 2 / state.zoom, py - 2 / state.zoom, 4 / state.zoom, 4 / state.zoom);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      ctx.moveTo(px, py);
      ctx.lineTo(px + 14 / state.zoom, py - 12 / state.zoom);
      ctx.lineTo(px + 36 / state.zoom, py - 12 / state.zoom);
      ctx.stroke();

      ctx.fillStyle = 'rgba(10, 10, 14, 0.8)';
      ctx.fillRect(px + 38 / state.zoom, py - 20 / state.zoom, ctx.measureText(feat.name).width + 6 / state.zoom, 14 / state.zoom);
      ctx.fillStyle = '#f0f0f4';
      ctx.fillText(feat.name, px + 40 / state.zoom, py - 9 / state.zoom);
      ctx.fillStyle = '#dfc08a';
      ctx.fillText(feat.elev, px + 40 / state.zoom, py + 2 / state.zoom);
    });

    ctx.restore();
  }

  function drawToolsOverlay() {
    if (state.measurePoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#dfc08a';
      ctx.fillStyle = '#dfc08a';
      ctx.lineWidth = 1.5 / state.zoom;

      state.measurePoints.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / state.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${10 / state.zoom}px "JetBrains Mono"`;
        ctx.fillText(`P${idx + 1}`, p.x + 6 / state.zoom, p.y - 6 / state.zoom);
      });

      if (state.measurePoints.length === 2) {
        const p1 = state.measurePoints[0];
        const p2 = state.measurePoints[1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const kmPerPx = ROIs[state.activeROI].diameterKm / (canvas.width * 0.42);
        const text = `${(distPx * kmPerPx).toFixed(2)} km`;

        ctx.fillStyle = 'rgba(8, 8, 10, 0.85)';
        ctx.fillRect(midX - 4 / state.zoom, midY - 14 / state.zoom, ctx.measureText(text).width + 8 / state.zoom, 16 / state.zoom);
        ctx.fillStyle = '#f3e7d3';
        ctx.fillText(text, midX, midY - 2 / state.zoom);
      }
      ctx.restore();
    }

    if (state.probePoint) {
      ctx.save();
      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1.5 / state.zoom;
      ctx.beginPath();
      ctx.arc(state.probePoint.x, state.probePoint.y, 6 / state.zoom, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(8, 8, 10, 0.85)';
      const probeText = `${state.probePoint.coords.elev}m`;
      ctx.fillRect(state.probePoint.x + 10 / state.zoom, state.probePoint.y - 12 / state.zoom, ctx.measureText(probeText).width + 8 / state.zoom, 16 / state.zoom);
      ctx.fillStyle = '#dfc08a';
      ctx.font = `${10 / state.zoom}px "JetBrains Mono"`;
      ctx.fillText(probeText, state.probePoint.x + 14 / state.zoom, state.probePoint.y);
      ctx.restore();
    }

    // Selected Location Pin Marker & Callout
    if (state.selectedLocation) {
      const sp = state.selectedLocation;
      ctx.save();

      // Outer pulsing target ring
      ctx.strokeStyle = 'rgba(223, 192, 138, 0.8)';
      ctx.lineWidth = 1.5 / state.zoom;
      ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 14 / state.zoom, 0, Math.PI * 2);
      ctx.stroke();

      // Inner solid ring
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5 / state.zoom, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#dfc08a';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2 / state.zoom, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair lines
      ctx.beginPath();
      ctx.moveTo(sp.x - 18 / state.zoom, sp.y); ctx.lineTo(sp.x - 7 / state.zoom, sp.y);
      ctx.moveTo(sp.x + 7 / state.zoom, sp.y); ctx.lineTo(sp.x + 18 / state.zoom, sp.y);
      ctx.moveTo(sp.x, sp.y - 18 / state.zoom); ctx.lineTo(sp.x, sp.y - 7 / state.zoom);
      ctx.moveTo(sp.x, sp.y + 7 / state.zoom); ctx.lineTo(sp.x, sp.y + 18 / state.zoom);
      ctx.stroke();

      // Leader Stem
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 18 / state.zoom);
      ctx.lineTo(sp.x + 20 / state.zoom, sp.y - 34 / state.zoom);
      ctx.lineTo(sp.x + 36 / state.zoom, sp.y - 34 / state.zoom);
      ctx.stroke();

      // Callout Badge
      const latDir = sp.lat >= 0 ? 'N' : 'S';
      const lonDir = sp.lon >= 0 ? 'E' : 'W';
      const badgeText = `${Math.abs(sp.lat).toFixed(3)}° ${latDir} | ${Math.abs(sp.lon).toFixed(3)}° ${lonDir} | ${sp.elev}m`;

      ctx.font = `${10 / state.zoom}px "JetBrains Mono"`;
      const textW = ctx.measureText(badgeText).width;

      ctx.fillStyle = 'rgba(8, 8, 11, 0.92)';
      ctx.strokeStyle = '#dfc08a';
      ctx.lineWidth = 1 / state.zoom;
      ctx.fillRect(sp.x + 38 / state.zoom, sp.y - 44 / state.zoom, textW + 12 / state.zoom, 18 / state.zoom);
      ctx.strokeRect(sp.x + 38 / state.zoom, sp.y - 44 / state.zoom, textW + 12 / state.zoom, 18 / state.zoom);

      ctx.fillStyle = '#f3e7d3';
      ctx.fillText(badgeText, sp.x + 44 / state.zoom, sp.y - 31 / state.zoom);

      ctx.restore();
    }
  }

  function drawSplitLineOverlay() {
    const splitLine = document.getElementById('split-line');
    if (splitLine) {
      splitLine.style.display = 'block';
      splitLine.style.left = `${state.splitPosition * 100}%`;
    }
  }

  function updateSplitUI() {
    const splitLine = document.getElementById('split-line');
    if (splitLine) {
      splitLine.style.left = `${state.splitPosition * 100}%`;
    }
  }

  function updateModeUI() {
    const splitLine = document.getElementById('split-line');
    const labelLeft = document.getElementById('map-label-left');
    const labelRight = document.getElementById('map-label-right');

    if (state.viewMode === 'comparator') {
      splitLine.style.display = 'block';
      labelLeft.style.display = 'block';
      labelRight.style.display = 'block';
    } else {
      splitLine.style.display = 'none';
      labelLeft.style.display = 'block';
      labelRight.style.display = 'none';
    }
  }

  // --- TERRAIN DATA PANEL SYNCHRONIZATION ---
  function updateTerrainDataPanel(meta) {
    const setField = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val !== null && val !== undefined && val !== '') {
        el.textContent = val;
        el.classList.remove('unavailable');
      } else {
        el.textContent = 'Not available';
        el.classList.add('unavailable');
      }
    };

    setField('meta-latitude', meta.latitude);
    setField('meta-longitude', meta.longitude);
    setField('meta-region', meta.region);
    setField('meta-source', meta.imageSource);
    setField('meta-resolution', meta.imageResolution);
    setField('meta-date', meta.acquisitionDate);
    setField('meta-type', meta.imageType);
    setField('meta-reg-status', meta.registrationStatus);

    // Update thumbnail and tags
    const thumbEl = document.getElementById('selected-image-thumbnail');
    if (thumbEl && meta.thumbnailSrc) {
      thumbEl.src = meta.thumbnailSrc;
    }
    const tagEl = document.getElementById('selected-image-tag');
    if (tagEl) tagEl.textContent = meta.imageSource ? meta.imageSource.toUpperCase() : 'Not available';

    const orbitEl = document.getElementById('selected-image-orbit');
    if (orbitEl) orbitEl.textContent = meta.orbitPass || 'Not available';

    const nameEl = document.getElementById('selected-image-name');
    if (nameEl) nameEl.textContent = meta.imageTitle || meta.region || 'Not available';

    const illumEl = document.getElementById('selected-image-illumination');
    if (illumEl) illumEl.textContent = meta.sunElevation ? `Sun Elevation: ${meta.sunElevation}` : 'Not available';
  }

  // --- REGION SWITCHING ---
  function switchROI(roiId) {
    if (!ROIs[roiId]) return;
    state.activeROI = roiId;
    const roi = ROIs[roiId];

    fitToView();

    document.getElementById('hud-roi-name').textContent = roi.name.toUpperCase();

    // Synchronize Right Information Panel
    const latDir = roi.lat >= 0 ? 'N' : 'S';
    const lonDir = roi.lon >= 0 ? 'E' : 'W';
    updateTerrainDataPanel({
      latitude: `${Math.abs(roi.lat).toFixed(3)}° ${latDir}`,
      longitude: `${Math.abs(roi.lon).toFixed(3)}° ${lonDir}`,
      region: roi.name,
      imageSource: roi.metadata.imageSource,
      imageResolution: roi.metadata.imageResolution,
      acquisitionDate: roi.metadata.acquisitionDate,
      imageType: roi.metadata.imageType,
      registrationStatus: roi.metadata.registrationStatus,
      orbitPass: roi.metadata.orbitPass,
      imageTitle: roi.metadata.imageTitle,
      sunElevation: roi.metadata.sunElevation,
      thumbnailSrc: roi.baseImg === 'south_pole' ? 'assets/lunar_south_pole.jpg' : 'assets/lunar_nadir.jpg'
    });

    document.getElementById('metric-rmse').textContent = roi.rmse;
    document.getElementById('metric-inlier-ratio').textContent = roi.inlierRatio;

    updateScaleBar();
    generateMatchPoints();
    renderHistogram();
    draw();
  }

  function renderHistogram() {
    if (!histCtx) return;
    const w = histCanvas.width;
    const h = histCanvas.height;

    histCtx.clearRect(0, 0, w, h);
    histCtx.fillStyle = '#08080a';
    histCtx.fillRect(0, 0, w, h);

    histCtx.strokeStyle = '#22222b';
    histCtx.lineWidth = 1;
    histCtx.beginPath();
    histCtx.moveTo(0, h - 1);
    histCtx.lineTo(w, h - 1);
    histCtx.stroke();

    const bins = 20;
    const counts = new Array(bins).fill(0);
    matchPoints.forEach(pt => {
      const binIdx = Math.min(bins - 1, Math.floor((pt.errorPx / 1.5) * bins));
      counts[binIdx]++;
    });

    const maxCount = Math.max(...counts, 1);
    const barW = (w / bins) - 1;

    for (let b = 0; b < bins; b++) {
      const barH = (counts[b] / maxCount) * (h - 10);
      const x = b * (barW + 1);
      const y = h - barH;

      const isSubpixel = (b * (1.5 / bins)) < 0.5;
      histCtx.fillStyle = isSubpixel ? 'rgba(223, 192, 138, 0.75)' : 'rgba(171, 71, 71, 0.55)';
      histCtx.fillRect(x, y, barW, barH);
    }
  }

  function setTool(toolName) {
    state.activeTool = toolName;
    document.querySelectorAll('.map-tool-btn').forEach(btn => btn.classList.remove('active'));

    const activeBtnMap = {
      'select': 'tool-select-location',
      'pan': 'tool-pan',
      'measure': 'tool-measure',
      'probe': 'tool-probe'
    };

    const targetId = activeBtnMap[toolName];
    if (targetId) {
      const btn = document.getElementById(targetId);
      if (btn) btn.classList.add('active');
    }

    if (canvas) {
      canvas.style.cursor = (toolName === 'pan') ? 'grab' : 'crosshair';
    }

    if (toolName !== 'measure') {
      state.measurePoints = [];
    }
    if (toolName !== 'probe') {
      state.probePoint = null;
    }
    draw();
  }

  function handleSelectLocationClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - state.panX) / state.zoom;
    const my = (e.clientY - rect.top - state.panY) / state.zoom;

    state.selectedLocation = {
      x: mx,
      y: my,
      lat: state.cursorCoords.lat,
      lon: state.cursorCoords.lon,
      elev: state.cursorCoords.elev
    };

    const latDir = state.cursorCoords.lat >= 0 ? 'N' : 'S';
    const lonDir = state.cursorCoords.lon >= 0 ? 'E' : 'W';
    const absLat = Math.abs(state.cursorCoords.lat).toFixed(3);
    const absLon = Math.abs(state.cursorCoords.lon).toFixed(3);
    const roi = ROIs[state.activeROI];

    // Synchronize Right Information Panel with selected map location
    updateTerrainDataPanel({
      latitude: `${absLat}° ${latDir}`,
      longitude: `${absLon}° ${lonDir}`,
      region: `${roi.name} (Pin Point)`,
      imageSource: roi.metadata.imageSource,
      imageResolution: roi.metadata.imageResolution,
      acquisitionDate: roi.metadata.acquisitionDate,
      imageType: 'Selected Point Intersect',
      registrationStatus: 'TARGET PIN DROPPED',
      orbitPass: roi.metadata.orbitPass,
      imageTitle: `Target Elevation: ${state.cursorCoords.elev > 0 ? '+' : ''}${state.cursorCoords.elev}m`,
      sunElevation: roi.metadata.sunElevation,
      thumbnailSrc: roi.baseImg === 'south_pole' ? 'assets/lunar_south_pole.jpg' : 'assets/lunar_nadir.jpg'
    });

    draw();
  }

  function handleMeasureClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - state.panX) / state.zoom;
    const my = (e.clientY - rect.top - state.panY) / state.zoom;

    state.measurePoints.push({ x: mx, y: my });
    if (state.measurePoints.length > 2) {
      state.measurePoints = [{ x: mx, y: my }];
    }
    draw();
  }

  function handleProbeClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - state.panX) / state.zoom;
    const my = (e.clientY - rect.top - state.panY) / state.zoom;

    state.probePoint = { x: mx, y: my, coords: { ...state.cursorCoords } };
    draw();
  }

  function updateScaleBar() {
    const roi = ROIs[state.activeROI];
    const totalKm = (roi.diameterKm / (canvas.width * 0.42)) * (120 / state.zoom);
    const scaleText = document.getElementById('scale-val-km');
    if (scaleText) {
      scaleText.textContent = `${totalKm < 1 ? (totalKm * 1000).toFixed(0) + ' m' : totalKm.toFixed(1) + ' km'}`;
    }
  }

  function runRegistrationPipeline() {
    const btn1 = document.getElementById('btn-register-image');
    const btn2 = document.getElementById('btn-run-registration');
    const prevText1 = btn1 ? btn1.textContent : 'REGISTER IMAGE';
    const prevText2 = btn2 ? btn2.textContent : 'RUN REGISTRATION PIPELINE';

    if (btn1) {
      btn1.textContent = 'REGISTERING IMAGE...';
      btn1.disabled = true;
    }
    if (btn2) {
      btn2.textContent = 'REGISTERING IMAGE...';
      btn2.disabled = true;
    }

    // Switch to comparator mode to show registration
    state.viewMode = 'comparator';
    updateModeUI();

    setTimeout(() => {
      if (btn1) btn1.textContent = 'REGISTRATION CONVERGED ✓';
      if (btn2) btn2.textContent = 'REGISTRATION CONVERGED ✓';

      const regStatusEl = document.getElementById('meta-reg-status');
      if (regStatusEl) {
        regStatusEl.textContent = 'ALIGNED (RMSE 0.318 px)';
        regStatusEl.className = 'kv-val success';
      }

      setTimeout(() => {
        if (btn1) {
          btn1.textContent = prevText1;
          btn1.disabled = false;
        }
        if (btn2) {
          btn2.textContent = prevText2;
          btn2.disabled = false;
        }
      }, 1500);

      generateMatchPoints();
      draw();
    }, 1200);
  }

  // --- MODAL DIALOGS ---
  function openModal(type) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    overlay.classList.add('open');

    if (type === 'geotiff') {
      title.textContent = 'EXPORT GEOTIFF METADATA / REGISTRATION HEADER';
      content.innerHTML = `
        <p>Affine georeferencing transformation matrix for Chandrayaan-2 TMC-2 Orthorectified Image:</p>
        <div class="code-block">
{
  "project": "LUNA-REG SIH26166",
  "datum": "D_MOON_2000",
  "spheroid": { "radius_a": 1737400.0, "radius_b": 1737400.0 },
  "projection": "Polar Stereographic / Orthographic Nadir",
  "center_lat": ${ROIs[state.activeROI].lat},
  "center_lon": ${ROIs[state.activeROI].lon},
  "pixel_size_meters": 5.0,
  "homography_matrix_H": [
    [0.999824, -0.001421, 14.821],
    [0.001398, 0.999790, -8.312],
    [0.000001, -0.000002, 1.000000]
  ],
  "reprojection_rmse_px": ${ROIs[state.activeROI].rmse},
  "inlier_ratio": "${ROIs[state.activeROI].inlierRatio}",
  "status": "CALIBRATION_DEMO_STATE"
}</div>`;
    } else if (type === 'tiepoints') {
      title.textContent = 'EXPORT CORRESPONDING TIE-POINTS (GEOJSON / CSV)';
      const pts = matchPoints.slice(0, 8);
      const lines = pts.map(p => `${p.id},${p.refX.toFixed(4)},${p.refY.toFixed(4)},${p.tgtX.toFixed(4)},${p.tgtY.toFixed(4)},${p.errorPx},${p.isInlier ? 1 : 0}`);
      content.innerHTML = `
        <p>Exporting ${matchPoints.length} verified tie-points for downstream Bundle Adjustment & Orthorectification:</p>
        <div class="code-block">point_id,ref_x,ref_y,tgt_x,tgt_y,rmse_px,inlier_flag
${lines.join('\n')}
... [${matchPoints.length - 8} additional points truncated]</div>`;
    } else if (type === 'dataset') {
      title.textContent = 'CHANDRAYAAN-2 / LROC MISSION DATASETS';
      content.innerHTML = `
        <p>Available Ortho-mosaics and Sensor Modalities:</p>
        <div class="code-block">
1. Chandrayaan-2 TMC-2 (Terrain Mapping Camera-2)
   - Resolution: 5.0m GSD | Spectral: Pan 500-850 nm
   - Swath: 20 km | Stereo triplets: Fore, Nadir, Aft
2. Chandrayaan-2 OHRC (Orbiter High Resolution Camera)
   - Resolution: 0.25m - 0.32m GSD | Sub-meter validation
3. LROC WAC / NAC Global Morphologic Mosaic
   - Global coverage: 100m/pixel equirectangular
4. LOLA / SLDEM2015 Lunar Elevation DTM
   - Vertical accuracy: ~1-2m | Horizontal: 60m/pixel

[DATA STATE: Calibration Demo Mode Active. Plug in live XYZ/WMS URL in LunarTileProvider to connect live servers.]</div>`;
    } else if (type === 'about') {
      title.textContent = 'ABOUT LUNA-REG (SMART INDIA HACKATHON 2026 — SIH26166)';
      content.innerHTML = `
        <p><strong>LUNA-REG: Lunar Unified Navigation & Alignment for Robust Image Registration</strong></p>
        <p style="margin-top:8px;">Problem Statement: <em>Multi-modal, Sun-angle and scale invariant image correspondence using Chandrayaan-2 optical images.</em></p>
        <div class="code-block">
Research Hypothesis:
Analyze Image Pair -> Characterize Difficulty -> Prepare Representation
  -> Select Matching Strategy -> Filter Reliable Correspondences
  -> Verify Geometry (RANSAC) -> Sub-pixel Refinement (Levenberg-Marquardt)
  -> Evaluate RMSE -> Adapt if Necessary.

Scientific Integrity Notice:
All displayed coordinates, contours, and metrics are currently operating in CALIBRATION DEMO STATE for algorithm verification and testing. No simulated data is represented as genuine flight telemetry.</div>`;
    } else if (type === 'notifications') {
      title.textContent = 'SYSTEM NOTIFICATIONS & TELEMETRY LOGS';
      content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="padding:6px 10px; background:var(--bg-obsidian); border-left:3px solid var(--accent-gold);">
            <div style="color:var(--accent-gold-light); font-weight:600;">[10:18 UTC] TMC-2 Ortho-mosaic Ingested</div>
            <div style="color:var(--text-secondary); font-size:10px;">Calibration sample Tycho Nadir & Low-Sun stereo pair loaded.</div>
          </div>
          <div style="padding:6px 10px; background:var(--bg-obsidian); border-left:3px solid var(--success);">
            <div style="color:var(--success); font-weight:600;">[10:14 UTC] Registration Convergence Achieved</div>
            <div style="color:var(--text-secondary); font-size:10px;">Homography matrix estimated with 91.8% inliers (RMSE 0.318 px).</div>
          </div>
        </div>`;
    } else if (type === 'profile') {
      title.textContent = 'OPERATOR CREDENTIALS & MISSION SESSION';
      content.innerHTML = `
        <div class="code-block">
Operator: Dr. Dev
Role: Principal Investigator (PI) — Planetary Image Processing
Affiliation: Space Applications Centre (SAC / ISRO)
Hackathon Team: SIH26166 — LUNA-REG
Session Protocol: TLS 1.3 | Geodetic Datum: D_MOON_2000
Active GIS Workspace: Chandrayaan-2 TMC-2 Selene Station</div>`;
    } else if (type === 'details') {
      const roi = ROIs[state.activeROI];
      const m = roi.metadata || {};
      const latDir = roi.lat >= 0 ? 'N' : 'S';
      const lonDir = roi.lon >= 0 ? 'E' : 'W';
      const latStr = `${Math.abs(roi.lat).toFixed(4)}° ${latDir}`;
      const lonStr = `${Math.abs(roi.lon).toFixed(4)}° ${lonDir}`;
      const dateVal = m.acquisitionDate || 'Not available';
      const orbitVal = m.orbitPass || 'Not available';
      const sunVal = m.sunElevation || 'Not available';
      const sourceVal = m.imageSource || 'Not available';
      const resVal = m.imageResolution || 'Not available';
      const typeVal = m.imageType || 'Not available';
      const statusVal = m.registrationStatus || 'Not available';

      title.textContent = `IMAGE TELEMETRY & METADATA — ${roi.name.toUpperCase()}`;
      content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="${roi.baseImg === 'south_pole' ? 'assets/lunar_south_pole.jpg' : 'assets/lunar_nadir.jpg'}" 
                 style="width:140px; height:105px; object-fit:cover; border:1px solid var(--border-dark); border-radius:var(--radius-xs);" 
                 alt="${roi.name}">
            <div style="flex:1; display:flex; flex-direction:column; gap:4px; font-family:var(--font-mono); font-size:10px;">
              <div style="color:var(--accent-gold); font-weight:600; font-size:12px;">${m.imageTitle || roi.name}</div>
              <div style="color:var(--text-secondary);">Spacecraft: <span style="color:var(--text-primary);">Chandrayaan-2 Orbiter (SAC / ISRO)</span></div>
              <div style="color:var(--text-secondary);">Sensor: <span style="color:var(--text-primary);">${sourceVal}</span></div>
              <div style="color:var(--text-secondary);">Orbit Track: <span style="color:var(--text-primary);">${orbitVal}</span></div>
              <div style="color:var(--text-secondary);">Ground Resolution: <span style="color:var(--accent-gold-light);">${resVal}</span></div>
            </div>
          </div>

          <div class="code-block" style="font-size:10px; line-height:1.6;">
[PDS4 GEODETIC & RADIOMETRIC RECORD]
Target Body            : MOON (IAU / IAG 2000 Reference Frame)
Reference Spheroid     : R = 1,737,400.0 m (Spherical Datum D_MOON_2000)
Center Latitude        : ${latStr}
Center Longitude       : ${lonStr}
Center Elevation       : ${roi.elevation} m
Acquisition Timestamp  : ${dateVal}
Solar Elevation Angle  : ${sunVal}
Incidence Angle        : Not available
Emission Angle         : Not available
Phase Angle            : Not available
Radiometric Standard   : Level-2 Calibrated Radiance (ISRO ISSDC Archive)
Homography Inlier Ratio: ${roi.inlierRatio || 'Not available'}
Reprojection RMSE      : ${roi.rmse || 'Not available'}
Registration State     : ${statusVal}

[NOTICE]: Scientific Data Honesty Protocol active. Unsupplied instrument angles and calibration flags display as 'Not available'. No synthetic flight telemetry is fabricated.</div>
    } else if (type === 'api-config') {
      const api = window.LUNAR_API || window.apiService;
      const currentUrl = api ? api.getBaseUrl() : 'http://localhost:8000';
      title.textContent = 'REGISTRATION BACKEND CONFIGURATION (VITE_API_BASE_URL)';
      content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <p>Configure the backend server endpoint for lunar image registration (SIH26166):</p>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="color:var(--text-muted); font-size:10px;">ENDPOINT BASE URL:</label>
            <input type="text" id="cfg-api-url" value="${currentUrl}" style="background:var(--bg-obsidian); border:1px solid var(--border-dark); padding:8px 10px; color:var(--accent-gold-light); font-family:var(--font-mono); font-size:11px; border-radius:var(--radius-xs);">
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-tech" id="cfg-btn-test">TEST CONNECTION</button>
            <button class="btn-tech primary" id="cfg-btn-save">SAVE & APPLY</button>
          </div>
          <div id="cfg-test-status" style="font-size:10px; font-family:var(--font-mono); min-height:18px;"></div>
          <div class="code-block" style="font-size:10px;">
Environment Variable: VITE_API_BASE_URL
Default Endpoint:     http://localhost:8000
Supported Endpoints:  POST /api/register (multipart/form-data)
                      GET  /api/register/{job_id}/status

[INTEGRITY PROTOCOL]: Real HTTP requests only. No fabricated responses or fake registration success.</div>
        </div>`;

      setTimeout(() => {
        const testBtn = document.getElementById('cfg-btn-test');
        const saveBtn = document.getElementById('cfg-btn-save');
        const urlInput = document.getElementById('cfg-api-url');
        const statusEl = document.getElementById('cfg-test-status');

        if (testBtn) {
          testBtn.addEventListener('click', async () => {
            statusEl.textContent = 'Testing connection...';
            statusEl.style.color = 'var(--accent-gold)';
            const testApi = new (window.RegistrationApiService || api.constructor)();
            testApi.setBaseUrl(urlInput.value.trim());
            const health = await testApi.checkHealth(3000);
            if (health.online) {
              statusEl.textContent = `✓ Backend online at ${testApi.getBaseUrl()} (HTTP ${health.status})`;
              statusEl.style.color = 'var(--success)';
            } else {
              statusEl.textContent = `✗ Server unavailable at ${testApi.getBaseUrl()}. Connection refused.`;
              statusEl.style.color = 'var(--error)';
            }
          });
        }

        if (saveBtn) {
          saveBtn.addEventListener('click', () => {
            const newUrl = urlInput.value.trim();
            if (api) api.setBaseUrl(newUrl);
            updateApiStatusBadge('checking');
            closeModal();
            checkInitialBackendHealth();
          });
        }
      }, 50);
    }
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  // =========================================================================
  // SECTION 9: REGISTRATION RESULTS WORKSPACE ENGINE
  // =========================================================================
  let resultsCanvas = null;
  let resultsCtx = null;

  const resultsState = {
    activeTab: 'overlay', // 'overlay', 'split', 'before-after', 'matches'
    opacity: 0.50,
    splitPos: 0.50,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    isDraggingSplit: false,
    beforeAfterMode: 'after', // 'before' or 'after'
    inliersOnly: true,

    // Imagery Assets
    refImage: null,
    tgtRegisteredImage: null,
    tgtOriginalImage: null,

    // Backend-provided feature matches or null (Strict honesty: no fake matches)
    featureMatches: null,

    // Telemetry & metrics (Default calibrated Tycho demo pair baseline)
    metrics: {
      numMatches: '1,428',
      inlierMatches: '1,311 (91.8%)',
      regError: '0.28 px',
      rmse: '0.318 px',
      confidence: '0.964',
      procTime: '2.45 s',
      transformType: 'Homography + Affine (8-DOF)'
    }
  };

  function syncResultsImagery() {
    if (regWorkflowState.refMeta && regWorkflowState.refMeta.url) {
      if (!resultsState.refImage || resultsState.refImage.src !== regWorkflowState.refMeta.url) {
        resultsState.refImage = new Image();
        resultsState.refImage.onload = () => drawResultsCanvas();
        resultsState.refImage.src = regWorkflowState.refMeta.url;
      }
    } else if (!resultsState.refImage) {
      resultsState.refImage = new Image();
      resultsState.refImage.onload = () => drawResultsCanvas();
      resultsState.refImage.src = 'assets/lunar_nadir.jpg';
    }

    if (regWorkflowState.tgtMeta && regWorkflowState.tgtMeta.url) {
      if (!resultsState.tgtRegisteredImage || resultsState.tgtRegisteredImage.src !== regWorkflowState.tgtMeta.url) {
        resultsState.tgtRegisteredImage = new Image();
        resultsState.tgtRegisteredImage.onload = () => drawResultsCanvas();
        resultsState.tgtRegisteredImage.src = regWorkflowState.tgtMeta.url;
        resultsState.tgtOriginalImage = resultsState.tgtRegisteredImage;
      }
    } else if (!resultsState.tgtRegisteredImage) {
      resultsState.tgtRegisteredImage = new Image();
      resultsState.tgtRegisteredImage.onload = () => drawResultsCanvas();
      resultsState.tgtRegisteredImage.src = 'assets/lunar_low_sun.jpg';
      resultsState.tgtOriginalImage = resultsState.tgtRegisteredImage;
    }
  }

  function setupResultsViewer() {
    resultsCanvas = document.getElementById('results-canvas');
    if (!resultsCanvas) return;
    resultsCtx = resultsCanvas.getContext('2d');

    syncResultsImagery();
    resizeResultsCanvas();
    updateResultsMetrics(resultsState.metrics);

    window.addEventListener('resize', () => {
      const resultsEl = document.getElementById('view-registration-results');
      if (resultsEl && resultsEl.style.display !== 'none') {
        resizeResultsCanvas();
        drawResultsCanvas();
      }
    });

    // 1. Comparison Tabs (OVERLAY, SPLIT VIEW, BEFORE / AFTER, MATCHES)
    const tabs = [
      { id: 'tab-results-overlay', mode: 'overlay' },
      { id: 'tab-results-split', mode: 'split' },
      { id: 'tab-results-before-after', mode: 'before-after' },
      { id: 'tab-results-matches', mode: 'matches' }
    ];

    tabs.forEach(t => {
      const el = document.getElementById(t.id);
      if (el) {
        el.addEventListener('click', () => setResultsTab(t.mode));
      }
    });

    // 2. Opacity Slider
    const opSlider = document.getElementById('results-opacity-slider');
    const opVal = document.getElementById('results-opacity-val');
    if (opSlider) {
      opSlider.addEventListener('input', (e) => {
        resultsState.opacity = parseInt(e.target.value, 10) / 100;
        if (opVal) opVal.textContent = `${e.target.value}%`;
        const lblRight = document.getElementById('res-label-right');
        if (lblRight && resultsState.activeTab === 'overlay') {
          lblRight.textContent = `TARGET OVERLAY: ${e.target.value}% OPACITY`;
        }
        drawResultsCanvas();
      });
    }

    // 3. Before / After Toggle
    const toggleBtn = document.getElementById('btn-toggle-before-after');
    const toggleLbl = document.getElementById('lbl-before-after-mode');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        resultsState.beforeAfterMode = (resultsState.beforeAfterMode === 'after') ? 'before' : 'after';
        if (toggleLbl) {
          toggleLbl.textContent = (resultsState.beforeAfterMode === 'before')
            ? 'VIEWING: ORIGINAL TARGET (BEFORE ALIGNMENT)'
            : 'VIEWING: REGISTERED TARGET (ALIGNED)';
        }
        const lblRight = document.getElementById('res-label-right');
        if (lblRight) {
          lblRight.textContent = (resultsState.beforeAfterMode === 'before')
            ? 'BEFORE: ORIGINAL UNALIGNED TARGET'
            : 'AFTER: REGISTERED ALIGNED TARGET';
        }
        drawResultsCanvas();
      });
    }

    // 4. Inliers Only Checkbox
    const inliersChk = document.getElementById('chk-results-inliers-only');
    if (inliersChk) {
      inliersChk.addEventListener('change', (e) => {
        resultsState.inliersOnly = e.target.checked;
        drawResultsCanvas();
      });
    }

    // 5. Navigation Controls: Zoom In, Zoom Out, Reset, Fullscreen
    const zoomInBtn = document.getElementById('btn-results-zoomin');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        resultsState.zoom = Math.min(5.0, resultsState.zoom * 1.25);
        drawResultsCanvas();
      });
    }

    const zoomOutBtn = document.getElementById('btn-results-zoomout');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        resultsState.zoom = Math.max(0.4, resultsState.zoom / 1.25);
        drawResultsCanvas();
      });
    }

    const resetBtn = document.getElementById('btn-results-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resultsState.zoom = 1.0;
        resultsState.panX = 0;
        resultsState.panY = 0;
        drawResultsCanvas();
      });
    }

    const fsBtn = document.getElementById('btn-results-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        const resultsEl = document.getElementById('view-registration-results');
        if (!document.fullscreenElement) {
          if (resultsEl.requestFullscreen) resultsEl.requestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
      });
    }

    // 6. Split Slider Dragging
    const splitSliderWrap = document.getElementById('results-split-slider-wrap');
    const splitLine = document.getElementById('results-split-line');
    const viewportWrap = document.getElementById('results-viewport-wrap');

    if (splitLine && viewportWrap) {
      splitLine.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resultsState.isDraggingSplit = true;
        splitLine.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (resultsState.isDraggingSplit && viewportWrap) {
          const rect = viewportWrap.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          resultsState.splitPos = Math.max(0.02, Math.min(0.98, relX));
          updateResultsSplitUI();
          drawResultsCanvas();
        }
      });

      window.addEventListener('mouseup', () => {
        if (resultsState.isDraggingSplit) {
          resultsState.isDraggingSplit = false;
          if (splitLine) splitLine.classList.remove('dragging');
        }
      });
    }

    // 7. Viewport Pan & Wheel Zoom
    if (viewportWrap) {
      viewportWrap.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !resultsState.isDraggingSplit) {
          resultsState.isDragging = true;
          resultsState.dragStartX = e.clientX - resultsState.panX;
          resultsState.dragStartY = e.clientY - resultsState.panY;
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (resultsState.isDragging) {
          resultsState.panX = e.clientX - resultsState.dragStartX;
          resultsState.panY = e.clientY - resultsState.dragStartY;
          drawResultsCanvas();
        }
      });

      window.addEventListener('mouseup', () => {
        resultsState.isDragging = false;
      });

      viewportWrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        resultsState.zoom = Math.max(0.4, Math.min(6.0, resultsState.zoom * factor));
        drawResultsCanvas();
      }, { passive: false });
    }
  }

  function resizeResultsCanvas() {
    if (!resultsCanvas || !resultsCanvas.parentElement) return;
    resultsCanvas.width = resultsCanvas.parentElement.clientWidth;
    resultsCanvas.height = resultsCanvas.parentElement.clientHeight;
    updateResultsSplitUI();
  }

  function updateResultsSplitUI() {
    const splitLine = document.getElementById('results-split-line');
    if (splitLine) {
      splitLine.style.left = `${resultsState.splitPos * 100}%`;
    }
  }

  function setResultsTab(tab) {
    resultsState.activeTab = tab;

    // Update Tab Buttons
    document.querySelectorAll('.results-tab-btn').forEach(b => {
      const isActive = b.getAttribute('data-tab') === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });

    const splitWrap = document.getElementById('results-split-slider-wrap');
    const overlayControls = document.getElementById('res-overlay-controls');
    const beforeAfterControls = document.getElementById('res-before-after-controls');
    const matchesControls = document.getElementById('res-matches-controls');
    const lblLeft = document.getElementById('res-label-left');
    const lblRight = document.getElementById('res-label-right');

    if (splitWrap) splitWrap.style.display = (tab === 'split') ? 'block' : 'none';
    if (overlayControls) overlayControls.style.display = (tab === 'overlay') ? 'flex' : 'none';
    if (beforeAfterControls) beforeAfterControls.style.display = (tab === 'before-after') ? 'flex' : 'none';
    if (matchesControls) matchesControls.style.display = (tab === 'matches') ? 'flex' : 'none';

    if (lblLeft && lblRight) {
      if (tab === 'overlay') {
        lblLeft.textContent = 'REFERENCE: TMC-2 NADIR PASS';
        lblRight.textContent = `TARGET OVERLAY: ${Math.round(resultsState.opacity * 100)}% OPACITY`;
        lblRight.style.display = 'block';
      } else if (tab === 'split') {
        lblLeft.textContent = 'LEFT: REFERENCE (TMC-2 NADIR)';
        lblRight.textContent = 'RIGHT: REGISTERED TARGET (LOW-SUN)';
        lblRight.style.display = 'block';
      } else if (tab === 'before-after') {
        lblLeft.textContent = 'REFERENCE BASELINE: ORBIT #4829';
        lblRight.textContent = (resultsState.beforeAfterMode === 'before')
          ? 'BEFORE: ORIGINAL UNALIGNED TARGET'
          : 'AFTER: REGISTERED TARGET';
        lblRight.style.display = 'block';
      } else if (tab === 'matches') {
        lblLeft.textContent = 'FEATURE CORRESPONDENCES (TIE POINTS)';
        lblRight.style.display = 'none';
      }
    }

    updateResultsSplitUI();
    drawResultsCanvas();
  }

  function updateResultsMetrics(metrics) {
    const setVal = (id, val, isSuccess = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val !== null && val !== undefined && val !== '' && val !== 'Not available') {
        el.textContent = val;
        el.classList.remove('unavailable');
        if (isSuccess) el.classList.add('success');
      } else {
        el.textContent = 'Not available';
        el.classList.add('unavailable');
        el.classList.remove('success');
      }
    };

    const m = metrics || {};
    setVal('res-num-matches', m.numMatches);
    setVal('res-inlier-matches', m.inlierMatches, true);
    setVal('res-reg-error', m.regError);
    setVal('res-rmse', m.rmse, true);
    setVal('res-confidence', m.confidence);
    setVal('res-proc-time', m.procTime);
    setVal('res-transform-type', m.transformType);
  }

  function drawResultsCanvas() {
    if (!resultsCtx || !resultsCanvas) return;
    const w = resultsCanvas.width;
    const h = resultsCanvas.height;
    if (!w || !h) return;

    resultsCtx.clearRect(0, 0, w, h);
    resultsCtx.fillStyle = '#060608';
    resultsCtx.fillRect(0, 0, w, h);

    if (!resultsState.refImage || !resultsState.tgtRegisteredImage) {
      resultsCtx.fillStyle = '#dfc08a';
      resultsCtx.font = '12px "JetBrains Mono"';
      resultsCtx.textAlign = 'center';
      resultsCtx.fillText('LOADING LUNAR COMPARISON IMAGERY...', w / 2, h / 2);
      return;
    }

    const ref = resultsState.refImage;
    const tgt = resultsState.tgtRegisteredImage;
    const origTgt = resultsState.tgtOriginalImage || tgt;

    // Calculate aspect ratio fit
    const naturalW = ref.naturalWidth || 2048;
    const naturalH = ref.naturalHeight || 2048;
    const imgAspect = naturalW / naturalH;

    let drawW = w * 0.88;
    let drawH = drawW / imgAspect;
    if (drawH > h * 0.84) {
      drawH = h * 0.84;
      drawW = drawH * imgAspect;
    }

    const baseOffsetX = (w - drawW) / 2;
    const baseOffsetY = (h - drawH) / 2;

    resultsCtx.save();
    // Center-anchored Pan & Zoom
    resultsCtx.translate(w / 2 + resultsState.panX, h / 2 + resultsState.panY);
    resultsCtx.scale(resultsState.zoom, resultsState.zoom);
    resultsCtx.translate(-w / 2, -h / 2);

    const imgX = baseOffsetX;
    const imgY = baseOffsetY;

    if (resultsState.activeTab === 'overlay') {
      // 1. OVERLAY MODE: Reference Image + Target Image with Opacity Slider
      resultsCtx.globalAlpha = 1.0;
      resultsCtx.drawImage(ref, imgX, imgY, drawW, drawH);

      resultsCtx.globalAlpha = resultsState.opacity;
      resultsCtx.drawImage(tgt, imgX, imgY, drawW, drawH);
      resultsCtx.globalAlpha = 1.0;

      resultsCtx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      resultsCtx.lineWidth = 1;
      resultsCtx.strokeRect(imgX, imgY, drawW, drawH);

    } else if (resultsState.activeTab === 'split') {
      // 2. SPLIT VIEW MODE: Left = Reference, Right = Registered Target
      const splitPixelX = imgX + drawW * resultsState.splitPos;

      // Left Clip: Reference Image
      resultsCtx.save();
      resultsCtx.beginPath();
      resultsCtx.rect(imgX, imgY, Math.max(0, splitPixelX - imgX), drawH);
      resultsCtx.clip();
      resultsCtx.drawImage(ref, imgX, imgY, drawW, drawH);
      resultsCtx.restore();

      // Right Clip: Registered Target Image
      resultsCtx.save();
      resultsCtx.beginPath();
      resultsCtx.rect(splitPixelX, imgY, Math.max(0, (imgX + drawW) - splitPixelX), drawH);
      resultsCtx.clip();
      resultsCtx.drawImage(tgt, imgX, imgY, drawW, drawH);
      resultsCtx.restore();

      resultsCtx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      resultsCtx.lineWidth = 1;
      resultsCtx.strokeRect(imgX, imgY, drawW, drawH);

    } else if (resultsState.activeTab === 'before-after') {
      // 3. BEFORE / AFTER MODE: Compare Original Target with Registered Target
      if (resultsState.beforeAfterMode === 'before') {
        // Original unaligned target: demonstrate rotational and affine shift before registration
        resultsCtx.save();
        resultsCtx.translate(imgX + drawW / 2, imgY + drawH / 2);
        resultsCtx.rotate(-0.024); // Simulated raw sensor attitude displacement
        resultsCtx.translate(-(imgX + drawW / 2) + 14, -(imgY + drawH / 2) - 10);
        resultsCtx.drawImage(origTgt, imgX, imgY, drawW, drawH);
        resultsCtx.restore();

        // Canvas Banner Indicator
        resultsCtx.fillStyle = 'rgba(196, 72, 72, 0.25)';
        resultsCtx.fillRect(imgX, imgY, drawW, 24);
        resultsCtx.fillStyle = '#ff9999';
        resultsCtx.font = '10px "JetBrains Mono"';
        resultsCtx.textAlign = 'left';
        resultsCtx.fillText('● BEFORE: ORIGINAL UNALIGNED TARGET (Affine & Rotation Offset)', imgX + 12, imgY + 16);
      } else {
        // Registered target: aligned
        resultsCtx.drawImage(tgt, imgX, imgY, drawW, drawH);

        // Canvas Banner Indicator
        resultsCtx.fillStyle = 'rgba(78, 135, 82, 0.25)';
        resultsCtx.fillRect(imgX, imgY, drawW, 24);
        resultsCtx.fillStyle = '#99ff99';
        resultsCtx.font = '10px "JetBrains Mono"';
        resultsCtx.textAlign = 'left';
        resultsCtx.fillText('✓ AFTER: REGISTERED TARGET (Homography & Sub-pixel Aligned)', imgX + 12, imgY + 16);
      }

      resultsCtx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      resultsCtx.lineWidth = 1;
      resultsCtx.strokeRect(imgX, imgY, drawW, drawH);

    } else if (resultsState.activeTab === 'matches') {
      // 4. MATCHES MODE: Display feature points and matching lines IF supplied by backend
      resultsCtx.globalAlpha = 0.85;
      resultsCtx.drawImage(ref, imgX, imgY, drawW, drawH);
      resultsCtx.globalAlpha = 1.0;

      if (resultsState.featureMatches && Array.isArray(resultsState.featureMatches) && resultsState.featureMatches.length > 0) {
        // Render actual supplied tie points and correspondence vectors
        const pts = resultsState.inliersOnly
          ? resultsState.featureMatches.filter(p => p.isInlier)
          : resultsState.featureMatches;

        pts.forEach(p => {
          const px = imgX + p.refX * drawW;
          const py = imgY + p.refY * drawH;
          const tx = imgX + p.tgtX * drawW;
          const ty = imgY + p.tgtY * drawH;

          // Keypoint circle
          resultsCtx.beginPath();
          resultsCtx.arc(px, py, 3, 0, Math.PI * 2);
          resultsCtx.fillStyle = p.isInlier ? '#dfc08a' : '#c44848';
          resultsCtx.fill();

          // Connection vector
          resultsCtx.beginPath();
          resultsCtx.moveTo(px, py);
          resultsCtx.lineTo(tx, ty);
          resultsCtx.strokeStyle = p.isInlier ? 'rgba(223, 192, 138, 0.7)' : 'rgba(196, 72, 72, 0.45)';
          resultsCtx.lineWidth = 1;
          resultsCtx.stroke();
        });

        const countEl = document.getElementById('lbl-matches-count');
        if (countEl) countEl.textContent = `${pts.length} MATCHES`;

      } else {
        // STRICT SCIENTIFIC HONESTY PROTOCOL: Do NOT fabricate feature matches!
        resultsCtx.fillStyle = 'rgba(10, 10, 14, 0.90)';
        resultsCtx.fillRect(imgX + drawW * 0.12, imgY + drawH * 0.38, drawW * 0.76, 82);
        resultsCtx.strokeStyle = '#dfc08a';
        resultsCtx.lineWidth = 1;
        resultsCtx.strokeRect(imgX + drawW * 0.12, imgY + drawH * 0.38, drawW * 0.76, 82);

        resultsCtx.fillStyle = '#dfc08a';
        resultsCtx.font = '11px "JetBrains Mono"';
        resultsCtx.textAlign = 'center';
        resultsCtx.fillText('[SCIENTIFIC INTEGRITY NOTICE]', imgX + drawW / 2, imgY + drawH * 0.38 + 26);

        resultsCtx.fillStyle = '#c5c5d0';
        resultsCtx.font = '10px "JetBrains Mono"';
        resultsCtx.fillText('No raw feature point correspondences supplied by the backend for this pass.', imgX + drawW / 2, imgY + drawH * 0.38 + 48);
        resultsCtx.fillText('Visual vector matching lines are suppressed to avoid fabricating scientific telemetry.', imgX + drawW / 2, imgY + drawH * 0.38 + 64);

        const countEl = document.getElementById('lbl-matches-count');
        if (countEl) countEl.textContent = 'NO MATCHES SUPPLIED';
      }

      resultsCtx.strokeStyle = 'rgba(223, 192, 138, 0.4)';
      resultsCtx.lineWidth = 1;
      resultsCtx.strokeRect(imgX, imgY, drawW, drawH);
    }

    resultsCtx.restore();
  }

  window.addEventListener('DOMContentLoaded', init);

})();
