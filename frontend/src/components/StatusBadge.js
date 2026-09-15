/**
 * LUNA-REG: StatusBadge Component
 * Renders status indicators and pills using Lunar GIS theme tokens (Zero Blue)
 */

function renderStatusBadge(status, type = 'status') {
  if (!status) status = 'UNKNOWN';
  const clean = String(status).toUpperCase();
  
  let badgeClass = 'status-neutral';
  let label = status;

  if (clean === 'VERIFIED' || clean === 'READY' || clean === 'ONLINE' || clean === 'CALIBRATED' || clean === 'OK') {
    badgeClass = 'status-verified';
    label = status;
  } else if (clean === 'UNVERIFIED' || clean === 'RAW' || clean === 'PENDING') {
    badgeClass = 'status-unverified';
    label = status;
  } else if (clean === 'FAILED' || clean === 'OFFLINE' || clean === 'ERROR' || clean === 'INVALID') {
    badgeClass = 'status-failed';
    label = status;
  } else if (clean === 'PROCESSING' || clean === 'CALCULATING') {
    badgeClass = 'status-processing';
    label = status;
  }

  return `<span class="canonical-badge ${badgeClass}" data-status="${clean}">
    <span class="badge-dot"></span>
    <span class="badge-text">${label}</span>
  </span>`;
}

if (typeof exports !== 'undefined') {
  exports.renderStatusBadge = renderStatusBadge;
}
if (typeof window !== 'undefined') {
  window.renderStatusBadge = renderStatusBadge;
}
