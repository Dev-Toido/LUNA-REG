/**
 * LUNA-REG: Planetary Image Registration API Service Layer
 * Smart India Hackathon 2026 — SIH26166
 * 
 * Handles real backend registration workflows via multipart/form-data:
 * - POST /api/register
 * - GET  /api/register/{job_id}/status
 * 
 * Honors VITE_API_BASE_URL and strictly forbids fabricated API data.
 * Compatible with Vite, ESM, CommonJS, and Browser globals.
 */

/**
 * Structured API Error for scientific error handling
 */
class ApiError extends Error {
  constructor(message, type = 'API_ERROR', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type; // 'NETWORK_FAILURE' | 'SERVER_UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'REGISTRATION_FAILED' | 'HTTP_ERROR'
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Registration API Service Client
 */
class RegistrationApiService {
  constructor() {
    this.baseUrl = this.resolveBaseUrl();
  }

  /**
   * Resolves VITE_API_BASE_URL from environment, localStorage, or runtime globals
   */
  resolveBaseUrl() {
    // 1. Runtime localStorage override (persisted operator setting)
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('LUNA_REG_VITE_API_BASE_URL');
        if (stored) return this.sanitizeUrl(stored);
      }
    } catch (_) {}

    // 2. Runtime window override
    if (typeof window !== 'undefined' && window.VITE_API_BASE_URL) {
      return this.sanitizeUrl(window.VITE_API_BASE_URL);
    }

    // 3. Vite build-time environment variable
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
        return this.sanitizeUrl(import.meta.env.VITE_API_BASE_URL);
      }
    } catch (_) {
      // Ignored if not in Vite runtime
    }

    // 4. Default fallback registration backend port
    return 'http://localhost:8000';
  }

  sanitizeUrl(url) {
    return url ? url.replace(/\/+$/, '') : 'http://localhost:8000';
  }

  getBaseUrl() {
    return this.baseUrl;
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

  /**
   * Check if the backend server is reachable
   */
  async checkHealth(timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const endpoints = ['/health', '/api/health', '/api/register/health', '/'];

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${this.baseUrl}${ep}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { online: true, status: res.status, data, endpoint: ep };
        }
      } catch (err) {
        // Try next endpoint or fall through
      }
    }

    clearTimeout(timer);
    return { online: false, error: 'Server unreachable at ' + this.baseUrl };
  }

  /**
   * Submit image pair to backend registration pipeline
   * POST /api/register
   * Content-Type: multipart/form-data
   * 
   * @param {File|Blob} referenceImage - Base image for alignment
   * @param {File|Blob} targetImage - Image to align
   * @param {Object} [options] - Optional algorithmic parameters
   * @returns {Promise<{ job_id: string, status: string, raw: Object }>}
   */
  async submitRegistration(referenceImage, targetImage, options = {}) {
    if (!referenceImage) {
      throw new ApiError('Reference image is required for registration.', 'INVALID_INPUT', 400);
    }
    if (!targetImage) {
      throw new ApiError('Target image is required for registration.', 'INVALID_INPUT', 400);
    }

    const formData = new FormData();
    formData.append('reference_image', referenceImage, referenceImage.name || 'reference_image.png');
    formData.append('target_image', targetImage, targetImage.name || 'target_image.png');

    if (options.roi_name) formData.append('roi_name', options.roi_name);
    if (options.algorithm) formData.append('algorithm', options.algorithm);
    if (options.subpixel !== undefined) formData.append('subpixel', String(options.subpixel));

    const timeoutMs = options.timeoutMs || 45000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/register`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${timeoutMs / 1000}s while uploading lunar images.`, 'TIMEOUT', 408);
      }
      throw new ApiError(
        `Backend server unavailable at ${this.baseUrl}. Connection refused or network offline. Please verify the backend server is running and VITE_API_BASE_URL is reachable.`,
        'SERVER_UNAVAILABLE',
        0,
        { originalError: err.message, targetUrl: `${this.baseUrl}/api/register` }
      );
    }

    clearTimeout(timer);

    if (!response.ok) {
      let errBody = null;
      try {
        errBody = await response.json();
      } catch (_) {
        errBody = await response.text().catch(() => null);
      }

      const errMsg = (errBody && errBody.detail) 
        ? errBody.detail 
        : (errBody && errBody.message) 
        ? errBody.message 
        : `Server returned HTTP ${response.status} ${response.statusText}`;

      throw new ApiError(errMsg, 'HTTP_ERROR', response.status, errBody);
    }

    let resultJson;
    try {
      resultJson = await response.json();
    } catch (parseErr) {
      throw new ApiError('Failed to parse JSON response from /api/register.', 'INVALID_RESPONSE', response.status);
    }

    if (!resultJson || !resultJson.job_id) {
      throw new ApiError('Invalid response: Backend did not return a job_id.', 'INVALID_RESPONSE', response.status, resultJson);
    }

    return {
      job_id: resultJson.job_id,
      status: resultJson.status || 'processing',
      raw: resultJson
    };
  }

  /**
   * Poll backend job processing status
   * GET /api/register/{job_id}/status
   * 
   * @param {string} jobId - Unique registration job identifier
   * @param {number} [timeoutMs] - Request timeout
   * @returns {Promise<Object>} Status object
   */
  async getJobStatus(jobId, timeoutMs = 10000) {
    if (!jobId) {
      throw new ApiError('Job ID is required to poll registration status.', 'INVALID_INPUT', 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/register/${encodeURIComponent(jobId)}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiError(`Polling status timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT', 408);
      }
      throw new ApiError(
        `Network failure while polling job ${jobId} at ${this.baseUrl}.`,
        'NETWORK_FAILURE',
        0,
        { originalError: err.message, jobId }
      );
    }

    clearTimeout(timer);

    if (!response.ok) {
      let errBody = null;
      try { errBody = await response.json(); } catch (_) {}
      const errMsg = (errBody && errBody.detail) ? errBody.detail : `HTTP ${response.status} polling status`;
      throw new ApiError(errMsg, 'HTTP_ERROR', response.status, errBody);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new ApiError('Invalid JSON received from job status endpoint.', 'INVALID_RESPONSE', response.status);
    }

    if (!data || !data.status) {
      throw new ApiError('Malformed job status response (missing status attribute).', 'INVALID_RESPONSE', response.status, data);
    }

    return data;
  }
}

// Instantiate default singleton
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
