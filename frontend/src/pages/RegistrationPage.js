/**
 * New Image Registration Page Controller
 */
export class RegistrationPageController {
  constructor(apiService) {
    this.api = apiService;
    this.currentJobId = null;
    this.jobStatus = 'idle'; // 'idle' | 'uploading' | 'processing' | 'completed' | 'failed'
  }

  setJobId(id) {
    this.currentJobId = id;
  }

  getJobId() {
    return this.currentJobId;
  }
}
