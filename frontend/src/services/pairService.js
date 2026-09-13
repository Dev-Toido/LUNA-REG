/**
 * LUNA-REG: Pair Service
 * Canonical Image Pairs & Registration Input Service
 * 
 * Interacts with:
 * - GET  /api/v1/pairs (with optional query: source_instrument, reference_instrument, overlap_status, region_id)
 * - GET  /api/v1/pairs/{pair_id}
 * - GET  /api/v1/pairs/{pair_id}/registration-input
 * - POST /api/v1/pairs/{pair_id}/registration-jobs (when backend supports it)
 * - GET  /api/v1/registration-jobs/{job_id}
 */

class PairService {
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
   * List all canonical lunar image pairs with optional filters
   * @param {Object} [filters] - { source_instrument, reference_instrument, overlap_status, region_id }
   * @returns {Promise<Array<Object>>}
   */
  async listPairs(filters = {}) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.get('/pairs', filters);
  }

  /**
   * Get single pair by integer ID
   * @param {number|string} pairId
   * @returns {Promise<Object>}
   */
  async getPair(pairId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    if (!pairId) throw new Error('Pair ID required.');
    return await api.get(`/pairs/${pairId}`);
  }

  /**
   * Load complete registration input metadata for a pair
   * Returns pair metadata, source product with files, and reference product with files
   * @param {number|string} pairId
   * @returns {Promise<Object>}
   */
  async getPairRegistrationInput(pairId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    if (!pairId) throw new Error('Pair ID required.');
    return await api.get(`/pairs/${pairId}/registration-input`);
  }

  /**
   * Prepare a canonical pair for future registration pipeline
   * Loads and validates inputs without fabricating synthetic processing
   * @param {number|string} pairId
   * @returns {Promise<Object>} Formatted registration preparation package
   */
  async preparePairForRegistration(pairId) {
    const regInput = await this.getPairRegistrationInput(pairId);
    if (!regInput) throw new Error('Failed to load registration input from backend.');

    const pair = regInput.pair || {};
    const source = regInput.source || {};
    const reference = regInput.reference || {};

    return {
      pairId: pair.id,
      pair,
      sourceProduct: source.product || null,
      sourceFiles: source.files || [],
      referenceProduct: reference.product || null,
      referenceFiles: reference.files || [],
      overlapStatus: pair.overlap_status || 'UNKNOWN',
      overlapArea: pair.overlap_area !== undefined ? pair.overlap_area : null,
      overlapRatio: pair.overlap_ratio !== undefined ? pair.overlap_ratio : null,
      preparedAt: new Date().toISOString(),
      readyForPipeline: true
    };
  }

  /**
   * Submit registration job to backend (if supported)
   * @param {number|string} pairId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async submitRegistrationJob(pairId, options = {}) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.post(`/pairs/${pairId}/registration-jobs`, {
      options: options || {}
    });
  }

  /**
   * Get registration job status
   * @param {number|string} jobId
   * @returns {Promise<Object>}
   */
  async getRegistrationJob(jobId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.get(`/registration-jobs/${jobId}`);
  }
}

const pairService = new PairService();

if (typeof exports !== 'undefined') {
  exports.PairService = PairService;
  exports.pairService = pairService;
}
if (typeof window !== 'undefined') {
  window.PairService = PairService;
  window.pairService = pairService;
}
