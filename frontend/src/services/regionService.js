/**
 * LUNA-REG: Regions Service
 * Interfaces with canonical study regions in SQLite database:
 * - GET /api/v1/regions
 * - GET /api/v1/regions/{region_id}
 * 
 * Model:
 * id, name, region_type, lat_min, lat_max, lon_min, lon_max, description, created_at
 * 
 * Note: region_id can be NULL for Products and Pairs.
 */

class RegionService {
  constructor(client = null) {
    this.client = client || (typeof window !== 'undefined' ? window.apiClient : null);
    this.cache = new Map();
  }

  getClient() {
    if (!this.client && typeof window !== 'undefined') {
      this.client = window.apiClient || window.apiService;
    }
    return this.client;
  }

  /**
   * Fetch all study regions: GET /api/v1/regions
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async getRegions(options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    const regions = await client.get('/regions', null, options);
    const list = Array.isArray(regions) ? regions : [];
    list.forEach(r => {
      if (r && r.id) this.cache.set(String(r.id), r);
    });
    return list;
  }

  /**
   * Fetch single region by ID: GET /api/v1/regions/{region_id}
   * @param {number|string} regionId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getRegionById(regionId, options = {}) {
    if (regionId === null || regionId === undefined || regionId === '') {
      return null;
    }
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    
    if (this.cache.has(String(regionId))) {
      return this.cache.get(String(regionId));
    }

    const region = await client.get(`/regions/${regionId}`, null, options);
    if (region && region.id) {
      this.cache.set(String(region.id), region);
    }
    return region;
  }

  /**
   * Helper to format region label safely (handles null regions without fake coordinates)
   * @param {Object|number|string|null} regionOrId
   * @returns {string}
   */
  formatRegionName(regionOrId) {
    if (!regionOrId) return 'Not assigned';
    if (typeof regionOrId === 'object') {
      return regionOrId.name || `Region #${regionOrId.id}` || 'Not assigned';
    }
    if (this.cache.has(String(regionOrId))) {
      const cached = this.cache.get(String(regionOrId));
      return cached.name || `Region #${cached.id}`;
    }
    return `Region #${regionOrId}`;
  }

  // Compatibility aliases
  async listRegions(options = {}) {
    return await this.getRegions(options);
  }

  async getRegion(regionId, options = {}) {
    return await this.getRegionById(regionId, options);
  }
}

const regionService = new RegionService();

// Standalone reusable functions
async function getRegions(options = {}) {
  return await regionService.getRegions(options);
}

async function getRegionById(regionId, options = {}) {
  return await regionService.getRegionById(regionId, options);
}

if (typeof exports !== 'undefined') {
  exports.RegionService = RegionService;
  exports.regionService = regionService;
  exports.getRegions = getRegions;
  exports.getRegionById = getRegionById;
}
if (typeof window !== 'undefined') {
  window.RegionService = RegionService;
  window.regionService = regionService;
  window.getRegions = getRegions;
  window.getRegionById = getRegionById;
}
