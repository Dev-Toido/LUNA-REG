/**
 * LUNA-REG: DatasetOverview Component (Part 6)
 * High-density planetary telemetry overview cards
 * 
 * Displays:
 * - Total Regions
 * - Total Products
 * - Total Candidate & Verified Pairs
 * - Available Raster & Metadata Files
 * - Secondary metrics (storage volume, verified ratio, calibrated ratio)
 * 
 * Design: Obsidian black, lunar grey, off-white, champagne gold accents. Zero blue.
 */

function renderDatasetOverview(stats = {}) {
  const {
    totalRegions = '—',
    totalProducts = '—',
    totalPairs = '—',
    totalFiles = '—',
    verifiedPairsCount = 0,
    calibratedProductsCount = 0,
    storageSizeFormatted = '—',
    lastUpdated = null
  } = stats;

  const timeDisplay = lastUpdated 
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC'
    : 'NOMINAL';

  return `
    <div class="dataset-overview-grid" id="dataset-overview-grid">
      <!-- Card 1: Total Regions -->
      <div class="dataset-overview-card" data-metric="regions">
        <div class="card-header-mini">
          <span class="card-label"><span class="telemetry-bullet"></span> TARGET REGIONS</span>
          <span class="card-badge">GIS BOUNDS</span>
        </div>
        <div class="card-value-row">
          <span class="card-value" id="stat-regions-val">${totalRegions}</span>
          <span class="card-sub-unit">SITES</span>
        </div>
        <div class="card-footer-mini">
          <span class="footer-label">POLAR & EQUATORIAL</span>
          <span class="footer-highlight">SHACKLETON / BOGUSLAWSKY</span>
        </div>
      </div>

      <!-- Card 2: Total Products -->
      <div class="dataset-overview-card" data-metric="products">
        <div class="card-header-mini">
          <span class="card-label"><span class="telemetry-bullet"></span> LUNAR PRODUCTS</span>
          <span class="card-badge">${calibratedProductsCount > 0 ? `${calibratedProductsCount} CALIBRATED` : 'ORBITAL'}</span>
        </div>
        <div class="card-value-row">
          <span class="card-value" id="stat-products-val">${totalProducts}</span>
          <span class="card-sub-unit">RASTERS</span>
        </div>
        <div class="card-footer-mini">
          <span class="footer-label">INSTRUMENTS</span>
          <span class="footer-highlight">TMC-2 • OHRC • LOLA</span>
        </div>
      </div>

      <!-- Card 3: Total Pairs -->
      <div class="dataset-overview-card" data-metric="pairs">
        <div class="card-header-mini">
          <span class="card-label"><span class="telemetry-bullet"></span> REGISTRATION PAIRS</span>
          <span class="card-badge gold">${verifiedPairsCount > 0 ? `${verifiedPairsCount} VERIFIED` : 'ACTIVE'}</span>
        </div>
        <div class="card-value-row">
          <span class="card-value text-gold" id="stat-pairs-val">${totalPairs}</span>
          <span class="card-sub-unit">COUPLED</span>
        </div>
        <div class="card-footer-mini">
          <span class="footer-label">MULTI-MODAL</span>
          <span class="footer-highlight">OPTICAL / DEM / ORTHO</span>
        </div>
      </div>

      <!-- Card 4: Available Files -->
      <div class="dataset-overview-card" data-metric="files">
        <div class="card-header-mini">
          <span class="card-label"><span class="telemetry-bullet"></span> STORAGE OBJECTS</span>
          <span class="card-badge">PDS4 / GEOTIFF</span>
        </div>
        <div class="card-value-row">
          <span class="card-value" id="stat-files-val">${totalFiles}</span>
          <span class="card-sub-unit">FILES</span>
        </div>
        <div class="card-footer-mini">
          <span class="footer-label">STORAGE VOL</span>
          <span class="footer-highlight" id="stat-storage-vol">${storageSizeFormatted}</span>
        </div>
      </div>
    </div>
  `;
}

if (typeof exports !== 'undefined') {
  exports.renderDatasetOverview = renderDatasetOverview;
}
if (typeof window !== 'undefined') {
  window.renderDatasetOverview = renderDatasetOverview;
}
