/**
 * Registration Lifecycle Hook & Poller
 * Handles asynchronous job submission, status polling, and error recovery.
 */

import { apiService, ApiError } from '../services/api.js';

export function createRegistrationJobController({
  onStatusChange,
  onStageChange,
  onComplete,
  onError,
  pollIntervalMs = 1500,
  maxPollAttempts = 120
}) {
  let pollTimer = null;
  let pollAttempts = 0;
  let activeJobId = null;
  let isCancelled = false;

  async function start(referenceFile, targetFile, options = {}) {
    isCancelled = false;
    pollAttempts = 0;

    try {
      if (onStageChange) onStageChange('SUBMITTING_IMAGE_PAIR', 5);

      const submission = await apiService.submitRegistration(referenceFile, targetFile, options);
      activeJobId = submission.job_id;

      if (onStatusChange) onStatusChange('SUBMITTED', { job_id: activeJobId });
      if (onStageChange) onStageChange('JOB_ACCEPTED_QUEUED', 15);

      // Begin status polling
      schedulePoll();
      return activeJobId;
    } catch (err) {
      if (onError) onError(err);
      throw err;
    }
  }

  function schedulePoll() {
    if (isCancelled) return;
    pollTimer = setTimeout(async () => {
      if (isCancelled || !activeJobId) return;
      pollAttempts++;

      if (pollAttempts > maxPollAttempts) {
        const timeoutErr = new ApiError('Registration polling timed out waiting for backend convergence.', 'TIMEOUT', 408);
        if (onError) onError(timeoutErr);
        return;
      }

      try {
        const statusData = await apiService.getJobStatus(activeJobId);

        if (statusData.status === 'processing') {
          const progress = statusData.progress || Math.min(95, 15 + pollAttempts * 4);
          if (onStageChange) onStageChange(statusData.current_stage || 'PROCESSING', progress, statusData.logs);
          schedulePoll();
        } else if (statusData.status === 'completed') {
          if (onStageChange) onStageChange('CONVERGENCE_ACHIEVED', 100, statusData.logs);
          if (onComplete) onComplete(statusData);
        } else if (statusData.status === 'failed') {
          const failErr = new ApiError(
            statusData.error || 'Registration failed to converge.',
            'REGISTRATION_FAILED',
            500,
            statusData
          );
          if (onError) onError(failErr);
        } else {
          schedulePoll();
        }
      } catch (pollErr) {
        if (onError) onError(pollErr);
      }
    }, pollIntervalMs);
  }

  function cancel() {
    isCancelled = true;
    if (pollTimer) clearTimeout(pollTimer);
  }

  return { start, cancel, getActiveJobId: () => activeJobId };
}
