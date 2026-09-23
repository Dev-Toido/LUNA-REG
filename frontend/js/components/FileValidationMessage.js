/**
 * LUNA-REG — FileValidationMessage Component
 * Reusable mission-control validation alert component.
 * Displays formatted warnings and errors for format and size violations.
 */

class FileValidationMessage {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - Optional container to mount into
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.element = null;
    this.currentError = null;
  }

  /**
   * Set or clear error state
   * @param {Object|string|null} error
   *   If string: error message
   *   If object: { type: 'format' | 'size' | 'read' | 'custom', title: string, message: string }
   */
  setError(error) {
    this.currentError = error;
    this.render();
  }

  clear() {
    this.currentError = null;
    this.render();
  }

  /**
   * Static helper to format error messages
   */
  static formatError(error) {
    if (!error) return null;
    if (typeof error === 'string') {
      return {
        title: 'VALIDATION ALERT',
        message: error,
        level: 'error'
      };
    }

    if (error.type === 'format') {
      return {
        title: 'UNSUPPORTED FILE FORMAT',
        message: `File extension '${error.extension || 'unknown'}' is not accepted. Supported lunar image formats: ${error.accepted ? error.accepted.join(', ') : '.png, .jpg, .jpeg, .tif, .tiff, .img'}`,
        level: 'error'
      };
    }

    if (error.type === 'size') {
      return {
        title: 'FILE SIZE LIMIT EXCEEDED',
        message: `File size is ${error.actualSizeFormatted || 'over 50 MB'}. The maximum permitted image payload size is ${error.maxSizeFormatted || '50.0 MB'}.`,
        level: 'error'
      };
    }

    return {
      title: error.title || 'VALIDATION ERROR',
      message: error.message || 'An error occurred while validating the image file.',
      level: error.level || 'error'
    };
  }

  /**
   * Render the component DOM
   */
  render() {
    if (!this.element) {
      this.element = document.createElement('div');
      if (this.container) {
        this.container.appendChild(this.element);
      }
    }

    if (!this.currentError) {
      this.element.innerHTML = '';
      this.element.style.display = 'none';
      return this.element;
    }

    const formatted = FileValidationMessage.formatError(this.currentError);
    this.element.style.display = 'flex';
    this.element.className = `file-validation-message ${formatted.level}`;

    const iconSymbol = formatted.level === 'error' ? '⚠' : (formatted.level === 'warning' ? '⚡' : '✓');

    this.element.innerHTML = `
      <span class="validation-icon">${iconSymbol}</span>
      <div class="validation-text-group">
        <span class="validation-title">${formatted.title}</span>
        <span class="validation-details">${formatted.message}</span>
      </div>
    `;

    return this.element;
  }
}

// Export for module or global window scope
if (typeof window !== 'undefined') {
  window.FileValidationMessage = FileValidationMessage;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FileValidationMessage };
}
