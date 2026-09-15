/**
 * LUNA-REG: MapSearch Component (Part 7)
 * High-speed autocomplete GIS feature search for regions, products, and pairs
 * 
 * Features:
 * - Search by region name or ID
 * - Search by product ID, mission, or instrument
 * - Search by pair ID or sensor combination
 * - Categorized results dropdown with keyboard navigation
 * - Smooth viewport centering on selection
 * 
 * Palette: Zero blue. Obsidian black, deep charcoal, champagne gold accents.
 */

function renderMapSearch(options = {}) {
  const {
    query = '',
    results = [],
    isOpen = false
  } = options;

  return `
    <div class="map-search-wrapper" id="map-search-wrapper">
      <div class="map-search-input-box">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>

        <input type="text" 
               class="map-search-input" 
               id="map-feature-search-input" 
               placeholder="Search Region, Product ID, or Pair ID..." 
               value="${escapeHtmlSearch(query)}" 
               autocomplete="off" 
               spellcheck="false">

        ${query ? `
          <button type="button" class="btn-clear-search" id="btn-clear-map-search" title="Clear search query">
            &times;
          </button>
        ` : ''}
      </div>

      ${isOpen && results.length > 0 ? `
        <div class="map-search-dropdown" id="map-search-dropdown">
          ${results.map((item, idx) => `
            <div class="search-result-item" data-index="${idx}" data-type="${item.type}" data-id="${item.id}">
              <div class="item-badge-type ${item.type}">${item.type.toUpperCase()}</div>
              <div class="item-text-group">
                <span class="item-title text-gold">${escapeHtmlSearch(item.title)}</span>
                <span class="item-sub">${escapeHtmlSearch(item.subtitle)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : (isOpen && query.length >= 2 ? `
        <div class="map-search-dropdown empty">
          <span class="empty-search-text">No features matching "${escapeHtmlSearch(query)}"</span>
        </div>
      ` : '')}
    </div>
  `;
}

function escapeHtmlSearch(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof exports !== 'undefined') {
  exports.renderMapSearch = renderMapSearch;
}
if (typeof window !== 'undefined') {
  window.renderMapSearch = renderMapSearch;
}
