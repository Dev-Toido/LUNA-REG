# LUNA-REG Core Image Registration Pipeline

The core image registration engine consists of modular components for PDS4 data reading, frequency-domain diagnostics, feature detection, topological filtering, and geometric evaluation.

## Core Modules

- **[`input.py`](../input.py)**: Main entry point and data loading module.
  - Interactive file selection (Tkinter) or scripted loading.
  - Native PDS4 XML metadata parsing (OHRC, TMC-2, IIRS).
  - Multi-band composite generation for IIRS hyperspectral imagery.
  - Lunar polar stereographic projection and footprint polygon intersection.
  - Automatic ROI calculation and memory-mapped array slicing.

- **[`processing.py`](../processing.py)**: Algorithmic processing engine.
  - **Fourier-Mellin Transform (FMT)**: Frequency-domain scale and rotation estimation.
  - **Illumination Analysis**: Contrast, dynamic range, and shadow characterization.
  - **Representations**: CLAHE, Scharr gradients, and Phase Orientation representations.
  - **Feature Detectors**: SIFT / RootSIFT and RIFT2 (phase congruency and MIM).
  - **RUCO / TAT Verification**: Topological Affine Transformation triangle consistency filter.
  - **Spatial Balancing**: Grid-based keypoint redistribution for uniform coverage.
  - **RANSAC & Sub-Pixel Refinement**: Projective homography estimation with sub-pixel gradient optimization.
  - **Comprehensive Metrics**: RMSE, MAE, reprojection error, inlier ratio, and spatial coverage.

- **[`output.py`](../output.py)**: Output generation and run manager.
  - Incremental execution folders: `luna_reg_outputs/registration_N/`.
  - Correspondence visualizations, RANSAC inlier maps, and spatial coverage overlays.
  - High-resolution registered images, alpha-blended overlays, and difference heatmaps.
  - Structured output reports: JSON, CSV coordinate tables, and formatted text summaries.

- **[`RIFT2.py`](../RIFT2.py)** & **[`matcher_functions.py`](../matcher_functions.py)**:
  - Multimodal rotation-invariant feature transform based on phase congruency.
  - Nearest-neighbor descriptor matching and MAGSAC outlier removal.

## Running the Pipeline

To execute the core pipeline interactively:

```bash
python input.py
```

To run the RIFT2 multimodal matching demo:

```bash
python demo.py
```
