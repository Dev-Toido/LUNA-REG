/**
 * LUNA-REG — FileUploadCard Component
 * Reusable mission-control file upload card for lunar image input.
 * Encapsulates dedicated hidden native file input, browse button, drag-and-drop zone,
 * validation, metadata extraction, preview, and independent state management.
 */

class FileUploadCard {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique DOM ID
   * @param {string} options.role - 'reference' | 'moving'
   * @param {string} options.title - Card header title
   * @param {string} options.explanation - Explanatory text for the user
   * @param {Array<string>} [options.acceptedExtensions] - ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.img']
   * @param {number} [options.maxSizeBytes] - Max file size in bytes (default: 50 MB)
   * @param {Function} [options.onChange] - Callback fired when valid file is selected/changed
   * @param {Function} [options.onRemove] - Callback fired when file is removed
   */
  constructor(options = {}) {
    this.id = options.id || `card_${Math.random().toString(36).substring(2, 9)}`;
    this.role = options.role || 'reference';
    this.title = options.title || 'IMAGE INPUT';
    this.explanation = options.explanation || '';
    this.acceptedExtensions = options.acceptedExtensions || ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.img'];
    this.maxSizeBytes = options.maxSizeBytes || 50 * 1024 * 1024; // 50 MB limit
    this.onChange = options.onChange || null;
    this.onRemove = options.onRemove || null;

    // Independent Card State
    this.file = null;
    this.metadata = null;
    this.isValid = false;
    this.error = null;
    this.isLoading = false;

    // DOM References
    this.cardElement = null;
    this.fileInput = null;
    this.browseButton = null;
    this.replaceButton = null;
    this.removeButton = null;
    this.statusDot = null;
    this.statusText = null;

    // Child Components
    this.previewComponent = null;
    this.metadataComponent = null;
    this.validationComponent = null;
  }

  /**
   * Initialize and render the component DOM
   * @returns {HTMLElement}
   */
  render() {
    if (this.cardElement) return this.cardElement;

    this.cardElement = document.createElement('div');
    this.cardElement.className = `file-upload-card role-${this.role}`;
    this.cardElement.id = this.id;

    // Header HTML
    const roleBadgeClass = this.role === 'reference' ? 'reference' : 'moving';
    const roleBadgeText = this.role === 'reference' ? 'BASE REFERENCE' : 'TARGET MOVING';

    this.cardElement.innerHTML = `
      <!-- HUD Reticle Corner Brackets -->
      <span class="hud-corner-bracket tl"></span>
      <span class="hud-corner-bracket tr"></span>
      <span class="hud-corner-bracket bl"></span>
      <span class="hud-corner-bracket br"></span>

      <!-- Hidden Native File Input (Pure Browser File Picker) -->
      <input 
        type="file" 
        id="${this.id}_fileInput" 
        class="hidden-file-input" 
        accept="${this.acceptedExtensions.join(',')}"
        tabindex="-1"
      />

      <!-- Card Header -->
      <div class="upload-card-header">
        <div class="upload-card-header-main">
          <div class="upload-role-badge ${roleBadgeClass}">
            <span>${roleBadgeText}</span>
          </div>
          <h3 class="upload-card-title">${this.title}</h3>
          <p class="upload-card-explanation">${this.explanation}</p>
        </div>
        <div class="upload-card-status-indicator">
          <span class="status-dot" id="${this.id}_statusDot"></span>
          <span id="${this.id}_statusText">Awaiting File</span>
        </div>
      </div>

      <!-- Card Body -->
      <div class="upload-card-body">
        <!-- Preview Container Mount -->
        <div id="${this.id}_previewMount"></div>

        <!-- Validation Alert Mount -->
        <div id="${this.id}_validationMount"></div>

        <!-- Metadata Container Mount -->
        <div id="${this.id}_metadataMount"></div>

        <!-- Action Controls Toolbar -->
        <div class="upload-card-actions">
          <button type="button" class="btn-browse-file" id="${this.id}_btnBrowse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Browse File</span>
          </button>
          
          <button type="button" class="btn-replace-file" id="${this.id}_btnReplace" style="display: none;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Replace</span>
          </button>

          <button type="button" class="btn-remove-file" id="${this.id}_btnRemove" style="display: none;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Remove</span>
          </button>
        </div>
      </div>
    `;

    // Cache DOM Elements
    this.fileInput = this.cardElement.querySelector(`#${this.id}_fileInput`);
    this.browseButton = this.cardElement.querySelector(`#${this.id}_btnBrowse`);
    this.replaceButton = this.cardElement.querySelector(`#${this.id}_btnReplace`);
    this.removeButton = this.cardElement.querySelector(`#${this.id}_btnRemove`);
    this.statusDot = this.cardElement.querySelector(`#${this.id}_statusDot`);
    this.statusText = this.cardElement.querySelector(`#${this.id}_statusText`);

    // Instantiate Child Components
    const previewMount = this.cardElement.querySelector(`#${this.id}_previewMount`);
    this.previewComponent = new FilePreview({
      container: previewMount,
      onTriggerBrowse: () => this.triggerBrowse()
    });
    this.previewComponent.render();

    const validationMount = this.cardElement.querySelector(`#${this.id}_validationMount`);
    this.validationComponent = new FileValidationMessage({
      container: validationMount
    });
    this.validationComponent.render();

    const metadataMount = this.cardElement.querySelector(`#${this.id}_metadataMount`);
    this.metadataComponent = new FileMetadata({
      container: metadataMount
    });
    this.metadataComponent.render();

    // Attach Event Listeners
    this.setupListeners();

    return this.cardElement;
  }

  /**
   * Attach all DOM listeners (file input, browse, drag & drop, remove, replace)
   */
  setupListeners() {
    // 1. Native File Picker Change
    this.fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        this.processFile(files[0]);
      }
    });

    // 2. Browse File Button
    this.browseButton.addEventListener('click', () => {
      this.triggerBrowse();
    });

    // 3. Replace File Button
    this.replaceButton.addEventListener('click', () => {
      this.triggerBrowse();
    });

    // 4. Remove File Button
    this.removeButton.addEventListener('click', () => {
      this.removeFile();
    });

    // 5. Drag & Drop Support
    const dragTarget = this.cardElement;

    ['dragenter', 'dragover'].forEach(eventName => {
      dragTarget.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cardElement.classList.add('drag-active');
        const previewEl = this.cardElement.querySelector('.file-preview-container');
        if (previewEl) previewEl.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      dragTarget.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cardElement.classList.remove('drag-active');
        const previewEl = this.cardElement.querySelector('.file-preview-container');
        if (previewEl) previewEl.classList.remove('dragover');
      }, false);
    });

    dragTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cardElement.classList.remove('drag-active');
      const previewEl = this.cardElement.querySelector('.file-preview-container');
      if (previewEl) previewEl.classList.remove('dragover');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.processFile(e.dataTransfer.files[0]);
      }
    }, false);
  }

  /**
   * Programmatically open native OS file browser
   */
  triggerBrowse() {
    if (this.fileInput) {
      // Reset input value so re-selecting the exact same file fires the 'change' event
      this.fileInput.value = '';
      this.fileInput.click();
    }
  }

  /**
   * Validate file format against acceptedExtensions
   * @param {File} file
   * @returns {boolean}
   */
  validateFormat(file) {
    if (!file || !file.name) return false;
    const fileName = file.name.toLowerCase();
    return this.acceptedExtensions.some(ext => fileName.endsWith(ext.toLowerCase()));
  }

  /**
   * Validate file size against maxSizeBytes
   * @param {File} file
   * @returns {boolean}
   */
  validateSize(file) {
    if (!file) return false;
    return file.size <= this.maxSizeBytes;
  }

  /**
   * Process and validate a selected File
   * @param {File} file
   */
  async processFile(file) {
    if (!file) return;

    // Reset previous error
    this.error = null;
    this.validationComponent.clear();
    this.cardElement.classList.remove('has-error');

    // 1. Validate File Format
    if (!this.validateFormat(file)) {
      const ext = '.' + file.name.split('.').pop();
      this.setError({
        type: 'format',
        extension: ext,
        accepted: this.acceptedExtensions
      });
      return;
    }

    // 2. Validate File Size (< 50 MB)
    if (!this.validateSize(file)) {
      this.setError({
        type: 'size',
        actualSizeFormatted: FileMetadata.formatBytes(file.size),
        maxSizeFormatted: FileMetadata.formatBytes(this.maxSizeBytes)
      });
      return;
    }

    // File passed preliminary format and size checks -> Show Loading State
    this.setLoading(true);

    try {
      // Extract image dimensions whenever available
      const dimensions = await this.extractDimensions(file);

      // Successfully read and verified file
      this.file = file;
      this.isValid = true;
      this.isLoading = false;

      this.metadata = {
        name: file.name,
        size: file.size,
        type: file.type || this.getMimeFallback(file.name),
        width: dimensions.width,
        height: dimensions.height,
        lastModified: file.lastModified
      };

      // Update Card Visuals
      this.cardElement.classList.add('has-file');
      this.cardElement.classList.remove('has-error');

      // Update Subcomponents
      const isWebRenderable = this.isWebRenderableFormat(file.name);
      this.previewComponent.setLoaded({
        file: file,
        name: file.name,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        isWebRenderable: isWebRenderable
      });

      this.metadataComponent.update(this.metadata);

      // Update HUD status & action buttons
      this.updateStatus('ready', 'Validated & Ready');
      this.browseButton.style.display = 'none';
      this.replaceButton.style.display = 'inline-flex';
      this.removeButton.style.display = 'inline-flex';

      // Notify parent/callback
      if (this.onChange) {
        this.onChange(this.getState());
      }

    } catch (err) {
      console.error('Error reading image telemetry:', err);
      this.setError({
        type: 'read',
        title: 'FILE READ EXCEPTION',
        message: 'Unable to decode raster dimensions from the selected file.'
      });
    }
  }

  /**
   * Extract image dimensions using browser Image decoding or headers
   * @param {File} file
   * @returns {Promise<{width: number|null, height: number|null}>}
   */
  extractDimensions(file) {
    return new Promise((resolve) => {
      const ext = file.name.toLowerCase().split('.').pop();

      // Standard web image formats (PNG, JPG, JPEG)
      if (['png', 'jpg', 'jpeg'].includes(ext)) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve({ width: w, height: h });
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ width: null, height: null });
        };

        img.src = url;
        return;
      }

      // TIFF or IMG binary formats: attempt basic TIFF header parsing or resolve null
      if (['tif', 'tiff'].includes(ext)) {
        // Try reading TIFF header bytes
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const buffer = e.target.result;
            const view = new DataView(buffer);
            // Check byte order: II (0x4949 little-endian) or MM (0x4D4D big-endian)
            const byteOrder = view.getUint16(0, false);
            const isLittle = byteOrder === 0x4949;
            const magic = view.getUint16(2, isLittle);
            if (magic === 42) {
              // Valid TIFF magic. We can indicate scientific TIFF
              resolve({ width: null, height: null });
              return;
            }
          } catch (_) {}
          resolve({ width: null, height: null });
        };
        reader.onerror = () => resolve({ width: null, height: null });
        reader.readAsArrayBuffer(file.slice(0, 1024));
        return;
      }

      // Default fallback (e.g. .img)
      resolve({ width: null, height: null });
    });
  }

  /**
   * Determine if format is directly renderable by HTML <img>
   */
  isWebRenderableFormat(fileName) {
    const ext = (fileName || '').toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg'].includes(ext);
  }

  /**
   * Guess MIME fallback by extension
   */
  getMimeFallback(fileName) {
    const ext = (fileName || '').toLowerCase().split('.').pop();
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'tif':
      case 'tiff': return 'image/tiff';
      case 'img': return 'application/octet-stream';
      default: return 'application/octet-stream';
    }
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    if (loading) {
      this.updateStatus('loading', 'Reading File Telemetry...');
      this.previewComponent.setLoading('Analyzing image raster matrix...');
      this.browseButton.disabled = true;
    } else {
      this.browseButton.disabled = false;
    }
  }

  /**
   * Set error state on this card
   */
  setError(errorObj) {
    this.file = null;
    this.metadata = null;
    this.isValid = false;
    this.isLoading = false;
    this.error = errorObj;

    this.cardElement.classList.add('has-error');
    this.cardElement.classList.remove('has-file');

    this.updateStatus('error', 'Validation Failed');
    this.validationComponent.setError(errorObj);
    this.previewComponent.clear();
    this.metadataComponent.clear();

    this.browseButton.style.display = 'inline-flex';
    this.browseButton.disabled = false;
    this.replaceButton.style.display = 'none';
    this.removeButton.style.display = 'none';

    if (this.fileInput) {
      this.fileInput.value = '';
    }

    if (this.onChange) {
      this.onChange(this.getState());
    }
  }

  /**
   * Remove selected file and reset card to clean empty state
   */
  removeFile() {
    this.file = null;
    this.metadata = null;
    this.isValid = false;
    this.isLoading = false;
    this.error = null;

    if (this.fileInput) {
      this.fileInput.value = '';
    }

    this.cardElement.classList.remove('has-file');
    this.cardElement.classList.remove('has-error');

    this.updateStatus('empty', 'Awaiting File');
    this.previewComponent.clear();
    this.metadataComponent.clear();
    this.validationComponent.clear();

    this.browseButton.style.display = 'inline-flex';
    this.browseButton.disabled = false;
    this.replaceButton.style.display = 'none';
    this.removeButton.style.display = 'none';

    if (this.onRemove) {
      this.onRemove();
    }
    if (this.onChange) {
      this.onChange(this.getState());
    }
  }

  /**
   * Update header status indicator
   */
  updateStatus(state, label) {
    if (!this.statusDot || !this.statusText) return;
    this.statusDot.className = 'status-dot';
    this.statusText.textContent = label;

    if (state === 'ready') {
      this.statusDot.classList.add('active-ready');
    } else if (state === 'loading') {
      this.statusDot.classList.add('loading');
    } else if (state === 'error') {
      this.statusDot.classList.add('error');
    }
  }

  /**
   * Retrieve current card state
   */
  getState() {
    return {
      id: this.id,
      role: this.role,
      file: this.file,
      metadata: this.metadata,
      isValid: this.isValid,
      error: this.error,
      isLoading: this.isLoading
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.FileUploadCard = FileUploadCard;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FileUploadCard };
}
