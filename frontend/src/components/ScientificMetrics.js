/**
 * LUNA-REG: ScientificMetrics Component
 * Part 5: Analysis Tools Workspace
 * 
 * Manages 7 Canonical Lunar Registration Accuracy Metrics:
 * 1. RMSE (Root Mean Square Error)
 * 2. MAE (Mean Absolute Error)
 * 3. SSIM (Structural Similarity Index)
 * 4. Mutual Information (Cross-modal information entropy)
 * 5. Feature Matches (Detected & matched keypoints)
 * 6. Inlier Ratio (RANSAC verified geometry %)
 * 7. Confidence Score (Statistical alignment certainty)
 * 
 * Strict Compliance with Zero Fake Data Policy:
 * - When backend registration has not executed, displays `—` or `Not available`
 * - Clear pending badge indicating real telemetry is pending backend calculation.
 */

class ScientificMetrics {
  constructor(options = {}) {
    this.container = options.container || null;
    this.metricsData = null; // Stays null until real backend output is supplied
    this.isOutputAvailable = false;
  }

  setMetrics(metrics, isOutputAvailable = false) {
    this.metricsData = metrics || null;
    this.isOutputAvailable = !!isOutputAvailable;
    if (this.container) {
      this.render();
    }
  }

  formatVal(val, unit = '', fallback = '—') {
    if (!this.isOutputAvailable || val === null || val === undefined || val === '') {
      return fallback;
    }
    if (typeof val === 'number') {
      return `${val.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`.trim();
    }
    return `${val} ${unit}`.trim();
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    const m = this.metricsData || {};
    const hasData = this.isOutputAvailable && this.metricsData !== null && Object.keys(m).length > 0;

    const metricItems = [
      {
        id: 'rmse',
        name: 'RMSE',
        fullName: 'Root Mean Square Error',
        value: this.formatVal(m.rmse, 'px'),
        desc: 'Mean geometric sub-pixel displacement residual across verified correspondences.'
      },
      {
        id: 'mae',
        name: 'MAE',
        fullName: 'Mean Absolute Error',
        value: this.formatVal(m.mae, 'px'),
        desc: 'L1 robust geometric distance between warped source and reference tie-points.'
      },
      {
        id: 'ssim',
        name: 'SSIM',
        fullName: 'Structural Similarity Index',
        value: this.formatVal(m.ssim, ''),
        desc: 'Cross-sensor luminance, contrast, and structural texture correlation factor.'
      },
      {
        id: 'mi',
        name: 'MUTUAL INFO',
        fullName: 'Mutual Information',
        value: this.formatVal(m.mutual_info, 'nats'),
        desc: 'Statistical information-theoretic overlap between heterogeneous sensors (TMC-2 & OHRC).'
      },
      {
        id: 'matches',
        name: 'FEATURE MATCHES',
        fullName: 'Keypoint Correspondences',
        value: this.formatVal(m.feature_matches, 'pts'),
        desc: 'Deep feature and phase-congruency keypoints identified across sensor footprints.'
      },
      {
        id: 'inlier',
        name: 'INLIER RATIO',
        fullName: 'RANSAC Geometric Inliers',
        value: this.formatVal(m.inlier_ratio, '%'),
        desc: 'Percentage of matched keypoints conforming to affine/homography epipolar geometry.'
      },
      {
        id: 'confidence',
        name: 'CONFIDENCE SCORE',
        fullName: 'Alignment Quality Index',
        value: this.formatVal(m.confidence_score, '%'),
        desc: 'Aggregate ISRO mission-level registration validation certainty index.'
      }
    ];

    this.container.innerHTML = `
      <div class="metrics-panel-card">
        <!-- Header -->
        <div class="metrics-panel-top">
          <div class="metrics-title-wrap">
            <div class="res-badge-gold">SCIENTIFIC ACCURACY METRICS</div>
            <h3 class="metrics-heading">REGISTRATION ERROR &amp; CORRELATION TELEMETRY</h3>
          </div>
          <div class="metrics-status-badge ${hasData ? 'success' : 'pending'}">
            ${hasData ? 'METRICS VERIFIED' : 'AWAITING BACKEND REGISTRATION RESULTS'}
          </div>
        </div>

        <!-- 7 Cards Grid -->
        <div class="metrics-seven-grid">
          ${metricItems.map(item => `
            <div class="sci-metric-tile ${hasData ? '' : 'pending'}">
              <div class="sci-metric-head">
                <span class="sci-metric-code">${item.name}</span>
                <span class="sci-metric-full">${item.fullName}</span>
              </div>

              <div class="sci-metric-body">
                <span class="sci-metric-val ${hasData ? 'gold' : 'muted'}">${item.value}</span>
              </div>

              <div class="sci-metric-foot">
                <p class="sci-metric-desc">${item.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

window.ScientificMetrics = ScientificMetrics;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScientificMetrics;
}
