/**
 * LUNA-REG: Centralized API Client
 * Planetary Image Registration API Client
 * Smart India Hackathon 2026 — SIH26166
 * 
 * Supports:
 * - import.meta.env.VITE_API_BASE_URL (with window/localStorage/defaults fallback)
 * - JSON request/response handling
 * - Clean query parameter serialization
 * - AbortController request cancellation & timeouts
 * - Normalized, user-friendly error objects (no raw stack traces exposed to user)
 */

class ApiError extends Error {
  constructor(message, type = 'API_ERROR', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type; // 'NETWORK_FAILURE' | 'SERVER_UNAVAILABLE' | 'TIMEOUT' | 'HTTP_ERROR' | 'ABORTED'
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * User-facing safe summary without raw stack traces
   */
  getUserMessage() {
    return this.message || 'An unexpected API error occurred.';
  }
}

class ApiClient {
  constructor() {
    this.baseUrl = this.resolveBaseUrl();
    this.backendRoot = this.resolveBackendRoot();
    this.inFlightRequests = new Map();
  }

  resolveBaseUrl() {
    // 1. Dynamic import.meta.env check (safe in both ES module and classic script)
    try {
      const meta = new Function("try { return import.meta; } catch(e) { return null; }")();
      if (meta && meta.env && meta.env.VITE_API_BASE_URL) {
        return this.sanitizeUrl(meta.env.VITE_API_BASE_URL);
      }
    } catch (_) {}

    // 2. Local storage override (for testing/runtime configuration)
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('LUNA_REG_VITE_API_BASE_URL');
        if (stored) return this.sanitizeUrl(stored);
      }
    } catch (_) {}

    // 3. Window global configuration
    if (typeof window !== 'undefined') {
      if (window.__ENV__ && window.__ENV__.VITE_API_BASE_URL) {
        return this.sanitizeUrl(window.__ENV__.VITE_API_BASE_URL);
      }
      if (window.VITE_API_BASE_URL) {
        return this.sanitizeUrl(window.VITE_API_BASE_URL);
      }
    }

    // 4. Default canonical base URL
    return 'http://127.0.0.1:8000/api/v1';
  }

  resolveBackendRoot() {
    try {
      const meta = new Function("try { return import.meta; } catch(e) { return null; }")();
      if (meta && meta.env && meta.env.VITE_BACKEND_ROOT) {
        return this.sanitizeUrl(meta.env.VITE_BACKEND_ROOT);
      }
    } catch (_) {}

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('LUNA_REG_VITE_BACKEND_ROOT');
        if (stored) return this.sanitizeUrl(stored);
      }
    } catch (_) {}

    if (typeof window !== 'undefined') {
      if (window.__ENV__ && window.__ENV__.VITE_BACKEND_ROOT) {
        return this.sanitizeUrl(window.__ENV__.VITE_BACKEND_ROOT);
      }
      if (window.VITE_BACKEND_ROOT) {
        return this.sanitizeUrl(window.VITE_BACKEND_ROOT);
      }
    }

    return 'http://127.0.0.1:8000';
  }

  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getBackendRoot() {
    return this.backendRoot;
  }

  setBaseUrl(url) {
    this.baseUrl = this.sanitizeUrl(url) || 'http://127.0.0.1:8000/api/v1';
    if (typeof window !== 'undefined') {
      window.VITE_API_BASE_URL = this.baseUrl;
      try {
        localStorage.setItem('LUNA_REG_VITE_API_BASE_URL', this.baseUrl);
      } catch (_) {}
    }
  }

  setBackendRoot(url) {
    this.backendRoot = this.sanitizeUrl(url) || 'http://127.0.0.1:8000';
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
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${this.backendRoot}${cleanPath}`;
  }

  /**
   * Normalizes HTTP errors into meaningful, user-friendly messages
   */
  mapHttpStatusError(status, serverMessage = null) {
    if (serverMessage && typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
      return serverMessage.trim();
    }

    switch (status) {
      case 400:
        return 'Invalid request parameters. Please verify input fields.';
      case 401:
        return 'Authorization required to access planetary data.';
      case 403:
        return 'Access denied by lunar data service.';
      case 404:
        return 'The requested resource was not found on the backend.';
      case 409:
        return 'Conflict: Resource already exists or inputs are incomplete.';
      case 413:
        return 'File size exceeds maximum allowed limit (50 MB).';
      case 422:
        return 'Validation error: Input data does not match the expected scientific format.';
      case 500:
        return 'Internal server error occurred in planetary processing engine.';
      case 502:
      case 503:
      case 504:
        return 'Backend service unavailable. Please ensure the FastAPI server is running.';
      default:
        return `Backend returned HTTP status ${status}.`;
    }
  }

  /**
   * Core request dispatcher with timeout, AbortController, and normalized error handling
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      params = null,
      body = null,
      headers = {},
      timeoutMs = 12000,
      isRoot = false,
      signal: externalSignal = null
    } = options;

    const base = isRoot ? this.backendRoot : this.baseUrl;
    let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // Dynamic Query Parameter Serialization
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

    const fullUrl = `${base}${path}`;

    // Deduplicate in-flight concurrent GET requests
    if (method === 'GET' && !externalSignal && this.inFlightRequests && this.inFlightRequests.has(fullUrl)) {
      return this.inFlightRequests.get(fullUrl);
    }

    const execRequest = async () => {
      // AbortController handling (integrating external signal + internal timeout)
      const internalController = new AbortController();
      let isTimedOut = false;
      const timer = setTimeout(() => {
        isTimedOut = true;
        internalController.abort();
      }, timeoutMs);

      if (externalSignal) {
        if (externalSignal.aborted) {
          clearTimeout(timer);
          throw new ApiError('Request was cancelled.', 'ABORTED', 0);
        }
        externalSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          internalController.abort();
        });
      }

      const requestHeaders = Object.assign({
        'Accept': 'application/json'
      }, headers);

      const fetchConfig = {
        method,
        headers: requestHeaders,
        signal: internalController.signal
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
          const mapped = this.mapHttpStatusError(
            response.status, 
            typeof serverMsg === 'string' ? serverMsg : (serverMsg ? JSON.stringify(serverMsg) : null)
          );
          throw new ApiError(mapped, 'HTTP_ERROR', response.status, errorData);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await response.json();
        }
        return await response.text();

      } catch (err) {
        clearTimeout(timer);

        if (err instanceof ApiError) {
          throw err;
        }

        if (err.name === 'AbortError') {
          if (isTimedOut) {
            throw new ApiError(`Request timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT', 408, { url: fullUrl });
          }
          throw new ApiError('Request was aborted.', 'ABORTED', 0, { url: fullUrl });
        }

        // Network failures (e.g. server offline, CORS blocked, DNS failure)
        throw new ApiError(
          `Backend service unavailable at ${base}. Please verify that the FastAPI backend server is running.`,
          'SERVER_UNAVAILABLE',
          0,
          { url: fullUrl, originalMessage: err.message }
        );
      }
    };

    const reqPromise = execRequest();

    if (method === 'GET' && !externalSignal && this.inFlightRequests) {
      this.inFlightRequests.set(fullUrl, reqPromise);
      reqPromise.finally(() => {
        this.inFlightRequests.delete(fullUrl);
      });
    }

    return reqPromise;
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

  createAbortController() {
    return new AbortController();
  }

  /**
   * Submit image files for multi-modal registration (POST /api/register)
   */
  async submitRegistration(formData, options = {}) {
    return this.post('/register', formData, Object.assign({ timeoutMs: 45000 }, options));
  }

  /**
   * Poll active registration job status (GET /api/register/{job_id}/status)
   */
  async getRegistrationStatus(jobId, options = {}) {
    return this.get(`/register/${encodeURIComponent(jobId)}/status`, null, Object.assign({ timeoutMs: 8000 }, options));
  }

  /**
   * Fetch completed registration result (GET /api/register/{job_id}/result)
   */
  async getRegistrationResult(jobId, options = {}) {
    return this.get(`/register/${encodeURIComponent(jobId)}/result`, null, Object.assign({ timeoutMs: 15000 }, options));
  }

  /**
   * Fetch registration job history (GET /api/register/history)
   */
  async getRegistrationHistory(options = {}) {
    return this.get('/register/history', null, Object.assign({ timeoutMs: 8000 }, options));
  }

  /**
   * Resolve an asset URL (whether relative or absolute) against backend host
   */
  resolveAssetUrl(assetPath) {
    if (!assetPath) return '';
    if (assetPath.startsWith('http://') || assetPath.startsWith('https://') || assetPath.startsWith('data:') || assetPath.startsWith('blob:')) {
      return assetPath;
    }
    // If it's a relative frontend asset path (e.g. assets/...) preserve it relative to the document
    if (assetPath.startsWith('assets/') || assetPath.startsWith('./assets/')) {
      return assetPath;
    }
    const clean = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${this.backendRoot}${clean}`;
  }

  /**
   * Trigger download of a result raster or report file
   */
  downloadRegistrationResult(url, filename = 'download') {
    if (!url) return;
    const fullUrl = this.resolveAssetUrl(url);
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Global Singleton instance
const apiClient = new ApiClient();
const apiService = apiClient;

if (typeof exports !== 'undefined') {
  exports.ApiError = ApiError;
  exports.ApiClient = ApiClient;
  exports.apiClient = apiClient;
  exports.apiService = apiService;
}
if (typeof window !== 'undefined') {
  window.ApiError = ApiError;
  window.ApiClient = ApiClient;
  window.apiClient = apiClient;
  window.apiService = apiService;
  window.LUNAR_API = apiClient;
}
