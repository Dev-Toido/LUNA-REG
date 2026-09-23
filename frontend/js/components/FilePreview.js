/**
 * LUNA-REG — FilePreview Component
 * Reusable mission-control raster preview component.
 * Handles empty state, loading telemetry radar spinner, loaded raster display,
 * and scientific non-browser raster badges (.tif, .tiff, .img).
 */

class FilePreview {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container]
   * @param {Function} [options.onTriggerBrowse] - Callback when user clicks empty state dropzone
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.onTriggerBrowse = options.onTriggerBrowse || null;
    this.element = null;
    this.state = 'empty'; // 'empty' | 'loading' | 'loaded' | 'error'
    this.currentObjectUrl = null;
    this.fileData = null;
  }

  /**
   * Clean up existing Object URL to avoid browser memory leaks
   */
  cleanupUrl() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  /**
   * Set loading state
   * @param {string} [message]
   */
  setLoading(message = 'Reading image raster data...') {
    this.cleanupUrl();
    this.state = 'loading';
    this.loadingMessage = message;
    this.fileData = null;
    this.render();
  }

  /**
   * Set loaded file preview
   * @param {Object} data
   * @param {File|Blob} data.file
   * @param {string} data.name
   * @param {number} data.size
   * @param {number} [data.width]
   * @param {number} [data.height]
   * @param {boolean} [data.isWebRenderable]
   */
  setLoaded(data) {
    this.cleanupUrl();
    this.state = 'loaded';
    this.fileData = data;

    if (data.isWebRenderable && data.file) {
      try {
        this.currentObjectUrl = URL.createObjectURL(data.file);
      } catch (e) {
        console.warn('Could not create ObjectURL:', e);
      }
    }

    this.render();
  }

  /**
   * Clear back to empty state
   */
  clear() {
    this.cleanupUrl();
    this.state = 'empty';
    this.fileData = null;
    this.render();
  }

  /**
   * Render the preview container
   */
  render() {
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'file-preview-container';
      if (this.container) {
        this.container.appendChild(this.element);
      }

      // Allow clicking empty state to browse
      this.element.addEventListener('click', (e) => {
        if (this.state === 'empty' && this.onTriggerBrowse) {
          this.onTriggerBrowse();
        }
      });
    }

    // Clear contents
    this.element.innerHTML = '';

    if (this.state === 'empty') {
      this.element.className = 'file-preview-container';
      this.element.innerHTML = `
        <div class="preview-empty-state" title="Click or Drag & Drop File Here">
          <div class="preview-reticle-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="preview-prompt-text">DRAG & DROP IMAGE OR CLICK TO BROWSE</div>
          <div class="preview-subprompt-text">Real PC file selector • Max file size: 50 MB</div>
          <div class="preview-format-tags">
            <span class="preview-format-tag">.PNG</span>
            <span class="preview-format-tag">.JPG</span>
            <span class="preview-format-tag">.JPEG</span>
            <span class="preview-format-tag">.TIF</span>
            <span class="preview-format-tag">.TIFF</span>
            <span class="preview-format-tag">.IMG</span>
          </div>
        </div>
      `;
      return this.element;
    }

    if (this.state === 'loading') {
      this.element.className = 'file-preview-container';
      this.element.innerHTML = `
        <div class="preview-loading-state">
          <div class="hud-telemetry-spinner"></div>
          <div class="preview-loading-text">${this.loadingMessage || 'Reading raster telemetry...'}</div>
        </div>
      `;
      return this.element;
    }

    if (this.state === 'loaded' && this.fileData) {
      const ext = (this.fileData.name || '').split('.').pop().toUpperCase();
      const isRenderable = this.fileData.isWebRenderable && this.currentObjectUrl;

      if (isRenderable) {
        this.element.innerHTML = `
          <div class="preview-loaded-state">
            <span class="preview-format-overlay-badge">${ext}</span>
            <img 
              src="${this.currentObjectUrl}" 
              alt="${this.fileData.name}" 
              class="preview-image-element"
            />
            ${this.fileData.width && this.fileData.height ? `
              <span class="preview-dimension-badge">${this.fileData.width} × ${this.fileData.height} px</span>
            ` : ''}
          </div>
        `;
      } else {
        // Scientific Raster Placeholder (e.g. .img or unrendered TIFF)
        this.element.innerHTML = `
          <div class="preview-scientific-raster-badge">
            <div class="scientific-raster-icon">⚲</div>
            <div class="scientific-raster-title">LUNAR SCIENTIFIC RASTER (${ext})</div>
            <div class="scientific-raster-note">
              Binary raster payload validated and staged. Ready for server-side processing pipeline.
            </div>
            <span class="preview-dimension-badge">
              ${this.fileData.width && this.fileData.height ? `${this.fileData.width} × ${this.fileData.height} px` : `${ext} Binary Format`}
            </span>
          </div>
        `;
      }

      return this.element;
    }

    return this.element;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.FilePreview = FilePreview;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FilePreview };
}
