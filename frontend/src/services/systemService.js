/**
 * LUNA-REG: System Service
 * Root Backend Health & API Diagnostics
 * 
 * Interacts with non-versioned root endpoints on VITE_BACKEND_ROOT:
 * - GET /health
 * - GET /api/info
 * - GET /
 */

class SystemService {
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
   * Check backend health status
   * @param {number} [timeoutMs]
   * @returns {Promise<{ status: string, online: boolean }>}
   */
  async checkHealth(timeoutMs = 3000) {
    const api = this.getApi();
    if (!api) return { status: 'error', online: false };
    try {
      const data = await api.getRoot('/health', null, { timeoutMs });
      return { status: (data && data.status) || 'ok', online: true, data };
    } catch (err) {
      return { status: 'offline', online: false, error: err.message };
    }
  }

  /**
   * Get API information (version, environment)
   * @param {number} [timeoutMs]
   * @returns {Promise<Object>}
   */
  async getApiInfo(timeoutMs = 3000) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.getRoot('/api/info', null, { timeoutMs });
  }

  /**
   * Get root project information
   * @param {number} [timeoutMs]
   * @returns {Promise<Object>}
   */
  async getRoot(timeoutMs = 3000) {
    const api = this.getApi();
    if (!api) throw new Error('API service unavailable.');
    return await api.getRoot('/', null, { timeoutMs });
  }
}

const systemService = new SystemService();

if (typeof exports !== 'undefined') {
  exports.SystemService = SystemService;
  exports.systemService = systemService;
}
if (typeof window !== 'undefined') {
  window.SystemService = SystemService;
  window.systemService = systemService;
}
