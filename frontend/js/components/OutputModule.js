/**
 * LUNA-REG — OutputModule Component
 * Master orchestrator for registration results visualization, comparison, inspection, and export.
 * Completely independent from Input and Processing modules.
 * Strictly consumes the structured result contract emitted by the Processing Module.
 */

class OutputModule {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Container element or selector
   * @param {string} [options.apiBaseUrl] - Optional base URL for backend API
   * @param {Function} [options.onBackToInput] - Callback to return to Input Module
   * @param {Function} [options.onBackToProcessing] - Callback to return to Processing Module
   */
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : (options.container || null);

    this.apiBaseUrl = options.apiBaseUrl || (typeof window !== 'undefined' && window.VITE_API_BASE_URL) || '';
    this.onBackToInput = options.onBackToInput || null;
    this.onBackToProcessing = options.onBackToProcessing || null;

    // State Management: NO_RESULT | PROCESSING | COMPLETED | FAILED
    this.state = 'NO_RESULT';
    this.result = null;
    this.history = [];

    // Interactive Comparison State
    this.comparisonMode = 'overlay'; // 'reference' | 'registered' | 'overlay' | 'side-by-side' | 'swipe'
    this.overlayOpacity = 0.5;
    this.swipePosition = 0.5; // 0.0 to 1.0
    this.isDraggingSwipe = false;

    // Primary Viewer Zoom & Pan State
    this.panZoom = {
      scale: 1.0,
      panX: 0,
      panY: 0,
      isPanning: false,
      startX: 0,
      startY: 0
    };

    // DOM References
    this.element = null;

    // Global Event Listeners & URL query check
    this.bindGlobalEvents();
  }

  /**
   * Subscribe to global decoupled events and query parameters
   */
  bindGlobalEvents() {
    if (typeof window === 'undefined') return;

    // Listen for custom handoff events from Processing Module
    window.addEventListener('luna:processing-complete', (evt) => {
      if (evt.detail) {
        this.setResult(evt.detail);
      }
    });

    window.addEventListener('luna:proceed-output', (evt) => {
      if (evt.detail && evt.detail.result) {
        this.setResult(evt.detail.result);
      }
    });
  }

  /**
   * Check for ?job_id=... in URL
   */
  checkForUrlParams() {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get('job_id');
    if (jobId) {
      this.loadJobById(jobId);
    } else if (this.state === 'NO_RESULT') {
      this.fetchRecentJobs();
    }
  }

  /**
   * Directly set result object (decoupled handoff)
   */
  setResult(resultObj) {
    if (!resultObj) {
      this.state = 'NO_RESULT';
      this.result = null;
    } else if (resultObj.status === 'SUCCESS') {
      this.state = 'COMPLETED';
      this.result = resultObj;
    } else if (resultObj.status === 'FAILED') {
      this.state = 'FAILED';
      this.result = resultObj;
    } else {
      this.state = 'PROCESSING';
      this.result = resultObj;
    }

    this.resetPanZoom();
    this.render();
    this.fetchRecentJobs();
  }

  /**
   * Fetch result object for a specific job_id via API
   */
  async loadJobById(jobId) {
    this.state = 'PROCESSING';
    this.render();

    try {
      const endpoint = `${this.apiBaseUrl}/api/v1/registration/jobs/${encodeURIComponent(jobId)}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        this.setResult(data);
      } else {
        this.state = 'FAILED';
        this.result = {
          job_id: jobId,
          status: 'FAILED',
          error: `Failed to retrieve registration job '${jobId}' from server (HTTP ${res.status}).`
        };
        this.render();
      }
    } catch (err) {
      this.state = 'FAILED';
      this.result = {
        job_id: jobId,
        status: 'FAILED',
        error: `Network error retrieving job '${jobId}': ${err.message}`
      };
      this.render();
    }
  }

  /**
   * Fetch actual completed jobs from backend history endpoint
   */
  async fetchRecentJobs() {
    try {
      const endpoint = `${this.apiBaseUrl}/api/v1/registration/jobs`;
      const res = await fetch(endpoint);
      if (res.ok) {
        this.history = await res.json();
        this.updateHistoryTable();
      }
    } catch (err) {
      console.info('Recent registrations history API unavailable:', err.message);
    }
  }

  /**
   * Render master container based on active state
   */
  render() {
    if (!this.container) return null;

    this.element = document.createElement('div');
    this.element.className = 'output-module-container';
    this.element.id = 'lunaRegOutputModule';

    let contentHTML = '';
    if (this.state === 'NO_RESULT') {
      contentHTML = this.renderEmptyStateHTML();
    } else if (this.state === 'PROCESSING') {
      contentHTML = this.renderProcessingStateHTML();
    } else if (this.state === 'FAILED') {
      contentHTML = this.renderFailedStateHTML();
    } else {
      contentHTML = this.renderCompletedDashboardHTML();
    }

    this.element.innerHTML = `
      <!-- Mission HUD Top Header Banner -->
      <div class="output-mission-banner">
        <div class="output-banner-title">
          <div class="output-banner-icon">⛯</div>
          <div class="output-banner-text">
            <h2>LUNA-REG • REGISTRATION RESULTS DASHBOARD</h2>
            <p>High-Precision Multi-Modal Lunar Image Alignment & Telemetry Inspection</p>
          </div>
        </div>
        <div class="output-spec-chips">
          <span class="output-spec-chip gold">SUBSYSTEM: OUTPUT / VISUALIZATION</span>
          ${this.renderHeaderStatusChip()}
        </div>
      </div>

      ${contentHTML}

      <!-- Recent Registrations History Section -->
      ${this.renderHistorySectionHTML()}
    `;

    this.container.innerHTML = '';
    this.container.appendChild(this.element);

    this.attachEventListeners();
    return this.element;
  }

  renderHeaderStatusChip() {
    if (this.state === 'COMPLETED') {
      return `<span class="output-spec-chip success">STATUS: COMPLETED</span>`;
    }
    if (this.state === 'FAILED') {
      return `<span class="output-spec-chip failed">STATUS: FAILED</span>`;
    }
    if (this.state === 'PROCESSING') {
      return `<span class="output-spec-chip gold">STATUS: PROCESSING</span>`;
    }
    return `<span class="output-spec-chip">STATUS: NO RESULT</span>`;
  }

  /**
   * 13. Empty State HTML
   */
  renderEmptyStateHTML() {
    return `
      <div class="output-empty-card">
        <div class="empty-icon-reticle">☽</div>
        <div class="empty-title">No Registration Results Available</div>
        <div class="empty-desc">
          The Output Module is awaiting completed registration telemetry from the Processing Module.
          No images or synthetic results are displayed until an actual job finishes execution.
        </div>
        <div class="empty-nav-actions">
          <button type="button" class="btn-viewer-tool active" id="btnGoToInput">
            <span>&larr; Go to Input Module</span>
          </button>
          <button type="button" class="btn-viewer-tool" id="btnGoToProcessing">
            <span>Go to Processing Module &rarr;</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Processing State HTML
   */
  renderProcessingStateHTML() {
    return `
      <div class="output-empty-card" style="border-style: solid; border-color: rgba(212, 175, 55, 0.4);">
        <div class="empty-icon-reticle badge-pulse-indicator" style="width: 20px; height: 20px; background-color: #d4af37;"></div>
        <div class="empty-title" style="color: #d4af37;">Executing Registration Pipeline...</div>
        <div class="empty-desc">
          Retrieving aligned lunar imagery, SIFT feature correspondences, and transformation telemetry from the backend engine.
        </div>
      </div>
    `;
  }

  /**
   * 12. Processing Failure State HTML
   */
  renderFailedStateHTML() {
    const errorMsg = (this.result && this.result.error) || 'Registration failed to find sufficient geometric correspondences.';
    return `
      <div class="output-failure-card">
        <div class="failure-header">
          <span>⚠</span>
          <span>Registration Execution Failed</span>
        </div>
        <div class="failure-reason">
          <strong>Reason:</strong> ${errorMsg}
        </div>
        <div style="font-size: 11px; color: #8d929f;">
          SIFT feature matching or RANSAC homography estimation was unable to achieve stable convergence for this image pair.
        </div>
        <div class="empty-nav-actions" style="margin-top: 6px;">
          <button type="button" class="btn-viewer-tool active" id="btnGoToInput">
            <span>&larr; Back to Input Module</span>
          </button>
          <button type="button" class="btn-viewer-tool" id="btnGoToProcessing">
            <span>Try Again in Processing Module &rarr;</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Completed State Dashboard HTML
   */
  renderCompletedDashboardHTML() {
    const r = this.result || {};
    const m = r.metrics || {};
    const t = r.transformation || {};

    const regUrl = r.registered_image || '';
    const refUrl = r.reference_image || regUrl;
    const kpUrl = r.keypoints_image || '';
    const matchUrl = r.matches_image || '';
    const inliersUrl = r.inliers_image || '';
    const diffUrl = r.difference_image || '';

    const refDims = m.reference_dimensions ? `${m.reference_dimensions.width}×${m.reference_dimensions.height} px` : 'N/A';
    const movDims = m.moving_dimensions ? `${m.moving_dimensions.width}×${m.moving_dimensions.height} px` : 'N/A';

    return `
      <!-- 1. Job Telemetry Summary Bar -->
      <div class="output-job-summary-bar">
        <div class="summary-meta-item">
          <span class="summary-meta-label">JOB IDENTIFIER</span>
          <span class="summary-meta-val gold" title="${r.job_id || 'N/A'}">${r.job_id || 'N/A'}</span>
        </div>

        <div class="summary-meta-item">
          <span class="summary-meta-label">STATUS</span>
          <span class="status-pill completed">COMPLETED</span>
        </div>

        <div class="summary-meta-item">
          <span class="summary-meta-label">PROCESSED AT</span>
          <span class="summary-meta-val">${r.created_at ? new Date(r.created_at).toLocaleString() : new Date().toLocaleString()}</span>
        </div>

        <div class="summary-meta-item">
          <span class="summary-meta-label">EXECUTION DURATION</span>
          <span class="summary-meta-val green">${m.processing_time_seconds !== undefined ? m.processing_time_seconds + ' s' : 'N/A'}</span>
        </div>

        <div class="summary-meta-item">
          <span class="summary-meta-label">REFERENCE FRAME</span>
          <span class="summary-meta-val" title="${r.reference_name || 'reference_image'}">${r.reference_name || 'reference_image'}</span>
        </div>

        <div class="summary-meta-item">
          <span class="summary-meta-label">MOVING / SOURCE FRAME</span>
          <span class="summary-meta-val" title="${r.moving_name || 'moving_image'}">${r.moving_name || 'moving_image'}</span>
        </div>
      </div>

      <!-- 2. Primary Registered Image Viewer -->
      <div class="viewer-card">
        <div class="viewer-header">
          <div class="viewer-title">
            <span class="dot"></span>
            <span>Registered / Aligned Lunar Surface Target</span>
          </div>
          <div class="viewer-controls-bar">
            <button type="button" class="btn-viewer-tool" id="btnZoomIn" title="Zoom In (+25%)">+</button>
            <button type="button" class="btn-viewer-tool" id="btnZoomOut" title="Zoom Out (-25%)">&minus;</button>
            <button type="button" class="btn-viewer-tool" id="btnFitScreen" title="Fit to Viewport">FIT</button>
            <button type="button" class="btn-viewer-tool" id="btnResetZoom" title="Reset Zoom (100%)">1:1</button>
            <button type="button" class="btn-viewer-tool" id="btnFullscreenReg" title="Toggle Fullscreen">FULLSCREEN</button>
            <button type="button" class="btn-viewer-tool active" id="btnDownloadReg" title="Download Registered PNG">DOWNLOAD PNG</button>
          </div>
        </div>

        <div class="canvas-viewport" id="registeredViewport">
          ${regUrl ? `
            <img src="${regUrl}" alt="Registered Lunar Target" id="registeredImageEl">
            <div class="canvas-hud-overlay" id="registeredHudMeta">DIMENSIONS: ${refDims}</div>
            <div class="canvas-zoom-badge" id="registeredZoomBadge">100%</div>
          ` : `
            <div class="canvas-viewport empty-viewport">
              <span>Registered image is not available.</span>
            </div>
          `}
        </div>
      </div>

      <!-- 6. Interactive Overlay & Comparison Viewer -->
      <div class="viewer-card">
        <div class="viewer-header">
          <div class="viewer-title">
            <span class="dot" style="background-color: #66bb6a;"></span>
            <span>Overlay Comparison & Alignment Seam Verification</span>
          </div>
          <div class="comparison-toolbar" style="border: none; padding: 0;">
            <div class="comparison-modes">
              <button type="button" class="btn-viewer-tool ${this.comparisonMode === 'reference' ? 'active' : ''}" data-mode="reference">REFERENCE ONLY</button>
              <button type="button" class="btn-viewer-tool ${this.comparisonMode === 'registered' ? 'active' : ''}" data-mode="registered">REGISTERED ONLY</button>
              <button type="button" class="btn-viewer-tool ${this.comparisonMode === 'overlay' ? 'active' : ''}" data-mode="overlay">OVERLAY (OPACITY)</button>
              <button type="button" class="btn-viewer-tool ${this.comparisonMode === 'side-by-side' ? 'active' : ''}" data-mode="side-by-side">SIDE-BY-SIDE</button>
              <button type="button" class="btn-viewer-tool ${this.comparisonMode === 'swipe' ? 'active' : ''}" data-mode="swipe">SWIPE COMPARISON</button>
            </div>
            <div class="opacity-slider-wrap" id="opacitySliderWrap" style="display: ${this.comparisonMode === 'overlay' ? 'flex' : 'none'};">
              <span>Opacity:</span>
              <input type="range" id="sliderOverlayOpacity" min="0" max="1" step="0.05" value="${this.overlayOpacity}">
              <span id="labelOpacityVal">${Math.round(this.overlayOpacity * 100)}%</span>
            </div>
          </div>
        </div>

        <div class="comparison-container" id="comparisonContainer">
          <!-- Layer 1: Reference Frame -->
          <div class="comparison-layer" id="layerReference" style="z-index: 1;">
            <img src="${refUrl}" alt="Reference Frame" id="imgLayerReference">
          </div>

          <!-- Layer 2: Registered Frame -->
          <div class="comparison-layer" id="layerRegistered" style="z-index: 2; opacity: ${this.overlayOpacity};">
            <img src="${regUrl}" alt="Registered Frame" id="imgLayerRegistered">
          </div>

          <!-- Interactive Swipe Split Handle -->
          <div class="swipe-handle" id="swipeHandle" style="display: ${this.comparisonMode === 'swipe' ? 'block' : 'none'}; left: ${this.swipePosition * 100}%;">
            <div class="swipe-knob">⇋</div>
          </div>
        </div>
      </div>

      <!-- Two-Column Grid: Keypoints & Feature Matches -->
      <div class="output-two-col-grid">
        
        <!-- 3. Keypoint Visualization Panel -->
        <div class="viewer-card">
          <div class="viewer-header">
            <div class="viewer-title">
              <span class="dot"></span>
              <span>SIFT Keypoints (Ref vs Moving)</span>
            </div>
            <div class="viewer-controls-bar">
              <button type="button" class="btn-viewer-tool" id="btnFullscreenKp">FULLSCREEN</button>
              <button type="button" class="btn-viewer-tool" id="btnDownloadKp">DOWNLOAD</button>
            </div>
          </div>
          <div class="canvas-viewport" style="height: 380px;">
            ${kpUrl ? `
              <img src="${kpUrl}" alt="SIFT Keypoints" style="max-width: 100%; max-height: 100%; object-fit: contain;">
              <div class="canvas-hud-overlay">REF: ${m.ref_keypoints || 'N/A'} • MOV: ${m.moving_keypoints || 'N/A'}</div>
            ` : `
              <div class="canvas-viewport empty-viewport">Keypoint visualization is not available.</div>
            `}
          </div>
        </div>

        <!-- 4. Feature Match Visualization Panel -->
        <div class="viewer-card">
          <div class="viewer-header">
            <div class="viewer-title">
              <span class="dot"></span>
              <span>Feature Matches (Good Correspondences)</span>
            </div>
            <div class="viewer-controls-bar">
              <button type="button" class="btn-viewer-tool" id="btnFullscreenMatches">FULLSCREEN</button>
              <button type="button" class="btn-viewer-tool" id="btnDownloadMatches">DOWNLOAD</button>
            </div>
          </div>
          <div class="canvas-viewport" style="height: 380px;">
            ${matchUrl ? `
              <img src="${matchUrl}" alt="Feature Matches" style="max-width: 100%; max-height: 100%; object-fit: contain;">
              <div class="canvas-hud-overlay">GOOD MATCHES: ${m.good_matches || 'N/A'} / ${m.candidate_matches || 'N/A'} CANDIDATES</div>
            ` : `
              <div class="canvas-viewport empty-viewport">Matches visualization is not available.</div>
            `}
          </div>
        </div>

      </div>

      <!-- Two-Column Grid: RANSAC Inliers & Difference Heatmap -->
      <div class="output-two-col-grid">
        
        <!-- 5. RANSAC Inlier / Outlier Analysis Panel -->
        <div class="viewer-card">
          <div class="viewer-header">
            <div class="viewer-title">
              <span class="dot" style="background-color: #66bb6a;"></span>
              <span>RANSAC Inlier / Outlier Analysis</span>
            </div>
            <div class="viewer-controls-bar">
              <button type="button" class="btn-viewer-tool" id="btnFullscreenInliers">FULLSCREEN</button>
              <button type="button" class="btn-viewer-tool" id="btnDownloadInliers">DOWNLOAD</button>
            </div>
          </div>
          <div class="canvas-viewport" style="height: 380px;">
            ${inliersUrl ? `
              <img src="${inliersUrl}" alt="RANSAC Inliers" style="max-width: 100%; max-height: 100%; object-fit: contain;">
              <div class="canvas-hud-overlay">INLIERS: ${m.inliers || 'N/A'} • OUTLIERS: ${m.outliers !== undefined ? m.outliers : 'N/A'} (RATIO: ${m.inlier_ratio !== undefined ? ((m.inlier_ratio * 100).toFixed(1) + '%') : 'N/A'})</div>
            ` : `
              <div class="canvas-viewport empty-viewport">Inlier visualization is not available.</div>
            `}
          </div>
        </div>

        <!-- 7. Difference View Panel -->
        <div class="viewer-card">
          <div class="viewer-header">
            <div class="viewer-title">
              <span class="dot" style="background-color: #ffb74d;"></span>
              <span>Registration Difference (Viridis Heatmap)</span>
            </div>
            <div class="viewer-controls-bar">
              <button type="button" class="btn-viewer-tool" id="btnFullscreenDiff">FULLSCREEN</button>
              <button type="button" class="btn-viewer-tool" id="btnDownloadDiff">DOWNLOAD</button>
            </div>
          </div>
          <div class="canvas-viewport" style="height: 380px;">
            ${diffUrl ? `
              <img src="${diffUrl}" alt="Difference Map" style="max-width: 100%; max-height: 100%; object-fit: contain;">
              <div class="canvas-hud-overlay">COLORMAP: VIRIDIS OVERLAP RESIDUALS</div>
            ` : `
              <div class="canvas-viewport empty-viewport">Difference image is not available for this registration.</div>
            `}
          </div>
        </div>

      </div>

      <!-- 8. Registration Metrics Panel -->
      <div class="metrics-panel">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="viewer-title">
            <span class="dot"></span>
            <span>Registration Metrics Telemetry</span>
          </div>
          <span style="font-size: 11px; font-family: monospace; color: #8d929f;">EXACT ENGINE MEASUREMENTS</span>
        </div>

        <div class="metrics-kpi-grid">
          <div class="metric-item-card">
            <span class="metric-label">REFERENCE KEYPOINTS</span>
            <span class="metric-value">${m.ref_keypoints !== undefined ? m.ref_keypoints : 'N/A'}</span>
            <span class="metric-sub">Multi-scale extrema</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">MOVING KEYPOINTS</span>
            <span class="metric-value">${m.moving_keypoints !== undefined ? m.moving_keypoints : 'N/A'}</span>
            <span class="metric-sub">Multi-scale extrema</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">CANDIDATE MATCHES</span>
            <span class="metric-value">${m.candidate_matches !== undefined ? m.candidate_matches : 'N/A'}</span>
            <span class="metric-sub">BFMatcher L2 KNN</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">GOOD MATCHES</span>
            <span class="metric-value">${m.good_matches !== undefined ? m.good_matches : 'N/A'}</span>
            <span class="metric-sub">Lowe ratio filtered</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">RANSAC INLIERS</span>
            <span class="metric-value green">${m.inliers !== undefined ? m.inliers : 'N/A'}</span>
            <span class="metric-sub">Geometric consensus</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">RANSAC OUTLIERS</span>
            <span class="metric-value amber">${m.outliers !== undefined ? m.outliers : 'N/A'}</span>
            <span class="metric-sub">Outliers rejected</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">INLIER RATIO</span>
            <span class="metric-value gold">${m.inlier_ratio !== undefined ? (m.inlier_ratio * 100).toFixed(1) + '%' : 'N/A'}</span>
            <span class="metric-sub">Consensus density</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">REPROJECTION ERROR</span>
            <span class="metric-value">${m.mean_reprojection_error_px !== undefined ? m.mean_reprojection_error_px + ' px' : 'N/A'}</span>
            <span class="metric-sub">Sub-pixel precision</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">SPATIAL SCORE</span>
            <span class="metric-value gold">${m.spatial_distribution_score !== undefined ? m.spatial_distribution_score : 'N/A'}</span>
            <span class="metric-sub">Dispersion [0.0 - 1.0]</span>
          </div>

          <div class="metric-item-card">
            <span class="metric-label">TRANSFORMATION TYPE</span>
            <span class="metric-value" style="font-size: 15px;">${t.type || 'Homography (3×3)'}</span>
            <span class="metric-sub">Projective planar model</span>
          </div>
        </div>
      </div>

      <!-- 9. Expandable Transformation Matrix Section -->
      <div class="transformation-section">
        <div class="transformation-header" id="btnToggleMatrix">
          <div class="viewer-title">
            <span class="dot"></span>
            <span>Transformation Matrix Details (3×3 Projective Model)</span>
          </div>
          <span style="font-size: 12px; font-family: monospace; color: #d4af37;" id="matrixArrow">▼ COLLAPSE / EXPAND</span>
        </div>
        <div class="matrix-table-wrap" id="matrixContent">
          <div style="font-size: 11px; color: #c7cad2; font-family: monospace;">
            Estimated Homography matrix mapping points from Moving coordinate frame to Reference coordinate frame:
          </div>
          <div class="matrix-ascii-box">
            ${this.renderMatrixCellsHTML(t.matrix)}
          </div>
          <div style="font-size: 11px; color: #8d929f; font-family: monospace; margin-top: 4px;">
            Inliers Confirmed: <strong style="color: #66bb6a;">${m.inliers || 'N/A'}</strong> &bull;
            Mean Reprojection Error: <strong style="color: #eef0f5;">${m.mean_reprojection_error_px || '0.0'} px</strong>
          </div>
        </div>
      </div>

      <!-- 10. Result Files Section -->
      <div class="viewer-card">
        <div class="viewer-header">
          <div class="viewer-title">
            <span class="dot"></span>
            <span>Generated Result Files & Artifacts</span>
          </div>
          <span style="font-size: 11px; font-family: monospace; color: #8d929f;">6 SCIENTIFIC ARTIFACTS GENERATED</span>
        </div>
        <div style="padding: 16px;">
          <div class="result-files-grid">
            ${this.renderResultFileCardHTML('Registered Aligned Image', r.registered_image, 'PNG Raster', refDims)}
            ${this.renderResultFileCardHTML('SIFT Keypoints Comparison', r.keypoints_image, 'PNG Vis Map', 'Dual Stitched')}
            ${this.renderResultFileCardHTML('Good Match Correspondences', r.matches_image, 'PNG Match Vis', `${m.good_matches || 0} Matches`)}
            ${this.renderResultFileCardHTML('RANSAC Inliers / Outliers', r.inliers_image, 'PNG Inlier Map', `${m.inliers || 0} Inliers`)}
            ${this.renderResultFileCardHTML('Checkerboard Seam Overlay', r.overlay_image, 'PNG Seam Map', 'Checkerboard')}
            ${this.renderResultFileCardHTML('Registration Difference Heatmap', r.difference_image, 'PNG Heatmap', 'Viridis')}
          </div>
        </div>
      </div>

      <!-- 11. Download All Results Bar -->
      <div class="download-master-bar">
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #eef0f5; font-family: monospace; text-transform: uppercase;">
            EXPORT ALL REGISTRATION ARTIFACTS
          </div>
          <div style="font-size: 11px; color: #9ea3b1; margin-top: 2px;">
            Downloads complete bundle (all 6 PNG artifacts + full result.json contract) as a single ZIP archive.
          </div>
        </div>
        <button type="button" class="btn-download-all" id="btnDownloadAllZip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>DOWNLOAD ALL RESULTS (ZIP)</span>
        </button>
      </div>
    `;
  }

  renderMatrixCellsHTML(matrix) {
    if (!matrix || !Array.isArray(matrix) || matrix.length < 3) {
      return `
        <div class="matrix-cell-out">1.000000</div><div class="matrix-cell-out">0.000000</div><div class="matrix-cell-out">0.000000</div>
        <div class="matrix-cell-out">0.000000</div><div class="matrix-cell-out">1.000000</div><div class="matrix-cell-out">0.000000</div>
        <div class="matrix-cell-out">0.000000</div><div class="matrix-cell-out">0.000000</div><div class="matrix-cell-out">1.000000</div>
      `;
    }
    let html = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const val = (matrix[r] && matrix[r][c] !== undefined) ? Number(matrix[r][c]).toFixed(6) : '0.000000';
        html += `<div class="matrix-cell-out">${val}</div>`;
      }
    }
    return html;
  }

  renderResultFileCardHTML(title, url, type, desc) {
    if (!url) {
      return `
        <div class="result-file-card" style="opacity: 0.5;">
          <div class="result-file-thumb"><span>N/A</span></div>
          <div class="result-file-info">
            <div class="result-file-title">${title}</div>
            <div class="result-file-meta">Artifact not generated</div>
          </div>
        </div>
      `;
    }
    const filename = url.split('/').pop();
    return `
      <div class="result-file-card">
        <div class="result-file-thumb">
          <img src="${url}" alt="${title}">
        </div>
        <div class="result-file-info">
          <div class="result-file-title" title="${filename}">${filename}</div>
          <div class="result-file-meta">${type} &bull; ${desc}</div>
          <div class="result-file-actions">
            <a href="${url}" target="_blank" class="btn-viewer-tool" style="text-decoration: none; padding: 3px 8px; font-size: 10px;">VIEW</a>
            <a href="${url}" download="${filename}" class="btn-viewer-tool active" style="text-decoration: none; padding: 3px 8px; font-size: 10px;">DOWNLOAD</a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 14. History Section HTML
   */
  renderHistorySectionHTML() {
    return `
      <div class="history-section" id="historySectionWrap">
        <div class="viewer-header">
          <div class="viewer-title">
            <span class="dot" style="background-color: #d4af37;"></span>
            <span>Recent Registrations History</span>
          </div>
          <span style="font-size: 11px; font-family: monospace; color: #8d929f;">PERSISTED SESSIONS</span>
        </div>
        <div style="overflow-x: auto;">
          <table class="history-table" id="historyTable">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Reference Image</th>
                <th>Moving Image</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="historyTableBody">
              ${this.renderHistoryRowsHTML()}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderHistoryRowsHTML() {
    if (!this.history || this.history.length === 0) {
      return `
        <tr>
          <td colspan="6" style="text-align: center; color: #5c616d; padding: 24px;">
            Registration history is not available.
          </td>
        </tr>
      `;
    }
    return this.history.map(job => `
      <tr>
        <td style="color: #d4af37; font-weight: 600;">${job.job_id}</td>
        <td>${job.reference_name || 'reference'}</td>
        <td>${job.moving_name || 'moving'}</td>
        <td>
          <span class="status-pill ${job.status === 'SUCCESS' ? 'completed' : 'failed'}" style="padding: 2px 6px; font-size: 9px;">
            ${job.status}
          </span>
        </td>
        <td style="color: #8d929f;">${job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A'}</td>
        <td>
          <button type="button" class="btn-viewer-tool" onclick="window.lunaOutputModule.loadJobById('${job.job_id}')" style="padding: 3px 8px; font-size: 10px;">
            VIEW RESULT
          </button>
        </td>
      </tr>
    `).join('');
  }

  updateHistoryTable() {
    const tbody = this.element ? this.element.querySelector('#historyTableBody') : null;
    if (tbody) {
      tbody.innerHTML = this.renderHistoryRowsHTML();
    }
  }

  /**
   * Attach interactive listeners
   */
  attachEventListeners() {
    if (!this.element) return;

    // Navigation buttons in empty or error state
    const btnInput = this.element.querySelector('#btnGoToInput');
    if (btnInput) {
      btnInput.addEventListener('click', () => {
        if (this.onBackToInput) this.onBackToInput();
        else window.location.href = '/input';
      });
    }

    const btnProc = this.element.querySelector('#btnGoToProcessing');
    if (btnProc) {
      btnProc.addEventListener('click', () => {
        if (this.onBackToProcessing) this.onBackToProcessing();
        else window.location.href = '/processing';
      });
    }

    if (this.state !== 'COMPLETED') return;

    // 1. Pan & Zoom on Primary Viewer
    const vp = this.element.querySelector('#registeredViewport');
    const imgEl = this.element.querySelector('#registeredImageEl');
    if (vp && imgEl) {
      this.initPanZoom(vp, imgEl);
    }

    // 2. Comparison Mode Switchers
    const modeButtons = this.element.querySelectorAll('.comparison-modes button');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.comparisonMode = btn.getAttribute('data-mode');
        this.updateComparisonView();
      });
    });

    // 3. Opacity Slider
    const opacitySlider = this.element.querySelector('#sliderOverlayOpacity');
    const opacityLabel = this.element.querySelector('#labelOpacityVal');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        this.overlayOpacity = parseFloat(e.target.value);
        if (opacityLabel) opacityLabel.textContent = `${Math.round(this.overlayOpacity * 100)}%`;
        const layerReg = this.element.querySelector('#layerRegistered');
        if (layerReg) layerReg.style.opacity = this.overlayOpacity;
      });
    }

    // 4. Interactive Swipe Handle
    const swipeHandle = this.element.querySelector('#swipeHandle');
    const compContainer = this.element.querySelector('#comparisonContainer');
    if (swipeHandle && compContainer) {
      this.initSwipeComparison(compContainer, swipeHandle);
    }

    // 5. Expandable Matrix Toggle
    const btnMatrix = this.element.querySelector('#btnToggleMatrix');
    const matrixContent = this.element.querySelector('#matrixContent');
    const matrixArrow = this.element.querySelector('#matrixArrow');
    if (btnMatrix && matrixContent) {
      btnMatrix.addEventListener('click', () => {
        const isHidden = matrixContent.style.display === 'none';
        matrixContent.style.display = isHidden ? 'flex' : 'none';
        if (matrixArrow) matrixArrow.textContent = isHidden ? '▼ COLLAPSE / EXPAND' : '▶ EXPAND';
      });
    }

    // 6. Download All ZIP button
    const btnZip = this.element.querySelector('#btnDownloadAllZip');
    if (btnZip && this.result && this.result.job_id) {
      btnZip.addEventListener('click', () => {
        window.location.href = `${this.apiBaseUrl}/api/v1/registration/jobs/${encodeURIComponent(this.result.job_id)}/download-all`;
      });
    }

    // 7. Fullscreen Buttons
    this.wireFullscreenBtn('#btnFullscreenReg', this.result?.registered_image, 'Registered Image');
    this.wireFullscreenBtn('#btnFullscreenKp', this.result?.keypoints_image, 'SIFT Keypoints Visualization');
    this.wireFullscreenBtn('#btnFullscreenMatches', this.result?.matches_image, 'Feature Matches');
    this.wireFullscreenBtn('#btnFullscreenInliers', this.result?.inliers_image, 'RANSAC Inliers / Outliers');
    this.wireFullscreenBtn('#btnFullscreenDiff', this.result?.difference_image, 'Registration Difference Heatmap');

    // 8. Individual Download Button
    const btnDownReg = this.element.querySelector('#btnDownloadReg');
    if (btnDownReg && this.result?.registered_image) {
      btnDownReg.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = this.result.registered_image;
        a.download = `luna_reg_${this.result.job_id}_registered.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  }

  /**
   * Interactive Pan & Zoom Engine
   */
  initPanZoom(viewport, image) {
    const updateTransform = () => {
      image.style.transform = `translate(${this.panZoom.panX}px, ${this.panZoom.panY}px) scale(${this.panZoom.scale})`;
      const badge = this.element.querySelector('#registeredZoomBadge');
      if (badge) badge.textContent = `${Math.round(this.panZoom.scale * 100)}%`;
    };

    // Zoom on wheel
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.panZoom.scale = Math.min(8.0, Math.max(0.2, this.panZoom.scale * zoomFactor));
      updateTransform();
    }, { passive: false });

    // Drag to pan
    viewport.addEventListener('mousedown', (e) => {
      this.panZoom.isPanning = true;
      this.panZoom.startX = e.clientX - this.panZoom.panX;
      this.panZoom.startY = e.clientY - this.panZoom.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.panZoom.isPanning) return;
      this.panZoom.panX = e.clientX - this.panZoom.startX;
      this.panZoom.panY = e.clientY - this.panZoom.startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.panZoom.isPanning = false;
    });

    // Zoom Buttons
    const btnIn = this.element.querySelector('#btnZoomIn');
    const btnOut = this.element.querySelector('#btnZoomOut');
    const btnFit = this.element.querySelector('#btnFitScreen');
    const btnReset = this.element.querySelector('#btnResetZoom');

    if (btnIn) btnIn.addEventListener('click', () => {
      this.panZoom.scale = Math.min(8.0, this.panZoom.scale * 1.25);
      updateTransform();
    });

    if (btnOut) btnOut.addEventListener('click', () => {
      this.panZoom.scale = Math.max(0.2, this.panZoom.scale * 0.8);
      updateTransform();
    });

    if (btnFit) btnFit.addEventListener('click', () => {
      this.resetPanZoom();
      updateTransform();
    });

    if (btnReset) btnReset.addEventListener('click', () => {
      this.panZoom = { scale: 1.0, panX: 0, panY: 0, isPanning: false, startX: 0, startY: 0 };
      updateTransform();
    });
  }

  resetPanZoom() {
    this.panZoom = { scale: 1.0, panX: 0, panY: 0, isPanning: false, startX: 0, startY: 0 };
  }

  /**
   * Interactive Swipe Comparison Engine
   */
  initSwipeComparison(container, handle) {
    const layerRef = this.element.querySelector('#layerReference');
    const layerReg = this.element.querySelector('#layerRegistered');

    const updateSwipe = (clientX) => {
      const rect = container.getBoundingClientRect();
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0.01, Math.min(0.99, pos));
      this.swipePosition = pos;

      handle.style.left = `${pos * 100}%`;
      if (layerReg) {
        // Clip registered layer to right side of split line
        layerReg.style.clipPath = `polygon(${pos * 100}% 0%, 100% 0%, 100% 100%, ${pos * 100}% 100%)`;
      }
    };

    handle.addEventListener('mousedown', (e) => {
      this.isDraggingSwipe = true;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDraggingSwipe) return;
      updateSwipe(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingSwipe = false;
    });
  }

  /**
   * Update Comparison View based on selected mode
   */
  updateComparisonView() {
    const container = this.element.querySelector('#comparisonContainer');
    const layerRef = this.element.querySelector('#layerReference');
    const layerReg = this.element.querySelector('#layerRegistered');
    const swipeHandle = this.element.querySelector('#swipeHandle');
    const sliderWrap = this.element.querySelector('#opacitySliderWrap');

    if (!container || !layerRef || !layerReg) return;

    // Reset default layer properties
    layerRef.style.display = 'flex';
    layerReg.style.display = 'flex';
    layerReg.style.clipPath = 'none';
    container.className = 'comparison-container';

    if (sliderWrap) {
      sliderWrap.style.display = this.comparisonMode === 'overlay' ? 'flex' : 'none';
    }

    if (swipeHandle) {
      swipeHandle.style.display = this.comparisonMode === 'swipe' ? 'block' : 'none';
    }

    if (this.comparisonMode === 'reference') {
      layerRef.style.display = 'flex';
      layerReg.style.display = 'none';
    } else if (this.comparisonMode === 'registered') {
      layerRef.style.display = 'none';
      layerReg.style.display = 'flex';
      layerReg.style.opacity = '1.0';
    } else if (this.comparisonMode === 'overlay') {
      layerRef.style.display = 'flex';
      layerReg.style.display = 'flex';
      layerReg.style.opacity = this.overlayOpacity;
    } else if (this.comparisonMode === 'side-by-side') {
      container.classList.add('mode-side-by-side');
      layerReg.style.opacity = '1.0';
    } else if (this.comparisonMode === 'swipe') {
      layerRef.style.display = 'flex';
      layerReg.style.display = 'flex';
      layerReg.style.opacity = '1.0';
      layerReg.style.clipPath = `polygon(${this.swipePosition * 100}% 0%, 100% 0%, 100% 100%, ${this.swipePosition * 100}% 100%)`;
      if (swipeHandle) swipeHandle.style.left = `${this.swipePosition * 100}%`;
    }
  }

  /**
   * Fullscreen Modal Viewer
   */
  wireFullscreenBtn(btnSelector, imageUrl, title) {
    const btn = this.element.querySelector(btnSelector);
    if (!btn || !imageUrl) return;

    btn.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'modal-viewer-overlay';
      modal.innerHTML = `
        <div class="modal-viewer-header">
          <span style="font-family: monospace; font-size: 13px; color: #d4af37; font-weight: bold;">
            ${title} &bull; FULL-RESOLUTION SCIENTIFIC INSPECTION
          </span>
          <button type="button" class="btn-modal-close" id="btnCloseModal">&times;</button>
        </div>
        <div class="modal-viewer-body">
          <img src="${imageUrl}" alt="${title}">
        </div>
      `;

      document.body.appendChild(modal);
      modal.querySelector('#btnCloseModal').addEventListener('click', () => {
        document.body.removeChild(modal);
      });
    });
  }
}

// Global & CommonJS Export
if (typeof window !== 'undefined') {
  window.OutputModule = OutputModule;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OutputModule };
}
