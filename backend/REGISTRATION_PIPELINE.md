# LUNA-REG Unified Registration Pipeline

## 1. What is this Code About?

This script implements a **robust, multi-stage planetary image registration engine** designed for registering disparate lunar surface images (such as Chandrayaan-2 TMC-2, OHRC, or LRO NAC datasets). 

Lunar image registration is notoriously difficult due to:
- **Large scale & resolution disparities**: One sensor might capture at 0.25 m/pixel (e.g. OHRC) while another captures at 5.0 m/pixel (e.g. TMC-2).
- **Extreme illumination differences**: Solar elevation angles change shadow lengths inside craters and cast sharp dark regions.
- **Repetitive & ambiguous terrain**: Impact craters and regolith plains look similar across different regions, causing naive feature matchers to produce many false positive correspondences.

This unified script solves these problems by combining **global frequency-domain estimation (Fourier-Mellin)**, **scale-space pyramid alignment**, **state-of-the-art feature matching (SIFT or SuperPoint + LightGlue)**, and **rigid local triangular geometric validation** before computing a sub-pixel projective homography.

---

## 2. Pipeline Architecture & Step-by-Step Breakdown

```
+-------------------------------------------------------------------------+
|                         Reference & Moving Images                       |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 1] Fourier-Mellin Transform (FMT) Scale & Rotation Estimation     |
|   - 2D Fast Fourier Transform (FFT) & Magnitude Spectrum                |
|   - Log-Polar Cartesian transformation                                 |
|   - Phase correlation to find scale factor (s) & rotation angle (theta) |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 2] Multi-Resolution Gaussian Pyramid Alignment                    |
|   - Computes required pyramid depth from FMT scale ratio               |
|   - Blurs and downsamples moving/reference images                       |
|   - Pairs pyramid levels whose effective GSDs are within 2x of each other|
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 3] Dual-Backend Feature Detection & Matching                      |
|                                                                         |
|   Option A: SIFT (Default)              Option B: SuperPoint + LightGlue |
|     - CLAHE contrast enhancement           - Deep learned keypoints     |
|     - Scale-space extrema detection        - Transformer-based attention|
|     - BFMatcher + Lowe's ratio test        - Deep match confidence score|
|     - Scaled back to full-res coordinates  - Scaled back to full-res    |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 4] Triangular Correspondence Filtering (Local Geometry Check)     |
|   - Forms triangles among k-nearest neighboring candidate match points  |
|   - Computes scale-invariant side length ratios & interior angles       |
|   - Prunes ambiguous/false matches that distort local planar geometry   |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 5] RANSAC Homography Estimation & Inlier Refinement               |
|   - Robust Projective Matrix H (3x3) estimation                         |
|   - Outlier rejection (threshold: 4.0 px, confidence: 99.9%)            |
|   - Least-squares refinement using all verified inliers                 |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 6] Metrics & Spatial Distribution Analysis                        |
|   - Mean, Median, and Maximum reprojection error (full-res pixels)      |
|   - 6x6 Grid spatial coverage (ensuring inliers span the whole image)   |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| [Step 7] High-Precision Warping & Output Generation                     |
|   - Full-resolution perspective warping (cv2.warpPerspective)           |
|   - 50/50 Alpha-blended verification overlay                            |
|   - Absolute photometric difference map                                 |
|   - Export: Inlier CSV, Homography Matrix, ASCII Diagnostic Report     |
+-------------------------------------------------------------------------+
```

---

## 3. Mathematical & Algorithmic Details

### A. Fourier-Mellin Transform (FMT)
Standard correlation fails if an image is rotated or scaled. FMT leverages the Fourier Shift Theorem:
1. Spatial shifts become linear phase differences in the frequency domain, while magnitude spectra $|F(\omega_x, \omega_y)|$ are completely translation-invariant.
2. Converting the magnitude spectrum to log-polar coordinates converts scale $s$ into a horizontal shift and rotation $\theta$ into a vertical shift:
   $$\ln r \rightarrow \ln(s \cdot r) = \ln r + \ln s, \quad \theta \rightarrow \theta + \Delta \theta$$
3. Phase correlation of the log-polar spectra produces a distinct correlation peak identifying exact scale and rotation without needing prior point matches.

### B. Gaussian Pyramid Level Pairing
Matching high-resolution images with very low-resolution images directly yields poor descriptors because small high-frequency details do not exist in the lower-resolution image. The pyramid builder downsamples the higher-resolution image so both images are matched at comparable Ground Sampling Distances (GSD), then maps keypoint coordinates back to full-resolution space.

### C. Triangular Correspondence Filtering
Crater patterns can trick SIFT and descriptor matchers. To guarantee physical rigidity:
- Any valid affine/projective transformation locally preserves triangle side ratios $\frac{s_1}{s_3}, \frac{s_2}{s_3}$ and interior angles $(\alpha, \beta, \gamma)$.
- Triangles formed by 6 nearest neighbors are compared between moving and reference coordinates.
- Matches lacking triangular structural consensus are discarded before RANSAC.

### D. Sub-Pixel Reprojection Error
For each inlier point $p_i = (x_i, y_i)$ mapped by homography $H$:
$$p'_i = H \cdot p_i$$
$$\text{Error}_i = \| p'_i - p_{\text{ref}, i} \|_2$$
A mean error $< 0.5\text{ px}$ indicates **sub-pixel alignment accuracy**, which is the gold standard for planetary cartography and DEM generation.

---

## 4. Understanding the Sample Registration Report

The sample run output provided in `sample_registration_report.txt` demonstrates:

```
===========================================
  UNIFIED REGISTRATION REPORT (method = sift)
===========================================
REFERENCE IMAGE: Lunar NCR reference.png
MOVING IMAGE:    Image Lunar NCR.png

Estimated scale ratio (moving/reference) : 1.5021
Estimated rotation                       : 0.00 degrees
Phase-correlation confidence             : 0.4721
```
- **Scale ratio of 1.5021**: The moving image was scaled by ~1.5x relative to the reference.
- **Confidence 0.4721**: Strong phase correlation peak, confirming reliable FMT detection.

```
Source resolution used : 0.6657
Reference resolution   : 1.0000
Pyramid levels built   : 2
Matched source level   : 1 (scale 0.5000)
Matched reference level: 0 (scale 1.0000)
```
- The algorithm automatically downsampled the source image (moving) to level 1 ($0.5\times$) so feature descriptors could be matched at equalized physical resolutions.

```
Reference Keypoints : 15000
Moving Keypoints    : 4464
Total Candidate Matches : 4464
Triangle Verified   : 1200
RANSAC Inliers      : 1200
Inlier Ratio        : 100.00 %
```
- Out of 4,464 candidate matches, the triangle filter retained the top 1,200 geometrically consistent matches.
- All 1,200 passed RANSAC with 0 outliers (**100% inlier ratio**), showing zero false correspondences.

```
Moving Coverage     : 100.00 %
Reference Coverage  : 55.56 %
```
- **100% moving coverage**: Matches were distributed across all 36 cells of the 6x6 spatial grid on the moving image, preventing localized clustering.
- **55.56% reference coverage**: The moving image covered about 55% of the larger reference frame footprint.

```
Mean Error          : 0.394 px
Median Error        : 0.316 px
Maximum Error       : 3.300 px
```
- **0.394 pixel mean error**: Outstanding sub-pixel precision across the entire lunar surface.

```
HOMOGRAPHY:
[[ 6.60925174e-01  1.15242984e-04  2.39243399e+02]
 [-5.58786960e-05  6.61260129e-01  1.18138839e+02]
 [-1.63199916e-07  8.17593844e-08  1.00000000e+00]]
```
- The diagonal terms ($\approx 0.661 = 1 / 1.51$) confirm the 1.5x inverse scale mapping, while $(239.24, 118.14)$ represents the spatial translation in full-resolution pixel coordinates.

---

## 5. How to Run

### Prerequisites
```bash
pip install opencv-python numpy
```

*(Optional for SuperPoint + LightGlue)*:
```bash
pip install torch torchvision
pip install git+https://github.com/cvg/LightGlue.git
```

### Execution
From the project root:
```bash
python backend/unified_registration.py
```
This opens file dialogs to select reference and moving images, executes the pipeline, displays interactive OpenCV comparison windows, and writes all artifacts into `unified_registration_output/`.
