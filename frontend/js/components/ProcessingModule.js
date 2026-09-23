/**
 * LUNA-REG — ProcessingModule Component
 * Completely decoupled, independent scientific Processing Module for lunar image registration.
 * Executes SIFT feature detection, BFMatcher KNN, Lowe's ratio test, RANSAC homography,
 * perspective warping, and generates 6 verification visual artifacts.
 */

class ProcessingModule {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Container element or selector
   * @param {string} [options.apiEndpoint] - Backend processing endpoint
   * @param {Function} [options.onComplete] - Callback fired when registration completes
   * @param {Function} [options.onProceedToOutput] - Callback fired when user proceeds to Output Module
   */
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : (options.container || null);

    this.apiEndpoint = options.apiEndpoint || '/api/v1/registration/process';
    this.onComplete = options.onComplete || null;
    this.onProceedToOutput = options.onProceedToOutput || null;

    // Input Payloads State
    this.inputs = {
      reference: null,  // { file, name, size, dimensions, path }
      moving: null,     // { file, name, size, dimensions, path }
      stageId: null
    };

    // Processing Settings
    this.settings = {
      ratioThreshold: 0.75,
      ransacThreshold: 5.0,
      maxFeatures: 2000,
      contrastEnhancement: true,
      rescaleFactor: 1.0
    };

    // Execution & Pipeline State
    this.isProcessing = false;
    this.currentStepIndex = -1;
    this.activeArtifactTab = 'registered';
    this.result = null;

    // 12 Scientific Pipeline Steps Definition
    this.steps = [
      { id: 1, name: 'Raster Ingestion', desc: 'Decoding PDS .IMG, GeoTIFF, or standard raster payloads' },
      { id: 2, name: 'Validation & Checks', desc: 'Validating array dimensions, non-empty shapes (>=16x16 px)' },
      { id: 3, name: 'Preprocessing & CLAHE', desc: 'Grayscale conversion, dynamic range normalization & contrast' },
      { id: 4, name: 'SIFT Keypoint Detection', desc: 'Multi-scale scale-space extrema detection for both frames' },
      { id: 5, name: 'Descriptor Extraction', desc: 'Computing 128-D orientation-invariant SIFT descriptors' },
      { id: 6, name: 'BFMatcher L2 Matching', desc: 'Brute-Force pairwise L2 Euclidean descriptor matching' },
      { id: 7, name: 'KNN & Lowe Ratio Test', desc: 'k=2 nearest neighbors with ambiguity filtering' },
      { id: 8, name: 'Coordinate Verification', desc: 'Sub-pixel coordinate transformation & correspondence checks' },
      { id: 9, name: 'RANSAC Outlier Rejection', desc: 'Robust homography estimation & outlier geometric filtering' },
      { id: 10, name: 'Perspective Warping', desc: 'Aligning moving frame onto reference pixel grid' },
      { id: 11, name: 'Quality Metric Synthesis', desc: 'Computing inlier ratio, reprojection error & spatial score' },
      { id: 12, name: 'Artifact Generation', desc: 'Synthesizing 6 high-fidelity verification visual maps' }
    ];

    // DOM Element References
    this.element = null;

    // Auto-listen to decoupled event from Input Module
    this.bindGlobalEvents();
  }

  /**
   * Listen for decoupled input staging events
   */
  bindGlobalEvents() {
    if (typeof window !== 'undefined') {
      window.addEventListener('luna:input-staged', (evt) => {
        if (evt.detail) {
          this.setInputsFromStagedDetail(evt.detail);
        }
      });
    }
  }

  /**
   * Receive clean data object from Input Module
   */
  setInputsFromStagedDetail(detail) {
    this.inputs.reference = {
      file: detail.referenceImage.file || null,
      name: detail.referenceImage.name || 'reference_image.png',
      size: detail.referenceImage.size || 0,
      dimensions: detail.referenceImage.dimensions || null,
      url: detail.referenceImage.file ? URL.createObjectURL(detail.referenceImage.file) : null
    };

    this.inputs.moving = {
      file: detail.movingImage.file || null,
      name: detail.movingImage.name || 'moving_image.png',
      size: detail.movingImage.size || 0,
      dimensions: detail.movingImage.dimensions || null,
      url: detail.movingImage.file ? URL.createObjectURL(detail.movingImage.file) : null
    };

    this.inputs.stageId = detail.stageId || null;
    this.updateInputsUI();
  }

  /**
   * Directly inject inputs programmatically (independent testing)
   */
  setInputs(reference, moving, stageId = null) {
    this.inputs.reference = reference;
    this.inputs.moving = moving;
    this.inputs.stageId = stageId;
    this.updateInputsUI();
  }

  /**
   * Mount and render the Processing Module
   */
  render() {
    if (!this.container) return null;

    this.element = document.createElement('div');
    this.element.className = 'processing-module-container';
    this.element.id = 'lunaRegProcessingModule';

    this.element.innerHTML = `
      <!-- Mission HUD Top Header Banner -->
      <div class="processing-mission-banner">
        <div class="processing-banner-title">
          <div class="processing-banner-icon">⚙</div>
          <div class="processing-banner-text">
            <h2>LUNA-REG • SIFT PROCESSING MODULE</h2>
            <p>High-Precision Feature Extraction, Homography Alignment & Verification</p>
          </div>
        </div>
        <div class="processing-spec-chips">
          <span class="processing-spec-chip highlight">ALGORITHM: SIFT + BF-KNN + RANSAC</span>
          <span class="processing-spec-chip">INDEPENDENT ENGINE</span>
          <span class="processing-spec-chip" id="chipPipelineStatus">STATUS: IDLE</span>
        </div>
      </div>

      <!-- Staged Inputs Overview Bar -->
      <div class="staged-inputs-bar">
        <!-- Reference Pill -->
        <div class="staged-image-pill" id="pillReference">
          <div class="pill-thumb" id="thumbReference">
            <span>REF</span>
          </div>
          <div class="pill-details">
            <div class="pill-role">Reference Frame</div>
            <div class="pill-name" id="nameReference">No image loaded</div>
            <div class="pill-meta" id="metaReference">Awaiting input module handoff</div>
          </div>
        </div>

        <!-- Moving Pill -->
        <div class="staged-image-pill" id="pillMoving">
          <div class="pill-thumb" id="thumbMoving">
            <span>MOV</span>
          </div>
          <div class="pill-details">
            <div class="pill-role">Moving / Source Frame</div>
            <div class="pill-name" id="nameMoving">No image loaded</div>
            <div class="pill-meta" id="metaMoving">Awaiting input module handoff</div>
          </div>
        </div>
      </div>

      <!-- Main Workspace Grid -->
      <div class="processing-workspace-grid">
        
        <!-- Left Column: Settings Panel & 12-Step Progress Monitor -->
        <div class="processing-panel-left">
          
          <!-- Registration Settings Panel -->
          <div class="panel-card">
            <div class="panel-card-header">
              <div class="panel-card-title">
                <span class="dot"></span>
                <span>Algorithm Parameters</span>
              </div>
              <button type="button" class="btn-secondary-action" id="btnResetSettings" title="Reset to scientifically optimized defaults">
                RESET DEFAULTS
              </button>
            </div>
            
            <div class="panel-card-body">
              <!-- Lowe's Ratio Threshold -->
              <div class="setting-item">
                <div class="setting-label-row">
                  <span class="setting-name">Lowe's Ratio Threshold</span>
                  <span class="setting-val-badge" id="valRatioThreshold">0.75</span>
                </div>
                <input type="range" class="setting-slider" id="sliderRatioThreshold" min="0.40" max="0.95" step="0.05" value="0.75">
                <span class="setting-desc">Distance ratio threshold for rejecting ambiguous descriptor matches (default: 0.75).</span>
              </div>

              <!-- RANSAC Threshold -->
              <div class="setting-item">
                <div class="setting-label-row">
                  <span class="setting-name">RANSAC Reprojection Threshold</span>
                  <span class="setting-val-badge" id="valRansacThreshold">5.0 px</span>
                </div>
                <input type="range" class="setting-slider" id="sliderRansacThreshold" min="1.0" max="15.0" step="0.5" value="5.0">
                <span class="setting-desc">Maximum pixel reprojection error allowed for inlier classification (default: 5.0 px).</span>
              </div>

              <!-- Max Features -->
              <div class="setting-item">
                <div class="setting-label-row">
                  <span class="setting-name">Max SIFT Features</span>
                  <span class="setting-val-badge" id="valMaxFeatures">2000</span>
                </div>
                <select class="setting-select" id="selectMaxFeatures">
                  <option value="500">500 Features (High Speed)</option>
                  <option value="1000">1000 Features (Standard)</option>
                  <option value="2000" selected>2000 Features (Recommended High Precision)</option>
                  <option value="5000">5000 Features (Exhaustive Dense)</option>
                </select>
                <span class="setting-desc">Maximum number of multi-scale keypoints extracted per frame.</span>
              </div>

              <!-- Contrast Enhancement (CLAHE) -->
              <div class="setting-item">
                <label class="setting-switch-label">
                  <span class="setting-name">CLAHE Contrast Enhancement</span>
                  <input type="checkbox" class="custom-checkbox" id="checkClahe" checked>
                </label>
                <span class="setting-desc">Adaptive histogram equalization to reveal faint lunar crater rim features.</span>
              </div>

              <!-- Resolution Scaling -->
              <div class="setting-item">
                <div class="setting-label-row">
                  <span class="setting-name">Resolution Downsampling</span>
                  <span class="setting-val-badge" id="valRescale">1.0x (Full)</span>
                </div>
                <select class="setting-select" id="selectRescale">
                  <option value="1.0" selected>1.0x — Original Full Resolution</option>
                  <option value="0.75">0.75x — 75% Scale (Faster)</option>
                  <option value="0.50">0.50x — 50% Scale (High GSD difference / TMC-2)</option>
                  <option value="0.25">0.25x — 25% Scale (Preview)</option>
                </select>
                <span class="setting-desc">Rescales during feature extraction then maps transformation back to native scale.</span>
              </div>

              <!-- Action Execution Buttons -->
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
                <button type="button" class="btn-execute-pipeline" id="btnExecuteRegistration" disabled>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>EXECUTE SIFT REGISTRATION</span>
                </button>

                <button type="button" class="btn-secondary-action" id="btnLoadSamplePair" style="text-align: center;">
                  LOAD LUNAR TEST PAIR (SAMPLE IMAGES)
                </button>
              </div>

            </div>
          </div>

          <!-- 12-Step Live Progress Monitor -->
          <div class="panel-card">
            <div class="panel-card-header">
              <div class="panel-card-title">
                <span class="dot" style="background-color: #66bb6a;"></span>
                <span>12-Step Pipeline Progress</span>
              </div>
              <span style="font-size: 11px; font-family: monospace; color: #d4af37;" id="textProgressPercent">0%</span>
            </div>
            
            <div class="panel-card-body">
              <div class="overall-progress-bar-wrap">
                <div class="progress-track">
                  <div class="progress-fill" id="progressFillBar"></div>
                </div>
              </div>

              <div class="steps-container" id="stepsContainer">
                ${this.renderStepsListHTML()}
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: Telemetry KPI Cards, Visual Artifacts & Matrix -->
        <div class="processing-panel-right">
          
          <!-- Telemetry KPI Grid -->
          <div class="telemetry-kpi-grid">
            <div class="kpi-card">
              <span class="kpi-label">INLIERS / CANDIDATES</span>
              <span class="kpi-value green" id="kpiInliers">-- / --</span>
              <span class="kpi-sub" id="kpiOutliers">0 outliers rejected</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">INLIER RATIO</span>
              <span class="kpi-value gold" id="kpiInlierRatio">-- %</span>
              <span class="kpi-sub">RANSAC efficiency</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">REPROJECTION ERROR</span>
              <span class="kpi-value" id="kpiReprojError">-- px</span>
              <span class="kpi-sub">Sub-pixel accuracy</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">SPATIAL DISPERSION</span>
              <span class="kpi-value gold" id="kpiSpatialScore">--</span>
              <span class="kpi-sub">Coverage score [0 - 1]</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">SIFT KEYPOINTS</span>
              <span class="kpi-value" id="kpiKeypoints">-- / --</span>
              <span class="kpi-sub">Ref / Moving counts</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">PROCESSING TIME</span>
              <span class="kpi-value green" id="kpiTime">-- s</span>
              <span class="kpi-sub">Total execution time</span>
            </div>
          </div>

          <!-- Homography Matrix Table -->
          <div class="matrix-viewer">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: #eef0f5; text-transform: uppercase;">Estimated Homography Transformation Matrix (H):</span>
              <span style="font-size: 11px; color: #8d929f;" id="matrixType">Model: 3x3 Projective</span>
            </div>
            <div class="matrix-grid" id="matrixGrid">
              <div class="matrix-cell">1.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">1.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">0.000000</div>
              <div class="matrix-cell">1.000000</div>
            </div>
          </div>

          <!-- Visual Artifacts Viewer -->
          <div class="artifacts-visualizer">
            <div class="artifact-tabs" id="artifactTabs">
              <button type="button" class="artifact-tab-btn active" data-tab="registered">1. Aligned Target</button>
              <button type="button" class="artifact-tab-btn" data-tab="keypoints">2. SIFT Keypoints</button>
              <button type="button" class="artifact-tab-btn" data-tab="matches">3. Match Correspondences</button>
              <button type="button" class="artifact-tab-btn" data-tab="inliers">4. RANSAC Inliers</button>
              <button type="button" class="artifact-tab-btn" data-tab="overlay">5. Checkerboard Seam</button>
              <button type="button" class="artifact-tab-btn" data-tab="difference">6. Difference Map</button>
            </div>

            <div class="artifact-display-viewport" id="artifactViewport">
              <div class="artifact-empty-view" id="artifactEmptyView">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5c616d" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span>Awaiting registration execution. Visual artifacts will appear here upon completion.</span>
              </div>
              <img src="" alt="Artifact View" class="artifact-image-main" id="artifactImageMain" style="display: none;">
            </div>

            <div class="artifact-footer-toolbar">
              <span class="artifact-caption" id="artifactCaption">Ready for registration pipeline execution.</span>
              <div class="artifact-actions">
                <button type="button" class="btn-secondary-action" id="btnOpenArtifactTab" disabled>OPEN FULL RES</button>
                <button type="button" class="btn-secondary-action" id="btnDownloadArtifact" disabled>DOWNLOAD PNG</button>
              </div>
            </div>
          </div>

          <!-- Bottom Output Module Handoff Bar -->
          <div class="output-handoff-bar">
            <div class="output-handoff-info">
              <h4>DOWNSTREAM HANDOFF • OUTPUT MODULE</h4>
              <p id="handoffStatusDesc">Registration results and generated artifacts will be packaged and delivered to the Output Module.</p>
            </div>
            <button type="button" class="btn-proceed-output" id="btnProceedToOutput" disabled>
              <span>PROCEED TO OUTPUT MODULE</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

        </div>

      </div>
    `;

    this.container.innerHTML = '';
    this.container.appendChild(this.element);

    this.attachEventListeners();
    this.checkForUrlParams();

    return this.element;
  }

  /**
   * Render HTML for the 12 scientific pipeline steps
   */
  renderStepsListHTML() {
    return this.steps.map(s => `
      <div class="step-card" id="stepCard_${s.id}">
        <div class="step-left">
          <span class="step-num">${String(s.id).padStart(2, '0')}</span>
          <div class="step-text">
            <div class="step-title">${s.name}</div>
            <div class="step-subtitle">${s.desc}</div>
          </div>
        </div>
        <span class="step-badge pending" id="stepBadge_${s.id}">PENDING</span>
      </div>
    `).join('');
  }

  /**
   * Wire up event listeners
   */
  attachEventListeners() {
    // Sliders & Controls
    const sliderRatio = this.element.querySelector('#sliderRatioThreshold');
    const valRatio = this.element.querySelector('#valRatioThreshold');
    sliderRatio.addEventListener('input', (e) => {
      this.settings.ratioThreshold = parseFloat(e.target.value);
      valRatio.textContent = e.target.value;
    });

    const sliderRansac = this.element.querySelector('#sliderRansacThreshold');
    const valRansac = this.element.querySelector('#valRansacThreshold');
    sliderRansac.addEventListener('input', (e) => {
      this.settings.ransacThreshold = parseFloat(e.target.value);
      valRansac.textContent = `${e.target.value} px`;
    });

    const selectMax = this.element.querySelector('#selectMaxFeatures');
    const valMax = this.element.querySelector('#valMaxFeatures');
    selectMax.addEventListener('change', (e) => {
      this.settings.maxFeatures = parseInt(e.target.value, 10);
      valMax.textContent = e.target.value;
    });

    const checkClahe = this.element.querySelector('#checkClahe');
    checkClahe.addEventListener('change', (e) => {
      this.settings.contrastEnhancement = e.target.checked;
    });

    const selectRescale = this.element.querySelector('#selectRescale');
    const valRescale = this.element.querySelector('#valRescale');
    selectRescale.addEventListener('change', (e) => {
      this.settings.rescaleFactor = parseFloat(e.target.value);
      valRescale.textContent = `${e.target.value}x`;
    });

    // Reset settings button
    this.element.querySelector('#btnResetSettings').addEventListener('click', () => {
      sliderRatio.value = 0.75;
      valRatio.textContent = '0.75';
      sliderRansac.value = 5.0;
      valRansac.textContent = '5.0 px';
      selectMax.value = '2000';
      valMax.textContent = '2000';
      checkClahe.checked = true;
      selectRescale.value = '1.0';
      valRescale.textContent = '1.0x (Full)';
      this.settings = {
        ratioThreshold: 0.75,
        ransacThreshold: 5.0,
        maxFeatures: 2000,
        contrastEnhancement: true,
        rescaleFactor: 1.0
      };
    });

    // Execute button
    const btnExecute = this.element.querySelector('#btnExecuteRegistration');
    btnExecute.addEventListener('click', () => this.executeRegistration());

    // Sample pair loader button
    const btnSample = this.element.querySelector('#btnLoadSamplePair');
    btnSample.addEventListener('click', () => this.loadSamplePair());

    // Artifact tabs
    const tabButtons = this.element.querySelectorAll('.artifact-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeArtifactTab = btn.getAttribute('data-tab');
        this.displayActiveArtifact();
      });
    });

    // Open full res & download buttons
    this.element.querySelector('#btnOpenArtifactTab').addEventListener('click', () => {
      const img = this.element.querySelector('#artifactImageMain');
      if (img && img.src) {
        window.open(img.src, '_blank');
      }
    });

    this.element.querySelector('#btnDownloadArtifact').addEventListener('click', () => {
      const img = this.element.querySelector('#artifactImageMain');
      if (img && img.src) {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `luna_reg_${this.activeArtifactTab}_artifact.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });

    // Output Module Proceed Button
    this.element.querySelector('#btnProceedToOutput').addEventListener('click', () => {
      if (this.result && this.result.status === 'SUCCESS') {
        const payload = {
          timestamp: new Date().toISOString(),
          status: 'COMPLETED_FOR_OUTPUT',
          result: this.result,
          settings: this.settings
        };
        const evt = new CustomEvent('luna:proceed-output', { detail: payload });
        window.dispatchEvent(evt);
        if (this.onProceedToOutput) {
          this.onProceedToOutput(payload);
        }
      }
    });
  }

  /**
   * Check URL params for stage_id or auto-load
   */
  checkForUrlParams() {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const stageId = urlParams.get('stage_id');
    if (stageId) {
      this.inputs.stageId = stageId;
      this.inputs.reference = { name: `Staged [${stageId}] Ref Image`, path: stageId };
      this.inputs.moving = { name: `Staged [${stageId}] Moving Image`, path: stageId };
      this.updateInputsUI();
    }
  }

  /**
   * Load real lunar test assets from server
   */
  async loadSamplePair() {
    this.inputs.reference = {
      name: 'lunar_low_sun.jpg (OHRC-like High Contrast Crater Relief)',
      path: 'assets/lunar_low_sun.jpg',
      dimensions: { width: 1376, height: 768 },
      size: 165000,
      url: '/assets/lunar_low_sun.jpg'
    };

    this.inputs.moving = {
      name: 'lunar_nadir.jpg (TMC-2 Multi-Modal Lunar Terrain)',
      path: 'assets/lunar_nadir.jpg',
      dimensions: { width: 1376, height: 768 },
      size: 142000,
      url: '/assets/lunar_nadir.jpg'
    };

    this.inputs.stageId = null;
    this.updateInputsUI();
  }

  /**
   * Update Input pills in UI
   */
  updateInputsUI() {
    const pillRef = this.element.querySelector('#pillReference');
    const nameRef = this.element.querySelector('#nameReference');
    const metaRef = this.element.querySelector('#metaReference');
    const thumbRef = this.element.querySelector('#thumbReference');

    const pillMov = this.element.querySelector('#pillMoving');
    const nameMov = this.element.querySelector('#nameMoving');
    const metaMov = this.element.querySelector('#metaMoving');
    const thumbMov = this.element.querySelector('#thumbMoving');

    const btnExec = this.element.querySelector('#btnExecuteRegistration');

    if (this.inputs.reference) {
      pillRef.classList.add('active');
      nameRef.textContent = this.inputs.reference.name;
      const dims = this.inputs.reference.dimensions 
        ? `${this.inputs.reference.dimensions.width}x${this.inputs.reference.dimensions.height} px` 
        : 'Native Raster';
      metaRef.textContent = `${dims} • Staged for registration`;
      if (this.inputs.reference.url) {
        thumbRef.innerHTML = `<img src="${this.inputs.reference.url}" alt="Ref">`;
      }
    }

    if (this.inputs.moving) {
      pillMov.classList.add('active');
      nameMov.textContent = this.inputs.moving.name;
      const dims = this.inputs.moving.dimensions 
        ? `${this.inputs.moving.dimensions.width}x${this.inputs.moving.dimensions.height} px` 
        : 'Native Raster';
      metaMov.textContent = `${dims} • Staged for registration`;
      if (this.inputs.moving.url) {
        thumbMov.innerHTML = `<img src="${this.inputs.moving.url}" alt="Mov">`;
      }
    }

    const hasBoth = Boolean(this.inputs.reference && this.inputs.moving);
    btnExec.disabled = !hasBoth || this.isProcessing;

    const chip = this.element.querySelector('#chipPipelineStatus');
    if (chip) {
      chip.textContent = hasBoth ? 'STATUS: READY TO PROCESS' : 'STATUS: AWAITING INPUTS';
      chip.className = hasBoth ? 'processing-spec-chip highlight' : 'processing-spec-chip';
    }
  }

  /**
   * Reset all steps back to pending
   */
  resetStepsUI() {
    this.steps.forEach(s => {
      const card = this.element.querySelector(`#stepCard_${s.id}`);
      const badge = this.element.querySelector(`#stepBadge_${s.id}`);
      if (card) card.className = 'step-card';
      if (badge) {
        badge.className = 'step-badge pending';
        badge.textContent = 'PENDING';
      }
    });
    this.updateProgressPercent(0);
  }

  /**
   * Set specific step state
   */
  setStepState(stepId, state, text = null) {
    const card = this.element.querySelector(`#stepCard_${stepId}`);
    const badge = this.element.querySelector(`#stepBadge_${stepId}`);
    if (!card || !badge) return;

    card.className = `step-card ${state}`;
    badge.className = `step-badge ${state}`;
    badge.textContent = text || state.toUpperCase();
  }

  /**
   * Update overall progress bar
   */
  updateProgressPercent(percent) {
    const fill = this.element.querySelector('#progressFillBar');
    const text = this.element.querySelector('#textProgressPercent');
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${Math.round(percent)}%`;
  }

  /**
   * Execute registration pipeline via backend API
   */
  async executeRegistration() {
    if (!this.inputs.reference || !this.inputs.moving || this.isProcessing) return;

    this.isProcessing = true;
    const btnExec = this.element.querySelector('#btnExecuteRegistration');
    btnExec.disabled = true;
    btnExec.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="badge-pulse-indicator">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      <span>RUNNING REGISTRATION...</span>
    `;

    this.resetStepsUI();
    const chip = this.element.querySelector('#chipPipelineStatus');
    if (chip) {
      chip.textContent = 'STATUS: PROCESSING SIFT PIPELINE';
      chip.className = 'processing-spec-chip highlight';
    }

    // Step simulation timers during backend execution
    let currentSimStep = 1;
    const stepInterval = setInterval(() => {
      if (currentSimStep <= 9) {
        if (currentSimStep > 1) {
          this.setStepState(currentSimStep - 1, 'complete', 'DONE');
        }
        this.setStepState(currentSimStep, 'running', 'PROCESSING');
        this.updateProgressPercent((currentSimStep / 12) * 75);
        currentSimStep++;
      }
    }, 180);

    try {
      let response = null;

      // Prepare request payload
      if (this.inputs.reference.file && this.inputs.moving.file) {
        // Direct file uploads via FormData
        const formData = new FormData();
        formData.append('reference_image', this.inputs.reference.file);
        formData.append('moving_image', this.inputs.moving.file);
        formData.append('ratio_threshold', this.settings.ratioThreshold);
        formData.append('ransac_threshold', this.settings.ransacThreshold);
        formData.append('max_features', this.settings.maxFeatures);
        formData.append('contrast_enhancement', this.settings.contrastEnhancement);
        formData.append('rescale_factor', this.settings.rescaleFactor);

        response = await fetch(this.apiEndpoint, {
          method: 'POST',
          body: formData
        });
      } else {
        // JSON payload for staged or path references
        const jsonBody = {
          stage_id: this.inputs.stageId,
          reference_path: this.inputs.reference.path,
          moving_path: this.inputs.moving.path,
          settings: {
            ratio_threshold: this.settings.ratioThreshold,
            ransac_threshold: this.settings.ransacThreshold,
            max_features: this.settings.maxFeatures,
            contrast_enhancement: this.settings.contrastEnhancement,
            rescale_factor: this.settings.rescaleFactor
          }
        };

        response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody)
        });
      }

      clearInterval(stepInterval);
      const data = await response.json();
      this.result = data;

      if (data.status === 'SUCCESS') {
        // Mark all 12 steps complete
        for (let i = 1; i <= 12; i++) {
          this.setStepState(i, 'complete', 'SUCCESS');
        }
        this.updateProgressPercent(100);

        if (chip) {
          chip.textContent = 'STATUS: REGISTRATION SUCCESSFUL';
          chip.className = 'processing-spec-chip success';
        }

        this.displayResults(data);

        // Enable proceed to output module
        const btnProceed = this.element.querySelector('#btnProceedToOutput');
        btnProceed.disabled = false;
        const handoffDesc = this.element.querySelector('#handoffStatusDesc');
        handoffDesc.textContent = `Registered frame ready (${data.metrics.inliers} inliers, error: ${data.metrics.mean_reprojection_error_px} px). Click to transfer to Output Module.`;

        // Notify subscribers
        const evt = new CustomEvent('luna:processing-complete', { detail: data });
        window.dispatchEvent(evt);
        if (this.onComplete) {
          this.onComplete(data);
        }
      } else {
        // Handle scientific registration failure
        const failedAtStep = Math.min(currentSimStep, 9);
        this.setStepState(failedAtStep, 'failed', 'FAILED');
        this.handleFailure(data.error || 'Registration failed to find sufficient inliers.');
      }

    } catch (err) {
      clearInterval(stepInterval);
      this.setStepState(Math.min(currentSimStep, 9), 'failed', 'ERROR');
      this.handleFailure(`Network/Server Error: ${err.message}`);
    } finally {
      this.isProcessing = false;
      btnExec.disabled = false;
      btnExec.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>EXECUTE SIFT REGISTRATION</span>
      `;
    }
  }

  /**
   * Display real metrics and artifacts in the UI
   */
  displayResults(data) {
    const m = data.metrics || {};

    // Update KPI Cards
    this.element.querySelector('#kpiInliers').textContent = `${m.inliers || 0} / ${m.good_matches || 0}`;
    this.element.querySelector('#kpiOutliers').textContent = `${m.outliers || 0} outliers rejected`;
    this.element.querySelector('#kpiInlierRatio').textContent = `${((m.inlier_ratio || 0) * 100).toFixed(1)}%`;
    this.element.querySelector('#kpiReprojError').textContent = `${m.mean_reprojection_error_px || 0} px`;
    this.element.querySelector('#kpiSpatialScore').textContent = `${(m.spatial_distribution_score || 0).toFixed(3)}`;
    this.element.querySelector('#kpiKeypoints').textContent = `${m.ref_keypoints || 0} / ${m.moving_keypoints || 0}`;
    this.element.querySelector('#kpiTime').textContent = `${m.processing_time_seconds || 0} s`;

    // Update Homography Matrix
    if (data.transformation && data.transformation.matrix) {
      const H = data.transformation.matrix;
      const cells = this.element.querySelectorAll('.matrix-cell');
      let idx = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (cells[idx]) {
            cells[idx].textContent = (H[r] && H[r][c] !== undefined) ? H[r][c].toFixed(6) : '0.000000';
          }
          idx++;
        }
      }
    }

    // Enable artifact buttons
    this.element.querySelector('#btnOpenArtifactTab').disabled = false;
    this.element.querySelector('#btnDownloadArtifact').disabled = false;

    // Display current tab artifact
    this.displayActiveArtifact();
  }

  /**
   * Display the currently selected artifact image
   */
  displayActiveArtifact() {
    if (!this.result || this.result.status !== 'SUCCESS') return;

    const mapping = {
      registered: { key: 'registered_image', caption: 'Aligned Moving Image warped into Reference Coordinate Frame' },
      keypoints: { key: 'keypoints_image', caption: 'SIFT Multi-Scale Rich Keypoints Comparison (Reference vs Moving)' },
      matches: { key: 'matches_image', caption: 'Lowe\'s Ratio Filtered Good Match Correspondences' },
      inliers: { key: 'inliers_image', caption: 'RANSAC Classified Inlier Matches (Green) vs Rejected Outliers (Amber)' },
      overlay: { key: 'overlay_image', caption: 'Alternating Checkerboard Seam Alignment Verification' },
      difference: { key: 'difference_image', caption: 'Viridis Colormapped Pixel Difference Heatmap over Overlap Region' }
    };

    const target = mapping[this.activeArtifactTab] || mapping.registered;
    const url = this.result[target.key];

    const imgMain = this.element.querySelector('#artifactImageMain');
    const emptyView = this.element.querySelector('#artifactEmptyView');
    const caption = this.element.querySelector('#artifactCaption');

    if (url) {
      imgMain.src = url;
      imgMain.style.display = 'block';
      emptyView.style.display = 'none';
      caption.textContent = target.caption;
    }
  }

  /**
   * Handle scientific failure state
   */
  handleFailure(errorMessage) {
    const chip = this.element.querySelector('#chipPipelineStatus');
    if (chip) {
      chip.textContent = 'STATUS: REGISTRATION FAILED';
      chip.className = 'processing-spec-chip';
      chip.style.borderColor = '#d9534f';
      chip.style.color = '#ef5350';
    }

    const caption = this.element.querySelector('#artifactCaption');
    if (caption) {
      caption.innerHTML = `<span style="color: #ef5350; font-weight: bold;">FAILED:</span> ${errorMessage}`;
    }

    const emptyView = this.element.querySelector('#artifactEmptyView');
    if (emptyView) {
      emptyView.innerHTML = `
        <div style="color: #ef5350; font-size: 28px;">⚠</div>
        <div style="color: #ef5350; font-weight: bold; font-family: monospace;">REGISTRATION PIPELINE REJECTED</div>
        <div style="color: #c7cad2; max-width: 500px; line-height: 1.5;">${errorMessage}</div>
        <div style="font-size: 11px; color: #8d929f; margin-top: 8px;">Try adjusting Lowe's ratio or RANSAC threshold, or select images with greater surface overlap.</div>
      `;
      emptyView.style.display = 'flex';
    }

    const imgMain = this.element.querySelector('#artifactImageMain');
    if (imgMain) imgMain.style.display = 'none';

    this.element.querySelector('#btnProceedToOutput').disabled = true;
  }
}

// Export for browser & CommonJS
if (typeof window !== 'undefined') {
  window.ProcessingModule = ProcessingModule;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProcessingModule };
}
