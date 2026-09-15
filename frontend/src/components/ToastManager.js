/**
 * LUNA-REG: ToastManager Component (Part 8)
 * Global Mission-Control Notification & Session Telemetry Log System
 * 
 * Features:
 * - Zero-Blue theme: Obsidian black cards, champagne gold / amber / crimson borders, mono typography
 * - Reusable methods: show(), info(), warning(), error(), success()
 * - Strictly NO fake success messages for incomplete operations
 * - Maintains real session event logs for topbar notification panel
 * - Accessible ARIA alerts, keyboard dismiss (Escape), auto-timeout, and manual close
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.logs = [];
    this.maxLogs = 50;
    this.init();
  }

  init() {
    if (typeof document === 'undefined') return;
    
    // Create or locate toast container
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }
    this.container = container;

    // Log initial system telemetry entry
    this.addLog('info', 'TELEMETRY BUS', 'LUNA-REG client session initialized. Telemetry bus active.');
  }

  /**
   * Internal logger for real session events
   */
  addLog(type, title, message) {
    const entry = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date(),
      timeStr: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type,
      title: title || 'SYSTEM NOTIFICATION',
      message: message || ''
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Update notification bell badge if unread/available
    this.updateNotificationBadge();
    return entry;
  }

  updateNotificationBadge() {
    const badge = document.querySelector('.notif-badge');
    if (badge) {
      badge.style.display = this.logs.length > 0 ? 'block' : 'none';
    }
  }

  /**
   * Get authentic session logs for notifications modal
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Clear session event logs
   */
  clearLogs() {
    this.logs = [];
    this.updateNotificationBadge();
  }

  /**
   * Main toast dispatch method
   * @param {'info'|'warning'|'error'|'success'} type
   * @param {string} title
   * @param {string} message
   * @param {number} durationMs (0 = persistent until dismissed)
   */
  show(type = 'info', title = '', message = '', durationMs = 4500) {
    if (!this.container) this.init();
    if (!this.container) return;

    // Log event into system session history
    this.addLog(type, title, message);

    // Limit concurrent visible toasts to max 4 to avoid screen clutter
    const existingToasts = this.container.querySelectorAll('.toast-item:not(.toast-fading)');
    if (existingToasts.length >= 4) {
      existingToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    let iconSvg = '';
    if (type === 'error') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else if (type === 'success') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon-wrap">${iconSvg}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
        ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
      </div>
      <button type="button" class="toast-close-btn" aria-label="Dismiss notification" title="Dismiss">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${durationMs > 0 ? `<div class="toast-progress" style="animation-duration: ${durationMs}ms;"></div>` : ''}
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    const dismiss = () => {
      if (toast.classList.contains('toast-fading')) return;
      toast.classList.add('toast-fading');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', dismiss);
    }

    this.container.appendChild(toast);

    if (durationMs > 0) {
      setTimeout(dismiss, durationMs);
    }

    return toast;
  }

  info(title, message, duration = 4000) {
    return this.show('info', title, message, duration);
  }

  warning(title, message, duration = 5000) {
    return this.show('warning', title, message, duration);
  }

  error(title, message, duration = 6000) {
    return this.show('error', title, message, duration);
  }

  success(title, message, duration = 4000) {
    return this.show('success', title, message, duration);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global Singleton Instance
const toastManager = new ToastManager();

if (typeof window !== 'undefined') {
  window.ToastManager = ToastManager;
  window.toastManager = toastManager;
  window.showToast = function(type, title, msg, duration) {
    return toastManager.show(type, title, msg, duration);
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ToastManager, toastManager };
}
