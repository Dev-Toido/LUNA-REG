# LUNA-REG Backend

This directory contains the computational core and server services for the **LUNA-REG Planetary Image Registration Workstation**.

## Contents

- **[`unified_registration.py`](unified_registration.py)**: Standalone, production-grade unified image registration pipeline combining:
  - Fourier-Mellin Transform (FMT) for automatic scale/rotation initialization
  - Gaussian multi-resolution pyramid level matching
  - Dual feature detectors: **SIFT** (CPU/OpenCV) or **SuperPoint + LightGlue** (Deep Learning)
  - Triangular correspondence verification for robust lunar terrain filtering
  - RANSAC projective homography estimation, sub-pixel error metrics, and spatial grid coverage
  - Perspective warping, difference maps, and multi-artifact export
- **[`sample_registration_report.txt`](sample_registration_report.txt)**: Reference benchmark output report from an actual lunar image registration run.
- **[`REGISTRATION_PIPELINE.md`](REGISTRATION_PIPELINE.md)**: In-depth algorithmic, mathematical, and structural documentation of the registration pipeline.
- **`app/`**: FastAPI REST API services, database models, and dataset management endpoints.

## Quick Start (Unified Registration)

```bash
# Install dependencies
pip install opencv-python numpy

# Run the unified script
python backend/unified_registration.py
```
*(Optionally configure `FEATURE_METHOD = "superpoint_lightglue"` inside `unified_registration.py` for learned keypoints & matching).*
