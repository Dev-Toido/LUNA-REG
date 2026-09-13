/**
 * LUNA-REG: Pair Service
 * Canonical Image Pairs & Registration Input Service
 * 
 * Interacts with:
 * - GET /api/v1/pairs (filters: source_instrument, reference_instrument, overlap_status, region_id)
 * - GET /api/v1/pairs/{pair_id}
 * - GET /api/v1/pairs/{pair_id}/registration-input
 * 
 * Pair Model:
 * id, region_id (nullable), source_product_id, reference_product_id,
 * source_instrument, reference_instrument, overlap_status, overlap_area,
 * overlap_ratio, verification_method, evidence_source, verification_notes,
 * overlap_geometry_json, created_at
 */

class PairService {
  constructor(client = null) {
    this.client = client || (typeof window !== 'undefined' ? window.apiClient : null);
  }

  getClient() {
    if (!this.client && typeof window !== 'undefined') {
      this.client = window.apiClient || window.apiService;
    }
    return this.client;
  }

  /**
   * List all canonical lunar image pairs with optional dynamic filters: GET /api/v1/pairs
   * Supported filters: source_instrument, reference_instrument, overlap_status, region_id
   * @param {Object} [filters] - { source_instrument, reference_instrument, overlap_status, region_id }
   * @param {Object} [options] - Request options (e.g. signal, timeoutMs)
   * @returns {Promise<Array<Object>>}
   */
  async getPairs(filters = {}, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');

    const queryParams = {};
    if (filters) {
      if (filters.source_instrument) queryParams.source_instrument = filters.source_instrument;
      if (filters.reference_instrument) queryParams.reference_instrument = filters.reference_instrument;
      if (filters.overlap_status) queryParams.overlap_status = filters.overlap_status;
      if (filters.region_id !== undefined && filters.region_id !== null && filters.region_id !== '') {
        queryParams.region_id = filters.region_id;
      }
    }

    return await client.get('/pairs', queryParams, options);
  }

  /**
   * Fetch single pair by integer ID: GET /api/v1/pairs/{pair_id}
   * @param {number|string} pairId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getPairById(pairId, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    if (!pairId) throw new Error('Pair ID required.');
    return await client.get(`/pairs/${pairId}`, null, options);
  }

  /**
   * Load complete registration input metadata for a pair: GET /api/v1/pairs/{pair_id}/registration-input
   * Returns: { pair, source: { product, files }, reference: { product, files } }
   * @param {number|string} pairId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getRegistrationInput(pairId, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    if (!pairId) throw new Error('Pair ID required.');
    return await client.get(`/pairs/${pairId}/registration-input`, null, options);
  }

  // Backwards compatibility aliases
  async listPairs(filters = {}, options = {}) {
    return await this.getPairs(filters, options);
  }

  async getPair(pairId, options = {}) {
    return await this.getPairById(pairId, options);
  }

  async getPairRegistrationInput(pairId, options = {}) {
    return await this.getRegistrationInput(pairId, options);
  }
}

const pairService = new PairService();

// Standalone reusable functions
async function getPairs(filters = {}, options = {}) {
  return await pairService.getPairs(filters, options);
}

async function getPairById(pairId, options = {}) {
  return await pairService.getPairById(pairId, options);
}

async function getRegistrationInput(pairId, options = {}) {
  return await pairService.getRegistrationInput(pairId, options);
}

if (typeof exports !== 'undefined') {
  exports.PairService = PairService;
  exports.pairService = pairService;
  exports.getPairs = getPairs;
  exports.getPairById = getPairById;
  exports.getRegistrationInput = getRegistrationInput;
}
if (typeof window !== 'undefined') {
  window.PairService = PairService;
  window.pairService = pairService;
  window.getPairs = getPairs;
  window.getPairById = getPairById;
  window.getRegistrationInput = getRegistrationInput;
}
