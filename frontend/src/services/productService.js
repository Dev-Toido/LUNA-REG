/**
 * LUNA-REG: Product Service
 * Interfaces with canonical lunar products and files:
 * - GET /api/v1/products (filters: instrument, mission, region_id)
 * - GET /api/v1/products/{product_id}
 * - GET /api/v1/products/{product_id}/files
 * 
 * Product Model:
 * id, region_id (nullable), instrument, mission, product_id, acquisition_time,
 * resolution, product_type, calibration_status, created_at,
 * footprint_json, footprint_lat_min, footprint_lat_max, footprint_lon_min, footprint_lon_max
 */

class ProductService {
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
   * Fetch all canonical products with optional dynamic filters: GET /api/v1/products
   * @param {Object} [filters] - { instrument, mission, region_id }
   * @param {Object} [options] - Additional request options (e.g. signal, timeoutMs)
   * @returns {Promise<Array<Object>>}
   */
  async getProducts(filters = {}, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');

    const queryParams = {};
    if (filters) {
      if (filters.instrument) queryParams.instrument = filters.instrument;
      if (filters.mission) queryParams.mission = filters.mission;
      if (filters.region_id !== undefined && filters.region_id !== null && filters.region_id !== '') {
        queryParams.region_id = filters.region_id;
      }
    }

    return await client.get('/products', queryParams, options);
  }

  /**
   * Fetch a single product by ID: GET /api/v1/products/{product_id}
   * @param {number|string} productId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getProductById(productId, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    if (!productId) throw new Error('Product ID required.');
    return await client.get(`/products/${productId}`, null, options);
  }

  /**
   * Fetch files associated with a product: GET /api/v1/products/{product_id}/files
   * @param {number|string} productId
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async getProductFiles(productId, options = {}) {
    const client = this.getClient();
    if (!client) throw new Error('API client unavailable.');
    if (!productId) throw new Error('Product ID required.');
    return await client.get(`/products/${productId}/files`, null, options);
  }

  // Compatibility aliases
  async listProducts(filters = {}, options = {}) {
    return await this.getProducts(filters, options);
  }

  async getProduct(productId, options = {}) {
    return await this.getProductById(productId, options);
  }
}

const productService = new ProductService();

// Standalone reusable functions
async function getProducts(filters = {}, options = {}) {
  return await productService.getProducts(filters, options);
}

async function getProductById(productId, options = {}) {
  return await productService.getProductById(productId, options);
}

async function getProductFiles(productId, options = {}) {
  return await productService.getProductFiles(productId, options);
}

if (typeof exports !== 'undefined') {
  exports.ProductService = ProductService;
  exports.productService = productService;
  exports.getProducts = getProducts;
  exports.getProductById = getProductById;
  exports.getProductFiles = getProductFiles;
}
if (typeof window !== 'undefined') {
  window.ProductService = ProductService;
  window.productService = productService;
  window.getProducts = getProducts;
  window.getProductById = getProductById;
  window.getProductFiles = getProductFiles;
}
