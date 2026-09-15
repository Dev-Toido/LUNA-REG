/**
 * LUNA-REG: FileMetadataPanel Component (Part 6)
 * High-precision inspection panel for raster and metadata file objects
 * 
 * Features:
 * - Product file list (PDS4 XML, GeoTIFF, ancillary indices)
 * - File type, file size, MIME type, storage location / URI
 * - Checksum / integrity verification status
 * - Disabled download actions with clear notice when file is stored in protected local filesystem
 * - Null-safe handling with '—' or 'Not available'
 * 
 * Design: Zero blue. Lunar dark palette, champagne gold accents.
 */

function renderFileMetadataPanel(options = {}) {
  const {
    files = [],
    product = null,
    isLoading = false,
    errorMessage = null
  } = options;

  if (isLoading) {
    return `
      <div class="file-metadata-panel loading-state">
        <div class="spinner-telemetry"></div>
        <div class="panel-loading-text">QUERYING FILE STORAGE MANIFEST...</div>
      </div>
    `;
  }

  if (errorMessage) {
    return `
      <div class="file-metadata-panel error-state">
        <div class="panel-error-icon">⚠</div>
        <div class="panel-error-title">FILE REPOSITORY UNREACHABLE</div>
        <div class="panel-error-msg">${escapeHtmlFile(errorMessage)}</div>
      </div>
    `;
  }

  if (!files || files.length === 0) {
    return `
      <div class="file-metadata-panel empty-state">
        <div class="empty-icon-subtle">📁</div>
        <div class="panel-empty-title">NO FILE OBJECTS REGISTERED</div>
        <div class="panel-empty-text">No raster or XML metadata files are currently linked to this record in the backend repository.</div>
      </div>
    `;
  }

  return `
    <div class="file-metadata-panel" id="file-metadata-panel">
      <div class="panel-section-header">
        <span class="section-title">ASSOCIATED STORAGE OBJECTS (${files.length})</span>
        <span class="section-badge">FILE MANIFEST</span>
      </div>

      <div class="file-items-list">
        ${files.map((file, idx) => {
          const fileName = file.filename || file.file_name || file.name || `file_${idx + 1}`;
          const fileType = file.file_type || file.type || inferFileType(fileName);
          const mimeType = file.mime_type || file.mime || inferMimeType(fileName);
          const fileSizeFormatted = formatBytes(file.file_size_bytes || file.size_bytes || file.file_size || file.size);
          const storageUri = file.storage_path || file.storage_uri || file.file_path || file.uri || '—';
          const checksum = file.checksum || file.sha256 || file.md5 || '—';
          const isDownloadable = Boolean(file.download_url && file.download_url !== '#');

          return `
            <div class="file-manifest-card" data-file-index="${idx}">
              <div class="file-card-top">
                <div class="file-card-name-group">
                  <span class="file-type-icon">${getFileIcon(fileType)}</span>
                  <span class="file-name-text" title="${escapeHtmlFile(fileName)}">${escapeHtmlFile(fileName)}</span>
                </div>
                <span class="file-type-badge ${fileType.toLowerCase()}">${escapeHtmlFile(fileType)}</span>
              </div>

              <div class="file-specs-grid">
                <div class="file-spec-item">
                  <span class="spec-lbl">FILE SIZE</span>
                  <span class="spec-val col-mono">${fileSizeFormatted}</span>
                </div>
                <div class="file-spec-item">
                  <span class="spec-lbl">MIME TYPE</span>
                  <span class="spec-val col-mono">${escapeHtmlFile(mimeType)}</span>
                </div>
                <div class="file-spec-item full-width">
                  <span class="spec-lbl">STORAGE URI / PATH</span>
                  <span class="spec-val col-mono uri-val" title="${escapeHtmlFile(storageUri)}">${escapeHtmlFile(storageUri)}</span>
                </div>
                <div class="file-spec-item full-width">
                  <span class="spec-lbl">INTEGRITY CHECKSUM</span>
                  <span class="spec-val col-mono checksum-val" title="${escapeHtmlFile(checksum)}">${escapeHtmlFile(checksum)}</span>
                </div>
              </div>

              <div class="file-card-actions">
                ${isDownloadable ? `
                  <a href="${escapeHtmlFile(file.download_url)}" class="btn-tech-sm btn-gold btn-download-file" download="${escapeHtmlFile(fileName)}">
                    DOWNLOAD FILE
                  </a>
                ` : `
                  <button class="btn-tech-sm btn-disabled" disabled title="Direct download is disabled for local GIS repository files">
                    LOCAL ARCHIVE (DOWNLOAD DISABLED)
                  </button>
                `}
                <span class="file-security-notice">ACCESS CONTROL: READ-ONLY GIS REPOSITORY</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function inferFileType(filename) {
  if (!filename) return 'UNKNOWN';
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'GEOTIFF';
  if (lower.endsWith('.xml')) return 'PDS4_XML';
  if (lower.endsWith('.lbl')) return 'PDS3_LBL';
  if (lower.endsWith('.json')) return 'GEOJSON';
  if (lower.endsWith('.png')) return 'PNG';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'JPEG';
  if (lower.endsWith('.dem')) return 'DEM_RASTER';
  return 'DATA_FILE';
}

function inferMimeType(filename) {
  if (!filename) return 'Not available';
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.lbl')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function getFileIcon(type) {
  const t = String(type).toUpperCase();
  if (t.includes('TIFF') || t.includes('GEOTIFF') || t.includes('IMG')) return '▦';
  if (t.includes('XML') || t.includes('LBL')) return '≡';
  if (t.includes('DEM')) return '▲';
  return '▫';
}

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || bytes === '' || isNaN(Number(bytes))) {
    return '—';
  }
  const b = Number(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + (sizes[i] || 'B');
}

function escapeHtmlFile(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderFileMetadataPanel = renderFileMetadataPanel;
}
if (typeof window !== 'undefined') {
  window.renderFileMetadataPanel = renderFileMetadataPanel;
}
