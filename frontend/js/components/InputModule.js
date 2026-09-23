/**
 * LUNA-REG — InputModule Component
 * Master orchestrator for lunar image file selection, validation, and staging.
 * Manages two completely independent FileUploadCards (Reference and Moving),
 * strictly validates both inputs, and executes a clean decoupled handoff
 * to the downstream Processing Module without running any registration algorithms.
 */

class InputModule {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Container element or selector
   * @param {Function} [options.onProceed] - Callback fired with clean data object when user proceeds
   * @param {string} [options.apiEndpoint] - Backend staging API endpoint (e.g. '/api/stage-inputs')
   */
  constructor(options = {}) {
    this.container = typeof options.container === 'string' 
      ? document.querySelector(options.container) 
      : (options.container || null);
    
    this.onProceed = options.onProceed || null;
    this.apiEndpoint = options.apiEndpoint || '/api/stage-inputs';

    // Separate Independent State Variables
    this.referenceState = {
      file: null,
      metadata: null,
      isValid: false
    };

    this.movingState = {
      file: null,
      metadata: null,
      isValid: false
    };

    // Subcomponent Instances
    this.referenceCard = null;
    this.movingCard = null;

    // DOM References
    this.element = null;
    this.proceedButton = null;
    this.statusBadge = null;
    this.statusDesc = null;
  }

  /**
   * Mount and render the Input Module
   */
  render() {
    if (!this.container) {
      console.error('InputModule: No valid container provided');
      return null;
    }

    this.element = document.createElement('div');
    this.element.className = 'input-module-container';
    this.element.id = 'lunaRegInputModule';

    this.element.innerHTML = `
      <!-- Mission HUD Top Header Banner -->
      <div class="input-mission-banner">
        <div class="input-banner-title">
          <div class="input-banner-icon">☽</div>
          <div class="input-banner-text">
            <h2>LUNA-REG • MISSION IMAGE INPUT MODULE</h2>
            <p>Manual File Staging for Multi-Modal Lunar Satellite Registration</p>
          </div>
        </div>
        <div class="input-spec-chips">
          <span class="input-spec-chip highlight">ACCEPTED: .PNG, .JPG, .JPEG, .TIF, .TIFF, .IMG</span>
          <span class="input-spec-chip highlight">MAX SIZE: 50 MB / IMAGE</span>
          <span class="input-spec-chip">INDEPENDENT CHANNELS</span>
        </div>
      </div>

      <!-- Dual Cards Layout: Reference vs Moving -->
      <div class="input-cards-grid" id="inputCardsGrid">
        <!-- Reference Card Mount -->
        <div id="mountReferenceCard"></div>

        <!-- Moving / Source Card Mount -->
        <div id="mountMovingCard"></div>
      </div>

      <!-- Master Bottom Staging / Proceed Section -->
      <div class="input-proceed-section">
        <div class="proceed-status-info">
          <div class="proceed-status-title" id="proceedStatusTitle">
            <span class="status-dot" id="proceedStatusDot"></span>
            <span id="proceedStatusLabel">STAGING STATUS: AWAITING DUAL INPUTS</span>
          </div>
          <div class="proceed-status-desc" id="proceedStatusDesc">
            Both the Reference Image and Moving/Source Image must be staged and validated before proceeding to the registration pipeline.
          </div>
        </div>

        <button type="button" class="btn-proceed-processing" id="btnProceedProcessing" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Continue to Processing</span>
        </button>
      </div>

      <!-- Clean Handoff / Confirmation Modal Container -->
      <div id="inputModalMount"></div>
    `;

    this.container.innerHTML = '';
    this.container.appendChild(this.element);

    // Cache DOM Elements
    this.proceedButton = this.element.querySelector('#btnProceedProcessing');
    this.statusBadge = this.element.querySelector('#proceedStatusDot');
    this.statusLabel = this.element.querySelector('#proceedStatusLabel');
    this.statusDesc = this.element.querySelector('#proceedStatusDesc');

    // Mount 1: Reference Image Card
    const mountRef = this.element.querySelector('#mountReferenceCard');
    this.referenceCard = new FileUploadCard({
      id: 'luna_ref_card',
      role: 'reference',
      title: 'REFERENCE IMAGE',
      explanation: 'The base lunar coordinate image to which the Moving/Source Image will be geometrically aligned.',
      acceptedExtensions: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.img'],
      maxSizeBytes: 50 * 1024 * 1024,
      onChange: (cardState) => this.handleReferenceChange(cardState),
      onRemove: () => this.handleReferenceRemove()
    });
    mountRef.appendChild(this.referenceCard.render());

    // Mount 2: Moving/Source Image Card
    const mountMov = this.element.querySelector('#mountMovingCard');
    this.movingCard = new FileUploadCard({
      id: 'luna_mov_card',
      role: 'moving',
      title: 'MOVING / SOURCE IMAGE',
      explanation: 'The unaligned lunar target image that will be warped and registered to match the Reference Image.',
      acceptedExtensions: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.img'],
      maxSizeBytes: 50 * 1024 * 1024,
      onChange: (cardState) => this.handleMovingChange(cardState),
      onRemove: () => this.handleMovingRemove()
    });
    mountMov.appendChild(this.movingCard.render());

    // Proceed Button Click Listener
    this.proceedButton.addEventListener('click', () => {
      this.handleProceedToProcessing();
    });

    this.updateProceedStatus();
    return this.element;
  }

  /**
   * Handle changes to the Reference Card state
   */
  handleReferenceChange(cardState) {
    this.referenceState.file = cardState.file;
    this.referenceState.metadata = cardState.metadata;
    this.referenceState.isValid = cardState.isValid;
    this.updateProceedStatus();
  }

  /**
   * Handle removal of the Reference Card file
   */
  handleReferenceRemove() {
    this.referenceState.file = null;
    this.referenceState.metadata = null;
    this.referenceState.isValid = false;
    this.updateProceedStatus();
  }

  /**
   * Handle changes to the Moving Card state
   */
  handleMovingChange(cardState) {
    this.movingState.file = cardState.file;
    this.movingState.metadata = cardState.metadata;
    this.movingState.isValid = cardState.isValid;
    this.updateProceedStatus();
  }

  /**
   * Handle removal of the Moving Card file
   */
  handleMovingRemove() {
    this.movingState.file = null;
    this.movingState.metadata = null;
    this.movingState.isValid = false;
    this.updateProceedStatus();
  }

  /**
   * Update Proceed Button and Staging Status Bar
   */
  updateProceedStatus() {
    const refOk = this.referenceState.isValid;
    const movOk = this.movingState.isValid;
    const bothOk = refOk && movOk;

    if (this.proceedButton) {
      this.proceedButton.disabled = !bothOk;
    }

    if (this.statusBadge && this.statusLabel && this.statusDesc) {
      this.statusBadge.className = 'status-dot';

      if (bothOk) {
        this.statusBadge.classList.add('active-ready');
        this.statusLabel.textContent = 'STAGING COMPLETE: READY FOR PROCESSING WORKFLOW';
        this.statusDesc.textContent = `Reference: [${this.referenceState.metadata.name}] • Moving: [${this.movingState.metadata.name}]. Click Continue to pass files to processing.`;
      } else if (refOk && !movOk) {
        this.statusBadge.classList.add('loading');
        this.statusLabel.textContent = 'STAGING INCOMPLETE: MOVING / SOURCE IMAGE REQUIRED';
        this.statusDesc.textContent = `Reference Image [${this.referenceState.metadata.name}] staged. Please select a valid Moving/Source Image.`;
      } else if (!refOk && movOk) {
        this.statusBadge.classList.add('loading');
        this.statusLabel.textContent = 'STAGING INCOMPLETE: REFERENCE IMAGE REQUIRED';
        this.statusDesc.textContent = `Moving Image [${this.movingState.metadata.name}] staged. Please select a valid Reference Image.`;
      } else {
        this.statusLabel.textContent = 'STAGING STATUS: AWAITING DUAL INPUTS';
        this.statusDesc.textContent = 'Both the Reference Image and Moving/Source Image must be staged and validated before proceeding to the registration pipeline.';
      }
    }
  }

  /**
   * Package files into a clean data object and pass to the Processing Module
   */
  async handleProceedToProcessing() {
    if (!this.referenceState.isValid || !this.movingState.isValid) {
      return;
    }

    // Prepare clean data object (No registration logic inside Input Module!)
    const payload = {
      timestamp: new Date().toISOString(),
      status: 'READY_FOR_PROCESSING',
      referenceImage: {
        file: this.referenceState.file,
        name: this.referenceState.metadata.name,
        size: this.referenceState.metadata.size,
        type: this.referenceState.metadata.type,
        dimensions: {
          width: this.referenceState.metadata.width,
          height: this.referenceState.metadata.height
        },
        lastModified: this.referenceState.metadata.lastModified
      },
      movingImage: {
        file: this.movingState.file,
        name: this.movingState.metadata.name,
        size: this.movingState.metadata.size,
        type: this.movingState.metadata.type,
        dimensions: {
          width: this.movingState.metadata.width,
          height: this.movingState.metadata.height
        },
        lastModified: this.movingState.metadata.lastModified
      }
    };

    // 1. Dispatch custom DOM event for decoupled subscribers
    const event = new CustomEvent('luna:input-staged', { detail: payload });
    window.dispatchEvent(event);

    // 2. Fire callback if provided
    if (this.onProceed) {
      this.onProceed(payload);
    }

    // 3. Optional POST to server staging endpoint
    let apiResult = null;
    try {
      const formData = new FormData();
      formData.append('reference_image', this.referenceState.file);
      formData.append('moving_image', this.movingState.file);
      formData.append('metadata', JSON.stringify({
        timestamp: payload.timestamp,
        referenceName: payload.referenceImage.name,
        movingName: payload.movingImage.name
      }));

      const res = await fetch(this.apiEndpoint, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        apiResult = await res.json();
      }
    } catch (err) {
      console.info('Staging via API optional/offline:', err.message);
    }

    // 4. Show mission control handoff confirmation modal
    this.showHandoffModal(payload, apiResult);
  }

  /**
   * Display clean handoff modal showing the staged data object
   */
  showHandoffModal(payload, apiResult) {
    const modalMount = this.element.querySelector('#inputModalMount');
    if (!modalMount) return;

    const modal = document.createElement('div');
    modal.className = 'input-modal-overlay';
    modal.id = 'handoffModal';

    const displayObj = {
      action: 'PASSED_TO_PROCESSING_MODULE',
      timestamp: payload.timestamp,
      apiStagingResponse: apiResult || { status: 'OFFLINE_OR_LOCAL_DISPATCH', note: 'Data object passed directly to in-memory subscriber' },
      referenceImage: {
        name: payload.referenceImage.name,
        size: FileMetadata.formatBytes(payload.referenceImage.size),
        type: payload.referenceImage.type,
        dimensions: payload.referenceImage.dimensions
      },
      movingImage: {
        name: payload.movingImage.name,
        size: FileMetadata.formatBytes(payload.movingImage.size),
        type: payload.movingImage.type,
        dimensions: payload.movingImage.dimensions
      },
      registrationAlgorithmStatus: 'STRICTLY DECOUPLED (SIFT / RANSAC pending execution in Processing Module)'
    };

    modal.innerHTML = `
      <div class="input-modal-dialog">
        <div class="input-modal-header">
          <div class="input-modal-title">
            <span>✓</span>
            <span>INPUT MODULE • CLEAN DATA HANDOFF COMPLETE</span>
          </div>
          <button type="button" class="input-modal-close" id="btnCloseHandoffModal">&times;</button>
        </div>
        <div class="input-modal-body">
          <p style="font-size: 12px; color: #c7cad2; line-height: 1.5; margin: 0;">
            Both lunar image payloads have been verified, packaged, and transferred to the downstream Processing Module pipeline.
            The Input Module has completed file acquisition without running any feature detection or registration algorithms.
          </p>

          <div>
            <span style="font-size: 11px; font-family: var(--font-mono, monospace); color: #d4af37; text-transform: uppercase;">
              Clean Handoff Data Object Payload:
            </span>
            <pre class="input-json-viewer">${JSON.stringify(displayObj, null, 2)}</pre>
          </div>
        </div>
        <div class="input-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-browse-file" id="btnDismissHandoffModal" style="flex: 0 0 auto;">
            <span>Acknowledge & Close</span>
          </button>
          <button type="button" class="btn-proceed-processing" id="btnLaunchProcessing" style="flex: 0 0 auto; background: linear-gradient(135deg, #d4af37 0%, #b89628 100%); color: #07080a; font-weight: 700; border: none; padding: 10px 18px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <span>Launch Processing Module &rarr;</span>
          </button>
        </div>
      </div>
    `;

    modalMount.innerHTML = '';
    modalMount.appendChild(modal);

    const closeModal = () => {
      modalMount.innerHTML = '';
    };

    modal.querySelector('#btnCloseHandoffModal').addEventListener('click', closeModal);
    modal.querySelector('#btnDismissHandoffModal').addEventListener('click', closeModal);

    const launchBtn = modal.querySelector('#btnLaunchProcessing');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        const stageId = apiResult?.stage_id;
        const targetUrl = stageId ? `/processing?stage_id=${encodeURIComponent(stageId)}` : '/processing';
        window.location.href = targetUrl;
      });
    }
  }

  /**
   * Get complete module state
   */
  getState() {
    return {
      reference: { ...this.referenceState },
      moving: { ...this.movingState },
      bothValid: this.referenceState.isValid && this.movingState.isValid
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.InputModule = InputModule;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InputModule };
}
