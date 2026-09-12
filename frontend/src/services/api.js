/**
 * LUNA-REG: Planetary Image Registration API Service Layer
 * Smart India Hackathon 2026 — SIH26166
 * 
 * Production-ready API service layer connecting LUNA-REG frontend
 * to external multi-modal lunar registration backend services:
 * - POST /api/register
 * - GET  /api/register/{job_id}/status
 * - GET  /api/register/{job_id}/result
 * - GET  /api/register/history
 * 
 * Honors VITE_API_BASE_URL (default: http://localhost:8000)
 * Strictly forbids fabricated results or fake processing states.
 */

/**
 * Structured API Error for scientific aerospace error handling
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
   * Resolves a backend image or download URL against the current base URL
   * @param {string} url - Absolute or relative URL returned by backend
   * @returns {string} Fully-qualified URL
   */
  resolveAssetUrl(url) {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Map HTTP error codes to user-friendly messages
   */
  mapHttpStatusError(status, serverMessage = null) {
    if (serverMessage && typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
      return serverMessage;
    }

    switch (status) {
      case 400:
        return 'Invalid request. Please check your image selection and try again.';
      case 401:
        return 'Authorization required to access the registration service.';
      case 403:
        return 'Access denied by planetary registration service.';
      case 404:
        return 'The requested registration job was not found.';
      case 413:
        return 'One or more files exceed the allowed size (maximum 50 MB).';
      case 422:
        return 'Unable to process selected lunar imagery. Please verify file integrity.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'Registration could not be started. Please try again later.';
      default:
        return `Server returned HTTP ${status}.`;
    }
  }

  /**
   * Check if the backend server is reachable
   */
  async checkHealth(timeoutMs = 3000) {
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
   * @param {File|Blob} referenceFile - Base image for alignment
   * @param {File|Blob} targetFile - Image to align
   * @param {Object} [settings] - Settings: registration_mode, detector, outlier_filter, geometric_model, subpixel_refinement, clahe_normalization
   * @returns {Promise<{ job_id: string, status: string, message?: string, raw: Object }>}
   */
  async registerImages(referenceFile, targetFile, settings = {}) {
    if (!referenceFile) {
      throw new ApiError('Please select a valid reference lunar image.', 'INVALID_INPUT', 400);
    }
    if (!targetFile) {
      throw new ApiError('Please select a valid target lunar image.', 'INVALID_INPUT', 400);
    }

    // Do NOT manually set Content-Type header. Let browser calculate multipart boundary.
    const formData = new FormData();
    formData.append('reference_image', referenceFile, referenceFile.name || 'reference_image.png');
    formData.append('target_image', targetFile, targetFile.name || 'target_image.png');
    formData.append('registration_mode', settings.registration_mode || settings.mode || 'automatic');

    if (settings.roi_name) formData.append('roi_name', settings.roi_name);
    if (settings.detector) formData.append('detector', settings.detector);
    if (settings.outlier_filter) formData.append('outlier_filter', settings.outlier_filter);
    if (settings.geometric_model) formData.append('geometric_model', settings.geometric_model);
    if (settings.subpixel_refinement !== undefined) formData.append('subpixel_refinement', String(settings.subpixel_refinement));
    if (settings.clahe_normalization !== undefined) formData.append('clahe_normalization', String(settings.clahe_normalization));

    const timeoutMs = settings.timeoutMs || 45000;
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
        throw new ApiError(`Request timed out after ${timeoutMs / 1000}s while uploading lunar imagery.`, 'TIMEOUT', 408);
      }
      throw new ApiError(
        'Registration service is currently unavailable. Please try again.',
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

      const serverMsg = (errBody && errBody.detail) 
        ? errBody.detail 
        : (errBody && errBody.message) 
        ? errBody.message 
        : null;

      const userMessage = this.mapHttpStatusError(response.status, serverMsg);
      throw new ApiError(userMessage, 'HTTP_ERROR', response.status, errBody);
    }

    let resultJson;
    try {
      resultJson = await response.json();
    } catch (parseErr) {
      throw new ApiError('Invalid response received from registration service.', 'INVALID_RESPONSE', response.status);
    }

    // Validate response: must have valid job_id
    if (!resultJson || !resultJson.job_id) {
      throw new ApiError('Invalid response: Backend did not return a valid Job ID.', 'INVALID_RESPONSE', response.status, resultJson);
    }

    return {
      job_id: String(resultJson.job_id),
      status: resultJson.status || 'processing',
      message: resultJson.message || 'Registration started',
      raw: resultJson
    };
  }

  // Alias for backward compatibility
  async submitRegistration(referenceFile, targetFile, settings = {}) {
    return this.registerImages(referenceFile, targetFile, settings);
  }

  /**
   * Poll backend job processing status
   * GET /api/register/{job_id}/status
   * 
   * @param {string} jobId - Unique registration job identifier
   * @param {number} [timeoutMs] - Request timeout (default 8000ms)
   * @returns {Promise<{ job_id: string, status: string, stage?: string, progress?: number, message?: string, raw: Object }>}
   */
  async getRegistrationStatus(jobId, timeoutMs = 8000) {
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
        `Network connection to registration backend temporarily interrupted.`,
        'NETWORK_FAILURE',
        0,
        { originalError: err.message, jobId }
      );
    }

    clearTimeout(timer);

    if (!response.ok) {
      let errBody = null;
      try { errBody = await response.json(); } catch (_) {}
      const serverMsg = (errBody && errBody.detail) ? errBody.detail : (errBody && errBody.message) ? errBody.message : null;
      const userMsg = this.mapHttpStatusError(response.status, serverMsg);
      throw new ApiError(userMsg, 'HTTP_ERROR', response.status, errBody);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new ApiError('Invalid response received from job status endpoint.', 'INVALID_RESPONSE', response.status);
    }

    if (!data || !data.status) {
      throw new ApiError('Malformed job status response: Missing status attribute.', 'INVALID_RESPONSE', response.status, data);
    }

    return {
      job_id: data.job_id || jobId,
      status: String(data.status).toLowerCase(),
      stage: data.stage ? String(data.stage).toLowerCase() : null,
      progress: (typeof data.progress === 'number') ? data.progress : null,
      message: data.message || null,
      created_at: data.created_at || null,
      elapsed_seconds: data.elapsed_seconds || null,
      raw: data
    };
  }

  // Alias for backward compatibility
  async getJobStatus(jobId, timeoutMs = 8000) {
    return this.getRegistrationStatus(jobId, timeoutMs);
  }

  /**
   * Retrieve completed registration result
   * GET /api/register/{job_id}/result
   * 
   * @param {string} jobId - Unique registration job identifier
   * @param {number} [timeoutMs] - Request timeout
   * @returns {Promise<Object>}
   */
  async getRegistrationResult(jobId, timeoutMs = 15000) {
    if (!jobId) {
      throw new ApiError('Job ID is required to retrieve registration results.', 'INVALID_INPUT', 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/register/${encodeURIComponent(jobId)}/result`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiError(`Result query timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT', 408);
      }
      throw new ApiError(
        'Unable to reach backend registration service to fetch results.',
        'SERVER_UNAVAILABLE',
        0,
        { originalError: err.message, jobId }
      );
    }

    clearTimeout(timer);

    if (!response.ok) {
      let errBody = null;
      try { errBody = await response.json(); } catch (_) {}
      const serverMsg = (errBody && errBody.detail) ? errBody.detail : (errBody && errBody.message) ? errBody.message : null;
      const userMsg = this.mapHttpStatusError(response.status, serverMsg);
      throw new ApiError(userMsg, 'HTTP_ERROR', response.status, errBody);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new ApiError('Invalid response received from results endpoint.', 'INVALID_RESPONSE', response.status);
    }

    // Resolve relative asset URLs
    if (data.registered_image_url) {
      data.registered_image_url = this.resolveAssetUrl(data.registered_image_url);
    }
    if (data.reference_image_url) {
      data.reference_image_url = this.resolveAssetUrl(data.reference_image_url);
    }
    if (data.target_image_url) {
      data.target_image_url = this.resolveAssetUrl(data.target_image_url);
    }
    if (data.report_url) {
      data.report_url = this.resolveAssetUrl(data.report_url);
    }

    return data;
  }

  /**
   * Fetch registration history from backend
   * GET /api/register/history or GET /api/jobs
   * 
   * @param {number} [timeoutMs]
   * @returns {Promise<Array<Object>|null>} List of jobs or null if endpoint unavailable
   */
  async getRegistrationHistory(timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const endpoints = ['/api/register/history', '/api/jobs', '/api/register/jobs'];
    for (const ep of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${ep}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        if (response.ok) {
          clearTimeout(timer);
          const data = await response.json();
          let list = null;
          if (Array.isArray(data)) list = data;
          else if (data && Array.isArray(data.jobs)) list = data.jobs;
          else if (data && Array.isArray(data.history)) list = data.history;

          if (list) {
            return list.map(item => {
              if (item.refThumb) item.refThumb = this.resolveAssetUrl(item.refThumb);
              if (item.tgtThumb) item.tgtThumb = this.resolveAssetUrl(item.tgtThumb);
              return item;
            });
          }
        }
      } catch (_) {
        // Continue to next endpoint or timeout
      }
    }

    clearTimeout(timer);
    return null; // Endpoint unavailable on this backend server
  }

  /**
   * Trigger direct download for registered image or report
   * @param {string} url - Direct download URL
   * @param {string} filename - Suggested filename
   */
  downloadRegistrationResult(url, filename = 'registered_lunar_image.tif') {
    if (!url) {
      throw new ApiError('No valid download URL provided by backend.', 'INVALID_INPUT', 400);
    }
    const resolved = this.resolveAssetUrl(url);
    const link = document.createElement('a');
    link.href = resolved;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
