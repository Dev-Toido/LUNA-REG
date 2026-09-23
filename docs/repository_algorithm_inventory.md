# LUNA-REG Repository Algorithm Inventory

## Feature Extraction
* **SIFT**: Found in `Akshat code/registration.py`, `Akshat code/siftFMT.py`, `Akshat new code  (good)/new.py`, `Akshat code LoFTR/Loftr.py`, `Demo 1/one.py`. SIFT is used across many phases with slight variations in parameter configurations and usage.
* **SuperPoint**: Found in `Akshat + superpoint+ lightglue/superpoint.py`, `Akshat code/ARSS_demo.py`, `FMT SCALE INVARIANT/scale.py`, `Superpoint + Pyramid/superPyramid.py`.
* **ORB**: Found in `Demo 1/one.py`, `Demo 4/demo.py`.
* **RIFT2**: Found in `Akshat code LoFTR/Loftr.py`, `Akshat code LoFTR/loftr_sun.py`.

## Matching
* **LightGlue**: Found in `Akshat + superpoint+ lightglue/superpoint.py`, `Akshat code/ARSS_demo.py`, `FMT SCALE INVARIANT/scale.py`, `Superpoint + Pyramid/superPyramid.py`.
* **LoFTR**: Found in `Akshat code LoFTR/Loftr.py`, `Akshat code LoFTR/loftr_sun.py`.
* **BF (Brute Force)**: Used with SIFT/ORB in `Akshat code/registration.py`, `Akshat new code  (good)/new.py`.

## Preprocessing
* **Intensity/Illumination (CLAHE, Scharr, Phase Orientation)**: Found in `Akshat code LoFTR/Loftr.py`.
* **Image Pyramid (Scale)**: Found in `Akshat code/ARSS_demo.py`, `Akshat code/siftFMT.py`, `FMT SCALE INVARIANT/scale.py`, `Superpoint + Pyramid/superPyramid.py`, `ECC based code/demo.py`.

## Correspondence
* **Triangular Correspondence Filter (TAT/RUCO)**: Found in `Akshat + superpoint+ lightglue/superpoint.py`, `Akshat code/ARSS_demo.py`, `Akshat code/siftFMT.py`, `Akshat new code  (good)/new.py`, `FMT SCALE INVARIANT/scale.py`, `Superpoint + Pyramid/superPyramid.py`. Also called `tat_ruco_filter` in `Akshat code LoFTR/Loftr.py`.
* **Bidirectional/Mutual Matching**: `match_sift_bidirectional` found in `Akshat new code  (good)/new.py`.

## Outlier Removal
* **RANSAC**: Pervasive across almost all registration scripts.
* **MAGSAC/MAGSAC++**: Found in `MAGSAC++ based code/magsac.py`, `Demo 3 (ECC + Demo 2)/demo.py`.

## Geometric Models
* **FMT (Fourier-Mellin Transform)**: Scale/rotation estimation found in `Akshat code/ARSS_demo.py`, `Akshat code/siftFMT.py`, `FMT SCALE INVARIANT/scale.py`.
* **Homography**: Found pervasively alongside RANSAC.

## Registration / Refinement
* **ECC (Enhanced Correlation Coefficient)**: Found in `Demo 1/one.py`, `Demo 3 (ECC + Demo 2)/demo.py`, `ECC based code/demo.py`.
* **Phase Correlation**: Found in `Demo 1/one.py`.
* **Optical Flow**: Found in `Demo 1/one.py`.

## Quality Evaluation
* **Reprojection Error**: Calculated in `superpoint.py`, `new.py`, `Loftr.py`, etc.
* **Spatial Coverage**: Calculated in `superpoint.py`, `new.py`, `Loftr.py`, etc.
* **Blur Score**: Found in `Akshat code/ARSS_demo.py`.
