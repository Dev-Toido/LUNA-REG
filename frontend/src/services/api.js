/**
 * LUNA-REG: Planetary Image Registration API Service Layer
 * Smart India Hackathon 2026 — SIH26166
 * 
 * Production-ready API service layer connecting LUNA-REG frontend
 * to the real canonical LUNA-REG FastAPI backend services:
 * - Versioned API: http://127.0.0.1:8000/api/v1
 * - Backend Root:  http://127.0.0.1:8000
 * 
 * Endpoints:
 * - GET  /api/v1/regions
 * - GET  /api/v1/regions/{region_id}
 * - GET  /api/v1/products
 * - GET  /api/v1/products/{product_id}
 * - GET  /api/v1/products/{product_id}/files
 * - GET  /api/v1/pairs
 * - GET  /api/v1/pairs/{pair_id}
 * - GET  /api/v1/pairs/{pair_id}/registration-input
 * - POST /api/v1/pairs/{pair_id}/registration-jobs
 * - GET  /api/v1/registration-jobs/{job_id}
 * - GET  /health (Root)
 * - GET  /api/info (Root)
 */

class ApiError extends Error {
  constructor(message, type = 'API_ERROR', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type; // 'NETWORK_FAILURE' | 'SERVER_UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'HTTP_ERROR'
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class RegistrationApiService {
  constructor() {
    this.baseUrl = this.resolveBaseUrl();
    this.backendRoot = this.resolveBackendRoot();
  }

  resolveBaseUrl() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('LUNA_REG_VITE_API_BASE_URL');
        if (stored) return this.sanitizeUrl(stored);
      }
    } catch (_) {}

    if (typeof window !== 'undefined' && window.VITE_API_BASE_URL) {
      return this.sanitizeUrl(window.VITE_API_BASE_URL);
    }

    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
        return this.sanitizeUrl(import.meta.env.VITE_API_BASE_URL);
      }
    } catch (_) {}

    return 'http://127.0.0.1:8000/api/v1';
  }

  resolveBackendRoot() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('LUNA_REG_VITE_BACKEND_ROOT');
        if (stored) return this.sanitizeUrl(stored);
      }
    } catch (_) {}

    if (typeof window !== 'undefined' && window.VITE_BACKEND_ROOT) {
      return this.sanitizeUrl(window.VITE_BACKEND_ROOT);
    }

    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_ROOT) {
        return this.sanitizeUrl(import.meta.env.VITE_BACKEND_ROOT);
      }
    } catch (_) {}

    return 'http://127.0.0.1:8000';
  }

  sanitizeUrl(url) {
    return url ? url.replace(/\/+$/, '') : 'http://127.0.0.1:8000/api/v1';
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getBackendRoot() {
    return this.backendRoot;
  }

  setBaseUrl(url) {
    this.baseUrl = this.sanitizeUrl(url);
    if (typeof window !== 'undefined') {
      window.VITE_API_BASE_URL = this.baseUrl;
      try {
        localStorage.setItem('LUNA_REG_VITE_API_BASE_URL', this.baseUrl);
      } catch (_) {}
    }
  }

  setBackendRoot(url) {
    this.backendRoot = this.sanitizeUrl(url);
    if (typeof window !== 'undefined') {
      window.VITE_BACKEND_ROOT = this.backendRoot;
      try {
        localStorage.setItem('LUNA_REG_VITE_BACKEND_ROOT', this.backendRoot);
      } catch (_) {}
    }
  }

  resolveAssetUrl(url) {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const cleanPath = url.startsWith('/') ? url : /;
    return ${this.backendRoot};
  }

  mapHttpStatusError(status, serverMessage = null) {
    if (serverMessage && typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
      return serverMessage;
    }

    switch (status) {
      case 400:
        return 'Invalid request parameters.';
      case 401:
        return 'Authorization required to access planetary data.';
      case 403:
        return 'Access denied by lunar data service.';
      case 404:
        return 'The requested resource was not found on the backend.';
      case 409:
        return 'Conflict: Registration inputs or product files are incomplete.';
      case 413:
        return 'File size exceeds allowed limits.';
      case 422:
        return 'Unprocessable entity: payload validation failed on backend.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'Backend service unavailable. Please ensure the server at http://127.0.0.1:8000 is running.';
      default:
        return Backend returned HTTP .;
    }
  }

  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      params = null,
      body = null,
      headers = {},
      timeoutMs = 12000,
      isRoot = false
    } = options;

    const base = isRoot ? this.backendRoot : this.baseUrl;
    let path = endpoint.startsWith('/') ? endpoint : /;

    if (params && typeof params === 'object') {
      const qp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
          qp.append(k, String(v));
        }
      });
      const qs = qp.toString();
      if (qs) {
        path += (path.includes('?') ? '&' : '?') + qs;
      }
    }

    const fullUrl = ${base};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const requestHeaders = Object.assign({
      'Accept': 'application/json'
    }, headers);

    const fetchConfig = {
      method,
      headers: requestHeaders,
      signal: controller.signal
    };

    if (body !== null && body !== undefined) {
      if (body instanceof FormData) {
        fetchConfig.body = body;
      } else {
        requestHeaders['Content-Type'] = 'application/json';
        fetchConfig.body = JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(fullUrl, fetchConfig);
      clearTimeout(timer);

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (_) {}

        const serverMsg = errorData && (errorData.detail || errorData.message || errorData.error);
        const mapped = this.mapHttpStatusError(response.status, typeof serverMsg === 'string' ? serverMsg : JSON.stringify(serverMsg));
        throw new ApiError(mapped, 'HTTP_ERROR', response.status, errorData);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();

    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      if (err.name === 'AbortError') {
        throw new ApiError(Request timed out after s., 'TIMEOUT', 408, { url: fullUrl });
      }
      throw new ApiError(
        Failed to communicate with backend at . Please ensure backend is running.,
        'SERVER_UNAVAILABLE',
        0,
        { originalError: err.message, url: fullUrl }
      );
    }
  }

  get(endpoint, params = null, options = {}) {
    return this.request(endpoint, Object.assign({}, options, { method: 'GET', params }));
  }

  post(endpoint, body = null, options = {}) {
    return this.request(endpoint, Object.assign({}, options, { method: 'POST', body }));
  }

  getRoot(endpoint, params = null, options = {}) {
    return this.request(endpoint, Object.assign({}, options, { method: 'GET', params, isRoot: true }));
  }

  // --- COMPATIBILITY HEALTH & REGISTRATION METHODS ---
  async checkHealth(timeoutMs = 3000) {
    try {
      const data = await this.getRoot('/health', null, { timeoutMs });
      return { online: true, data };
    } catch (_) {
      try {
        const rootData = await this.getRoot('/', null, { timeoutMs });
        return { online: true, data: rootData };
      } catch (err) {
        return { online: false, error: err.message };
      }
    }
  }

  async getApiInfo(timeoutMs = 3000) {
    return await this.getRoot('/api/info', null, { timeoutMs });
  }

  async getRegistrationStatus(jobId, timeoutMs = 8000) {
    return await this.get(/registration-jobs/, null, { timeoutMs });
  }

  async getRegistrationResult(jobId, timeoutMs = 10000) {
    return await this.get(/registration-jobs/, null, { timeoutMs });
  }

  async getRegistrationHistory(timeoutMs = 5000) {
    return null;
  }
}

// Global Singleton
const apiService = new RegistrationApiService();

// Universal export
if (typeof exports !== 'undefined') {
  exports.ApiError = ApiError;
  exports.RegistrationApiService = RegistrationApiService;
  exports.apiService = apiService;
}
if (typeof window !== 'undefined') {
  window.RegistrationApiService = RegistrationApiService;
  window.ApiError = ApiError;
  window.apiService = apiService;
  window.LUNAR_API = apiService;
}
