/**
 * LUNA-REG: TransformationPanel Component
 * Part 5: Analysis Tools Workspace
 * 
 * Manages Registration Transformation Telemetry & Control Points:
 * - Translation (dx, dy sub-pixel offset)
 * - Rotation (dθ angular alignment)
 * - Scale (s scaling factor ratio)
 * - 3x3 Homography / Affine Transformation Matrix
 * - Feature-match visualization & Tie-Points Table placeholder
 * 
 * Strict Backend Limitation Compliance:
 * - When registration output is unavailable from the backend, displays `—` or `Not available`
 * - Displays exact required banner:
 *   "Analysis tools will become active when registration output is available."
 * - Disables interactive re-alignment tools with a clear disabled state.
 */

class TransformationPanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.transformData = null; // Stays null until real backend returns computation
    this.controlPoints = [];
    this.isOutputAvailable = false;
  }

  setData(transformData, controlPoints = [], isOutputAvailable = false) {
    this.transformData = transformData || null;
    this.controlPoints = controlPoints || [];
    this.isOutputAvailable = !!isOutputAvailable;
    if (this.container) {
      this.render();
    }
  }

  render(containerEl) {
    if (containerEl) this.container = containerEl;
    if (!this.container) return;

    const t = this.transformData || {};
    const hasData = this.isOutputAvailable && this.transformData !== null;

    this.container.innerHTML = `
      <div class="trans-panel-card">
        <!-- Header -->
        <div class="trans-panel-top">
          <div class="trans-title-wrap">
            <div class="res-badge-gold">GEOMETRIC TRANSFORMATION ENGINE</div>
            <h3 class="trans-heading">REGISTRATION PARAMETERS &amp; MATRIX</h3>
          </div>
          <div class="trans-status-badge ${hasData ? 'success' : 'pending'}">
            ${hasData ? 'HOMOGRAPHY COMPUTED' : 'STANDBY • AWAITING REGISTRATION OUTPUT'}
          </div>
        </div>

        <!-- Strict Zero-Fake-Data Banner -->
        ${!hasData ? `
          <div class="trans-pending-callout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div class="trans-pending-msg">
              <strong>Analysis tools will become active when registration output is available.</strong>
              <span>Transformation matrix and control-point correspondences will be calculated once the FastAPI registration pipeline executes.</span>
            </div>
          </div>
        ` : ''}

        <!-- Parameter Telemetry 4-Cards Grid -->
        <div class="trans-param-grid">
          <!-- Translation X -->
          <div class="trans-param-box ${hasData ? '' : 'disabled'}">
            <span class="param-lbl">TRANSLATION &Delta;X</span>
            <div class="param-val-row">
              <span class="param-num ${hasData ? '' : 'muted'}">${hasData && t.dx !== undefined ? `${t.dx.toFixed(2)} px` : '—'}</span>
            </div>
            <span class="param-sub">Sub-pixel horizontal shift</span>
          </div>

          <!-- Translation Y -->
          <div class="trans-param-box ${hasData ? '' : 'disabled'}">
            <span class="param-lbl">TRANSLATION &Delta;Y</span>
            <div class="param-val-row">
              <span class="param-num ${hasData ? '' : 'muted'}">${hasData && t.dy !== undefined ? `${t.dy.toFixed(2)} px` : '—'}</span>
            </div>
            <span class="param-sub">Sub-pixel vertical shift</span>
          </div>

          <!-- Rotation -->
          <div class="trans-param-box ${hasData ? '' : 'disabled'}">
            <span class="param-lbl">ROTATION d&theta;</span>
            <div class="param-val-row">
              <span class="param-num ${hasData ? '' : 'muted'}">${hasData && t.rotation !== undefined ? `${t.rotation.toFixed(4)}°` : '—'}</span>
            </div>
            <span class="param-sub">Angular orientation offset</span>
          </div>

          <!-- Scale Ratio -->
          <div class="trans-param-box ${hasData ? '' : 'disabled'}">
            <span class="param-lbl">SCALE FACTOR (s)</span>
            <div class="param-val-row">
              <span class="param-num ${hasData ? '' : 'muted'}">${hasData && t.scale !== undefined ? `${t.scale.toFixed(4)}x` : '—'}</span>
            </div>
            <span class="param-sub">Spatial resampling scale ratio</span>
          </div>
        </div>

        <!-- 3x3 Transformation Matrix Grid -->
        <div class="trans-matrix-wrap ${hasData ? '' : 'disabled'}">
          <div class="matrix-title-row">
            <span class="matrix-title">HOMOGRAPHY TRANSFORMATION MATRIX [3 &times; 3]</span>
            <span class="matrix-type">Projective 8-DOF</span>
          </div>

          <div class="matrix-grid-shell">
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[0][0].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[0][1].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[0][2].toFixed(4) : '—'}</div>

            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[1][0].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[1][1].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[1][2].toFixed(4) : '—'}</div>

            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[2][0].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[2][1].toFixed(6) : '—'}</div>
            <div class="matrix-cell">${hasData && t.matrix ? t.matrix[2][2].toFixed(4) : '1.0000'}</div>
          </div>
        </div>

        <!-- Feature-Match & Control-Point Table Placeholder -->
        <div class="trans-cp-wrap">
          <div class="cp-title-row">
            <span class="cp-title">CONTROL POINT (TIE-POINT) RESIDUALS</span>
            <span class="cp-count">${this.controlPoints.length} VERIFIED TIE-POINTS</span>
          </div>

          <div class="cp-table-shell">
            ${this.controlPoints.length === 0 ? `
              <div class="cp-empty-state">
                <span class="cp-empty-text">Not available</span>
                <p class="cp-empty-sub">
                  Control point correspondence list will populate when registration feature matching output is loaded.
                </p>
              </div>
            ` : `
              <table class="cp-table">
                <thead>
                  <tr>
                    <th>POINT ID</th>
                    <th>SOURCE (X, Y)</th>
                    <th>REFERENCE (X', Y')</th>
                    <th>RESIDUAL ERROR</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.controlPoints.map(p => `
                    <tr>
                      <td class="mono-gold">${p.id}</td>
                      <td class="mono-muted">(${p.srcX}, ${p.srcY})</td>
                      <td class="mono-muted">(${p.refX}, ${p.refY})</td>
                      <td class="mono-bright">${p.residual ? `${p.residual.toFixed(3)} px` : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>

      </div>
    `;
  }
}

window.TransformationPanel = TransformationPanel;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransformationPanel;
}
