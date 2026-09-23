# Repository Refactor Log: LUNA-REG

This document serves as an audit trail of the restructuring applied to the LUNA-REG repository.

## Pre-Refactor State
The repository was organized by task/demo rather than by architectural component. This led to:
- High duplication of core algorithms (e.g., SIFT feature extraction, RANSAC matching, reprojection error functions existed in almost every `.py` file).
- Mixed responsibilities: A single script handled preprocessing, feature detection, matching, metric calculation, and GUI interactions.
- Hard to discover functionality. `LoFTR`, `RIFT2`, `ECC`, `LightGlue`, `FMT`, `Mutual Matching`, `Triangular Verification` were scattered across `Demo 1`, `Texture 1`, `MAGSAC++ based code`, `Akshat code LoFTR`, etc.

## Actions Taken

### 1. Algorithm Extraction
Every algorithm was systematically identified, extracted into standalone python modules, and generalized (removed hardcoded path logic, GUI dialogs, and specific artifact outputs):

- **Feature Extractors**: 
  - `algorithms/feature_extraction/sift/sift.py`
  - `algorithms/feature_extraction/superpoint/superpoint.py`
  - `algorithms/feature_extraction/orb/orb.py`
  - `algorithms/feature_extraction/rift2/rift2.py`
- **Matchers**:
  - `algorithms/matching/bf/bf_matching.py` (Brute force for SIFT/ORB)
  - `algorithms/matching/lightglue/lightglue_matching.py`
  - `algorithms/matching/ecc/ecc_matching.py`
  - `algorithms/matching/optical_flow/optical_flow.py`
  - `algorithms/matching/phase_correlation/phase_correlation.py`
- **Correspondence & Filtering**:
  - `algorithms/correspondence/mutual_matching.py`
  - `algorithms/correspondence/spatial_filtering.py` (Triangular correspondence geometry)
- **Outlier Removal**:
  - `algorithms/outlier_removal/ransac.py`
  - `algorithms/outlier_removal/magsac.py`
- **Preprocessing**:
  - `algorithms/preprocessing/intensity/intensity.py`
  - `algorithms/preprocessing/fmt.py`
  - `algorithms/preprocessing/pyramid.py`
- **Quality Metrics**:
  - `algorithms/quality/reprojection_error.py`
  - `algorithms/quality/spatial_coverage.py`

### 2. Creation of Registry
Created `algorithms/__init__.py` to provide a single import surface for the entire repository. This enforces the facade pattern, allowing scripts to import `detect_sift`, `run_ransac`, etc., without caring about the underlying directory layout.

### 3. Refactoring Active Pipelines
The two primary pipelines, which represent the current state-of-the-art for the project, were relocated and refactored:
- `Akshat new code (good)/new.py` -> `experiments/current_experiments/sift_ransac_pipeline.py`
- `Akshat + superpoint+ lightglue/superpoint.py` -> `experiments/current_experiments/superpoint_lightglue_pipeline.py`

Both scripts were rewritten to import all logic from the `algorithms` library, reducing their complexity and ensuring they use the canonical implementations.

### 4. Legacy Quarantine
All remaining unrefactored scripts, past experiments, demo outputs, and test images were moved into `experiments/legacy_reference/`.
- `Demo 1` to `Demo 4`
- `Texture 1`
- `ECC based code`, `FMT SCALE INVARIANT`, `MAGSAC++ based code`
- `Make synthetic image by code`, `SIH LUNAR DEMO (GPT)`
- Original `Akshat code...` folders.

This preserved exactly the state of these scripts for reference, but removed them from the primary workspace.

## Outcome
The repository is now structurally ready for scalable research. New algorithm variants can be added easily, and experimental scripts simply compose functions from the `algorithms/` library rather than rewriting them.
