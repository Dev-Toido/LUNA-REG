/**
 * LUNA-REG: DatasetFilters Component (Part 6)
 * Multi-parameter mission filtering suite and query control bar
 * 
 * Includes:
 * - Search query input (Product ID, Pair ID, Region name)
 * - Region filter
 * - Mission filter
 * - Instrument filter
 * - Product type filter
 * - Calibration status filter
 * - Overlap status filter
 * - Resolution range filter
 * - Source and Reference instrument filters
 * - Sort selector (acquisition date, resolution, instrument, status)
 * - Sort order toggle (ASC / DESC)
 * - Clear filters button
 * - Refresh data button
 * - Export metadata button (disabled when backend export API is unavailable)
 * 
 * Design: Zero blue. Champagne gold accents, lunar dark palette.
 */

function renderDatasetFilters(options = {}) {
  const {
    activeTab = 'products',
    filters = {},
    regions = [],
    instruments = ['TMC-2', 'OHRC', 'LOLA', 'LROC-NAC'],
    missions = ['Chandrayaan-2', 'LRO', 'Kaguya', 'Chandrayaan-1'],
    productTypes = ['IMG', 'DEM', 'ORTHO', 'MOSAIC'],
    calibrationStatuses = ['CALIBRATED', 'RAW', 'DERIVED', 'UNCALIBRATED'],
    overlapStatuses = ['VERIFIED', 'CANDIDATE', 'UNVERIFIED', 'REJECTED'],
    resolutionRanges = [
      { id: 'all', label: 'All Resolutions' },
      { id: 'high', label: 'High Resolution (< 1 m/px)' },
      { id: 'medium', label: 'Medium Resolution (1 – 10 m/px)' },
      { id: 'regional', label: 'Regional Scale (> 10 m/px)' }
    ],
    sortOptions = [
      { id: 'acquisition_time', label: 'Acquisition Date' },
      { id: 'resolution', label: 'Resolution (GSD)' },
      { id: 'instrument', label: 'Instrument Name' },
      { id: 'status', label: 'Status' },
      { id: 'id', label: 'Identifier / ID' }
    ],
    isExportAvailable = false,
    isLoading = false
  } = options;

  const q = filters.search || '';
  const selectedRegion = filters.region_id || '';
  const selectedMission = filters.mission || '';
  const selectedInstrument = filters.instrument || '';
  const selectedProductType = filters.product_type || '';
  const selectedCalibration = filters.calibration_status || '';
  const selectedOverlap = filters.overlap_status || '';
  const selectedResolution = filters.resolution_range || 'all';
  const selectedSourceInst = filters.source_instrument || '';
  const selectedRefInst = filters.reference_instrument || '';
  const sortBy = filters.sort_by || 'acquisition_time';
  const sortOrder = filters.sort_order || 'desc';

  // Determine visibility of filters based on active tab
  const isProductsTab = activeTab === 'products';
  const isPairsTab = activeTab === 'pairs';
  const isRegionsTab = activeTab === 'regions';

  return `
    <div class="dataset-filters-wrapper" id="dataset-filters-wrapper">
      <!-- Primary Search & Action Bar -->
      <div class="filter-main-bar">
        <!-- Search Input -->
        <div class="search-input-group">
          <span class="search-icon">⌕</span>
          <input 
            type="text" 
            id="dataset-search-input" 
            class="dataset-search-field" 
            placeholder="Search ${activeTab} by ID, sensor, mission, or name..." 
            value="${escapeHtml(q)}"
            autocomplete="off"
            spellcheck="false"
          />
          ${q ? `<button id="btn-clear-search" class="btn-clear-search" title="Clear text search">&times;</button>` : ''}
        </div>

        <!-- Global Action Controls -->
        <div class="filter-actions-group">
          <button id="btn-refresh-dataset" class="btn-filter-action" title="Fetch fresh records from backend API" ${isLoading ? 'disabled' : ''}>
            <span class="action-icon ${isLoading ? 'spin' : ''}">↻</span>
            <span class="action-text">REFRESH</span>
          </button>

          <button id="btn-clear-all-filters" class="btn-filter-action btn-clear" title="Reset all search filters to default">
            <span class="action-icon">⟲</span>
            <span class="action-text">CLEAR FILTERS</span>
          </button>

          <button 
            id="btn-export-metadata" 
            class="btn-filter-action ${isExportAvailable ? 'btn-gold' : 'btn-disabled'}" 
            title="${isExportAvailable ? 'Export filtered metadata catalog as JSON/CSV' : 'Export API endpoint currently unavailable'}"
            ${!isExportAvailable ? 'disabled' : ''}
          >
            <span class="action-icon">⤓</span>
            <span class="action-text">EXPORT METADATA</span>
          </button>
        </div>
      </div>

      <!-- Secondary Filter Parameters Ribbon -->
      <div class="filter-parameters-grid">
        <!-- Region Filter -->
        <div class="filter-select-group">
          <label for="filter-region-select" class="filter-label">REGION</label>
          <select id="filter-region-select" class="filter-select">
            <option value="">All Regions (${regions.length})</option>
            ${regions.map(r => `
              <option value="${r.id}" ${String(selectedRegion) === String(r.id) ? 'selected' : ''}>
                ${escapeHtml(r.name || `Region #${r.id}`)}
              </option>
            `).join('')}
          </select>
        </div>

        ${isProductsTab || isPairsTab ? `
          <!-- Mission Filter -->
          <div class="filter-select-group">
            <label for="filter-mission-select" class="filter-label">MISSION</label>
            <select id="filter-mission-select" class="filter-select">
              <option value="">All Missions</option>
              ${missions.map(m => `
                <option value="${m}" ${selectedMission === m ? 'selected' : ''}>${m}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        ${isProductsTab ? `
          <!-- Instrument Filter -->
          <div class="filter-select-group">
            <label for="filter-instrument-select" class="filter-label">INSTRUMENT</label>
            <select id="filter-instrument-select" class="filter-select">
              <option value="">All Instruments</option>
              ${instruments.map(i => `
                <option value="${i}" ${selectedInstrument === i ? 'selected' : ''}>${i}</option>
              `).join('')}
            </select>
          </div>

          <!-- Product Type Filter -->
          <div class="filter-select-group">
            <label for="filter-type-select" class="filter-label">PRODUCT TYPE</label>
            <select id="filter-type-select" class="filter-select">
              <option value="">All Types</option>
              ${productTypes.map(t => `
                <option value="${t}" ${selectedProductType === t ? 'selected' : ''}>${t}</option>
              `).join('')}
            </select>
          </div>

          <!-- Calibration Status Filter -->
          <div class="filter-select-group">
            <label for="filter-calibration-select" class="filter-label">CALIBRATION</label>
            <select id="filter-calibration-select" class="filter-select">
              <option value="">All Calibration</option>
              ${calibrationStatuses.map(c => `
                <option value="${c}" ${selectedCalibration === c ? 'selected' : ''}>${c}</option>
              `).join('')}
            </select>
          </div>

          <!-- Resolution Range Filter -->
          <div class="filter-select-group">
            <label for="filter-resolution-select" class="filter-label">RESOLUTION</label>
            <select id="filter-resolution-select" class="filter-select">
              ${resolutionRanges.map(res => `
                <option value="${res.id}" ${selectedResolution === res.id ? 'selected' : ''}>${res.label}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        ${isPairsTab ? `
          <!-- Source Instrument Filter -->
          <div class="filter-select-group">
            <label for="filter-source-inst-select" class="filter-label">SOURCE INSTRUMENT</label>
            <select id="filter-source-inst-select" class="filter-select">
              <option value="">All Source Sensors</option>
              ${instruments.map(i => `
                <option value="${i}" ${selectedSourceInst === i ? 'selected' : ''}>${i}</option>
              `).join('')}
            </select>
          </div>

          <!-- Reference Instrument Filter -->
          <div class="filter-select-group">
            <label for="filter-ref-inst-select" class="filter-label">REFERENCE INSTRUMENT</label>
            <select id="filter-ref-inst-select" class="filter-select">
              <option value="">All Reference Sensors</option>
              ${instruments.map(i => `
                <option value="${i}" ${selectedRefInst === i ? 'selected' : ''}>${i}</option>
              `).join('')}
            </select>
          </div>

          <!-- Overlap Status Filter -->
          <div class="filter-select-group">
            <label for="filter-overlap-select" class="filter-label">OVERLAP STATUS</label>
            <select id="filter-overlap-select" class="filter-select">
              <option value="">All Overlap Statuses</option>
              ${overlapStatuses.map(o => `
                <option value="${o}" ${selectedOverlap === o ? 'selected' : ''}>${o}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <!-- Sort By Control -->
        <div class="filter-select-group sort-group">
          <label for="filter-sort-by-select" class="filter-label">SORT BY</label>
          <div class="sort-control-container">
            <select id="filter-sort-by-select" class="filter-select">
              ${sortOptions.map(s => `
                <option value="${s.id}" ${sortBy === s.id ? 'selected' : ''}>${s.label}</option>
              `).join('')}
            </select>
            <button id="btn-sort-order-toggle" class="btn-sort-order" title="Toggle sort order (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})">
              ${sortOrder === 'asc' ? '▲ ASC' : '▼ DESC'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderDatasetFilters = renderDatasetFilters;
}
if (typeof window !== 'undefined') {
  window.renderDatasetFilters = renderDatasetFilters;
}
