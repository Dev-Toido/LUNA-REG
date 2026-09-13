/**
 * LUNA-REG: System Service (Part 8 Enhanced)
 * Backend Health, Real-Time Telemetry & Diagnostic Inspector
 * 
 * Interacts with root FastAPI endpoints:
 * - GET /health
 * - GET /api/info
 * 
 * Features:
 * - Real ping latency calculation in milliseconds
 * - Observable status updates (subscribers pattern)
 * - Safe null/fallback handling when backend is unavailable
 * - Periodic polling loop (30s default)
 * - Zero fake status fabrication
 */

class SystemService {
  constructor(client = null) {
    this.client = client || (typeof window !== 'undefined' ? window.apiClient : null);
    this.subscribers = new Set();
    this.pollingTimer = null;
    this.currentStatus = {
      online: false,
      status: 'Checking...',
      latencyMs: null,
      lastChecked: null,
      info: null,
      error: null
    };
  }

  getClient() {
    if (!this.client && typeof window !== 'undefined') {
      this.client = window.apiClient || window.apiService;
    }
    return this.client;
  }

  /**
   * Subscribe a callback to health status changes
   * @param {Function} callback (statusObject) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.subscribers.add(callback);
      // Immediately notify with current known state
      callback(this.currentStatus);
    }
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach(cb => {
      try {
        cb(this.currentStatus);
      } catch (err) {
        console.warn('SystemService subscriber callback error:', err);
      }
    });
  }

  /**
   * Check system health: GET /health with real latency measurement
   * @param {Object} [options]
   * @returns {Promise<{ status: string, online: boolean, latencyMs: number|null, raw: any }>}
   */
  async getHealth(options = {}) {
    const client = this.getClient();
    if (!client) {
      this.updateStatus(false, 'Backend unavailable', null, 'API client unavailable');
      return { status: 'Backend unavailable', online: false, latencyMs: null };
    }

    const startTime = performance.now();
    try {
      const data = await client.getRoot('/health', null, Object.assign({ timeoutMs: 3000 }, options));
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      const statusText = (data && data.status === 'ok') ? 'Connected' : (data && data.status) || 'Connected';
      this.updateStatus(true, statusText, latency, null, data);
      return { status: statusText, online: true, latencyMs: latency, raw: data };
    } catch (err) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      this.updateStatus(false, 'Backend unavailable', latency, err.message);
      return { status: 'Backend unavailable', online: false, latencyMs: latency, error: err.message };
    }
  }

  /**
   * Compatibility alias for getHealth()
   */
  async checkHealth(timeoutMs = 3000) {
    return await this.getHealth({ timeoutMs });
  }

  /**
   * Immediate diagnostic ping that fetches both /health and /api/info
   */
  async ping() {
    const healthResult = await this.getHealth({ timeoutMs: 3000 });
    let infoResult = null;
    if (healthResult.online) {
      try {
        infoResult = await this.getApiInfo({ timeoutMs: 3000 });
      } catch (_) {}
    }
    return {
      online: healthResult.online,
      status: healthResult.status,
      latencyMs: healthResult.latencyMs,
      info: infoResult,
      lastChecked: this.currentStatus.lastChecked,
      error: healthResult.error || null
    };
  }

  /**
   * Internal status state mutator
   */
  updateStatus(online, status, latencyMs, error = null, raw = null) {
    this.currentStatus = {
      online,
      status,
      latencyMs,
      lastChecked: new Date(),
      info: this.currentStatus.info,
      error,
      raw
    };
    this.notifySubscribers();
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
      const info = {
        name: data.name || 'LUNA-REG',
        version: data.version || '0.1.0',
        api_version: data.api_version || 'v1',
        environment: data.environment || 'development'
      };
      this.currentStatus.info = info;
      this.notifySubscribers();
      return info;
    } catch (err) {
      const fallbackInfo = {
        name: 'LUNA-REG',
        version: 'Unavailable',
        api_version: 'Unavailable',
        environment: 'Unavailable',
        error: err.message
      };
      this.currentStatus.info = fallbackInfo;
      return fallbackInfo;
    }
  }

  /**
   * Start background health polling
   * @param {number} intervalMs (default 30000ms)
   */
  startPolling(intervalMs = 30000) {
    this.stopPolling();
    // Initial ping
    this.ping();
    this.pollingTimer = setInterval(() => {
      this.ping();
    }, intervalMs);
  }

  /**
   * Stop background health polling
   */
  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  getStatus() {
    return Object.assign({}, this.currentStatus);
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
