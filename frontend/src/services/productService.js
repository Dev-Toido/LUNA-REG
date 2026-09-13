/**
 * LUNA-REG: Product Service
 * Canonical Products & Product Files Service
 * 
 * Interacts with:
 * - GET /api/v1/products (with optional query: instrument, mission, region_id)
 * - GET /api/v1/products/{product_id}
 * - GET /api/v1/products/{product_id}/files
 */

class ProductService {
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
   * List all canonical lunar products with optional filters
   * @param {Object} [filters] - { instrument, mission, region_id }
   * @returns {Promise<Array<Object>>}
   */
  async listProducts(filters = {}) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.get('/products', filters);
  }

  /**
   * Get single product by integer ID
   * @param {number|string} productId
   * @returns {Promise<Object>}
   */
  async getProduct(productId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    if (!productId) throw new Error('Product ID required.');
    return await api.get(`/products/${productId}`);
  }

  /**
   * Get files associated with a product
   * @param {number|string} productId
   * @returns {Promise<Array<Object>>}
   */
  async getProductFiles(productId) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    if (!productId) throw new Error('Product ID required.');
    return await api.get(`/products/${productId}/files`);
  }
}

const productService = new ProductService();

if (typeof exports !== 'undefined') {
  exports.ProductService = ProductService;
  exports.productService = productService;
}
if (typeof window !== 'undefined') {
  window.ProductService = ProductService;
  window.productService = productService;
}
