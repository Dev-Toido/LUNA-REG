/**
 * LUNA-REG: FilterBar Component
 * Search and filter controls for lunar products and image pairs
 */

function renderFilterBar(options = {}) {
  const isPairs = options.mode === 'pairs';
  const regions = options.regions || [];

  return `<div class="scientific-filter-bar">
    <div class="filter-controls-group">
      <div class="filter-field">
        <label for="filter-search" class="filter-label">SEARCH</label>
        <div class="filter-input-wrap">
          <input type="text" id="filter-search" class="canonical-input" placeholder="${isPairs ? 'Search pair ID, instrument...' : 'Search product ID, mission...'}" />
        </div>
      </div>

      ${isPairs ? `
      <div class="filter-field">
        <label for="filter-overlap" class="filter-label">OVERLAP STATUS</label>
        <select id="filter-overlap" class="canonical-select">
          <option value="">ALL STATUSES</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="UNVERIFIED">UNVERIFIED</option>
          <option value="FAILED">FAILED</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-src-inst" class="filter-label">SOURCE INSTRUMENT</label>
        <select id="filter-src-inst" class="canonical-select">
          <option value="">ALL INSTRUMENTS</option>
          <option value="TMC-2">TMC-2 (Terrain Mapping)</option>
          <option value="OHRC">OHRC (High Resolution)</option>
          <option value="IIRS">IIRS (Infrared)</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-ref-inst" class="filter-label">REF INSTRUMENT</label>
        <select id="filter-ref-inst" class="canonical-select">
          <option value="">ALL INSTRUMENTS</option>
          <option value="OHRC">OHRC (High Resolution)</option>
          <option value="TMC-2">TMC-2 (Terrain Mapping)</option>
          <option value="IIRS">IIRS (Infrared)</option>
        </select>
      </div>
      ` : `
      <div class="filter-field">
        <label for="filter-instrument" class="filter-label">INSTRUMENT</label>
        <select id="filter-instrument" class="canonical-select">
          <option value="">ALL INSTRUMENTS</option>
          <option value="TMC-2">TMC-2</option>
          <option value="OHRC">OHRC</option>
          <option value="IIRS">IIRS</option>
          <option value="CLASS">CLASS</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-mission" class="filter-label">MISSION</label>
        <select id="filter-mission" class="canonical-select">
          <option value="">ALL MISSIONS</option>
          <option value="Chandrayaan-2">CHANDRAYAAN-2</option>
          <option value="Chandrayaan-1">CHANDRAYAAN-1</option>
          <option value="LRO">LRO (NASA)</option>
        </select>
      </div>
      `}

      <div class="filter-field">
        <label for="filter-region" class="filter-label">STUDY REGION</label>
        <select id="filter-region" class="canonical-select">
          <option value="">ALL REGIONS</option>
          ${regions.map(r => `<option value="${r.id}">${r.name || `Region #${r.id}`}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="filter-actions-group">
      <button class="btn-tech" id="btn-reset-filters" title="Reset all active filters">RESET</button>
      <div class="view-mode-toggle" id="view-mode-toggle">
        <button class="view-btn active" data-view="table" id="btn-view-table" title="Table View">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
        <button class="view-btn" data-view="cards" id="btn-view-cards" title="Card Grid View">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

if (typeof exports !== 'undefined') {
  exports.renderFilterBar = renderFilterBar;
}
if (typeof window !== 'undefined') {
  window.renderFilterBar = renderFilterBar;
}
