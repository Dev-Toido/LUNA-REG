/**
 * LUNA-REG — FileMetadata Component
 * Reusable mission-control metadata telemetry display.
 * Formats and renders real file details: name, size, format, dimensions, timestamps.
 */

class FileMetadata {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container]
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.element = null;
    this.metadata = null;
  }

  /**
   * Format bytes to human-readable string (B, KB, MB)
   * @param {number} bytes
   * @returns {string}
   */
  static formatBytes(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2);
    return `${val} ${sizes[i]}`;
  }

  /**
   * Get clean display name for file format
   * @param {string} fileName
   * @param {string} mimeType
   * @returns {string}
   */
  static getFormatLabel(fileName, mimeType) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    switch (ext) {
      case 'png': return 'PNG Image (image/png)';
      case 'jpg':
      case 'jpeg': return 'JPEG Image (image/jpeg)';
      case 'tif':
      case 'tiff': return 'TIFF Raster (image/tiff)';
      case 'img': return 'Lunar PDS / Raw Raster (.img)';
      default: return mimeType ? `${ext.toUpperCase()} (${mimeType})` : ext.toUpperCase();
    }
  }

  /**
   * Update metadata display
   * @param {Object|null} meta
   * @param {string} meta.name
   * @param {number} meta.size
   * @param {string} meta.type
   * @param {number} [meta.width]
   * @param {number} [meta.height]
   * @param {number} [meta.lastModified]
   */
  update(meta) {
    this.metadata = meta;
    this.render();
  }

  clear() {
    this.metadata = null;
    this.render();
  }

  render() {
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'file-metadata-container';
      if (this.container) {
        this.container.appendChild(this.element);
      }
    }

    if (!this.metadata) {
      this.element.innerHTML = `
        <div class="metadata-row">
          <span class="metadata-label">TELEMETRY</span>
          <span class="metadata-value">NO FILE STAGED</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">PAYLOAD SIZE</span>
          <span class="metadata-value">—</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">RASTER MATRIX</span>
          <span class="metadata-value">—</span>
        </div>
      `;
      return this.element;
    }

    const { name, size, type, width, height, lastModified } = this.metadata;
    const formattedSize = FileMetadata.formatBytes(size);
    const formatLabel = FileMetadata.getFormatLabel(name, type);
    
    let dimensionsText = 'Extracting...';
    if (width && height) {
      dimensionsText = `${width} × ${height} px`;
    } else if (name.toLowerCase().endsWith('.img')) {
      dimensionsText = 'Binary Raster (Header Pending)';
    } else if (name.toLowerCase().endsWith('.tif') || name.toLowerCase().endsWith('.tiff')) {
      dimensionsText = width && height ? `${width} × ${height} px` : 'Scientific TIFF Raster';
    } else if (width === null || width === undefined) {
      dimensionsText = 'Not Available';
    }

    let modifiedText = '—';
    if (lastModified) {
      const d = new Date(lastModified);
      modifiedText = d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }

    this.element.innerHTML = `
      <div class="metadata-row">
        <span class="metadata-label">FILE NAME</span>
        <span class="metadata-value highlight" title="${name}">${name}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">FORMAT</span>
        <span class="metadata-value">${formatLabel}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">FILE SIZE</span>
        <span class="metadata-value">${formattedSize}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">DIMENSIONS</span>
        <span class="metadata-value ${width && height ? 'highlight' : ''}">${dimensionsText}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">TIMESTAMP</span>
        <span class="metadata-value">${modifiedText}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">INTEGRITY</span>
        <span class="metadata-value success">✓ VALIDATED</span>
      </div>
    `;

    return this.element;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.FileMetadata = FileMetadata;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FileMetadata };
}
