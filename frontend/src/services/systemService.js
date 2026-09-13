/**
 * LUNA-REG: System Service
 * Backend Health & API Information
 * 
 * Interacts with root FastAPI endpoints:
 * - GET /health
 * - GET /api/info
 */

class SystemService {
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
   * Check system health: GET /health
   * @param {Object} [options]
   * @returns {Promise<{ status: string, online: boolean }>}
   */
  async getHealth(options = {}) {
    const client = this.getClient();
    if (!client) {
      return { status: 'Backend unavailable', online: false };
    }
    try {
      const data = await client.getRoot('/health', null, Object.assign({ timeoutMs: 3000 }, options));
      const statusText = (data && data.status === 'ok') ? 'Connected' : (data && data.status) || 'Connected';
      return { status: statusText, online: true, raw: data };
    } catch (err) {
      return { status: 'Backend unavailable', online: false, error: err.message };
    }
  }

  /**
   * Compatibility alias for getHealth()
   */
  async checkHealth(timeoutMs = 3000) {
    return await this.getHealth({ timeoutMs });
  }

  /**
   * Get API and environment info: GET /api/info
   * Returns: { name, version, api_version, environment }
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getApiInfo(options = {}) {
    const client = this.getClient();
    if (!client) {
      throw new Error('API client unavailable.');
    }
    try {
      const data = await client.getRoot('/api/info', null, Object.assign({ timeoutMs: 3000 }, options));
      return {
        name: data.name || 'LUNA-REG',
        version: data.version || '0.1.0',
        api_version: data.api_version || 'v1',
        environment: data.environment || 'development'
      };
    } catch (err) {
      return {
        name: 'LUNA-REG',
        version: 'Unavailable',
        api_version: 'Unavailable',
        environment: 'Unavailable',
        error: err.message
      };
    }
  }
}

const systemService = new SystemService();

// Reusable standalone function exports
async function getHealth(options = {}) {
  return await systemService.getHealth(options);
}

async function getApiInfo(options = {}) {
  return await systemService.getApiInfo(options);
}

if (typeof exports !== 'undefined') {
  exports.SystemService = SystemService;
  exports.systemService = systemService;
  exports.getHealth = getHealth;
  exports.getApiInfo = getApiInfo;
}
if (typeof window !== 'undefined') {
  window.SystemService = SystemService;
  window.systemService = systemService;
  window.getHealth = getHealth;
  window.getApiInfo = getApiInfo;
}
