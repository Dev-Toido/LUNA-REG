# Repository Reorganization Report: LUNA-REG

## Overview
The LUNA-REG repository has been completely restructured to separate reusable algorithm code from experimental scripts, research results, and legacy code. This transformation converts a flat, script-heavy structure into a modular, clean, and extensible library.

## Architectural Changes

### 1. The `algorithms/` Library
A new canonical library structure has been established in `algorithms/`. This folder contains the singular, authoritative implementation of each algorithm used in the repository.

- **`algorithms/feature_extraction/`**: SIFT, SuperPoint, ORB, RIFT2.
- **`algorithms/matching/`**: Brute Force Matching (Lowe's Ratio, Mutual), LightGlue, ECC (Enhanced Correlation Coefficient), Optical Flow (Farneback), Phase Correlation.
- **`algorithms/correspondence/`**: Spatial/Triangular Correspondence Filtering.
- **`algorithms/outlier_removal/`**: RANSAC, MAGSAC.
- **`algorithms/preprocessing/`**: Intensity enhancement (CLAHE, Scharr, Phase Orientation), Fourier-Mellin Transform (FMT), Scale Pyramids.
- **`algorithms/quality/`**: Reprojection Error calculation, Spatial Coverage metrics.

Each of these directories has its own `README.md`. An index file (`algorithms/__init__.py`) exposes all primary functions for easy import across the repository.

### 2. The `experiments/` Directory
Experiment runners and scripts have been moved to dedicated subdirectories within `experiments/` to keep the root directory clean.

- **`experiments/current_experiments/`**: Contains the main active pipelines (`sift_ransac_pipeline.py` and `superpoint_lightglue_pipeline.py`). These scripts have been fully refactored to import from the new `algorithms/` library rather than duplicating their logic.
- **`experiments/legacy_reference/`**: All historical, unrefactored scripts and results have been safely quarantined here. This includes folders like `Demo 1`, `Demo 2`, `Demo 3`, `Demo 4`, `Akshat code LoFTR`, `MAGSAC++ based code`, and various standalone scripts. This ensures no past research or functionality is lost while keeping the working tree tidy.

### 3. The `docs/` Directory
Documentation artifacts, such as the initial `repository_algorithm_inventory.md` (and CSV) and this report, reside here.

## Benefits of the New Structure
- **Extensibility**: Adding a new feature detector or matching algorithm now simply requires dropping a new module into the relevant `algorithms/` subfolder.
- **Maintainability**: Bugs in an algorithm like RANSAC only need to be fixed once in `algorithms/outlier_removal/ransac.py`, rather than updated across multiple experiment scripts.
- **Discoverability**: New researchers joining the project can immediately see what algorithms are available by examining `algorithms/__init__.py`.

## Next Steps
- Consider further refining legacy scripts in `experiments/legacy_reference/` to use the `algorithms/` library if those legacy flows need to be resurrected.
- Write extensive unit tests for the core modules in `algorithms/`.
- Ensure all GUI-based `tkinter` dependencies in experiment scripts handle headless server execution properly in the future.
