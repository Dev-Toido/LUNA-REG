/**
 * LUNA-REG: Region Service
 * Canonical Regions Service
 * 
 * Interacts with:
 * - GET /api/v1/regions
 * - GET /api/v1/regions/{region_id}
 */

class RegionService {
  constructor(api = null) {
    this.api = api || (typeof window !== 'undefined' ? window.apiService : null);
  }

  getApi() {
    if (!this.api && typeof window !== 'undefined') {
      this.api = window.apiService;
    }
    return this.api;
  }

  /**
   * List all study regions
   * @returns {Promise<Array<Object>>}
   */
  async listRegions() {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.get('/regions');
  }

  /**
   * Get single region by ID
   * @param {number|string} regionId
   * @returns {Promise<Object>}
   */
  async getRegion(regionId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    if (!regionId) throw new Error('Region ID required.');
    return await api.get(`/regions/${regionId}`);
  }
}

const regionService = new RegionService();

if (typeof exports !== 'undefined') {
  exports.RegionService = RegionService;
  exports.regionService = regionService;
}
if (typeof window !== 'undefined') {
  window.RegionService = RegionService;
  window.regionService = regionService;
}
