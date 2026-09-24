"""
LUNA-REG V6.2
Input + configuration module.

Convention:
    image1 = TARGET / MOVING
    image2 = REFERENCE / FIXED
"""

import tkinter as tk
from tkinter import filedialog


# ============================================================
# GENERAL
# ============================================================

N_FEATURES = 15000
LOWE_RATIO = 0.75

MIN_GOOD_MATCHES = 10
MIN_INLIERS = 8
MIN_INLIER_RATIO = 30.0


# ============================================================
# GEOMETRY
# ============================================================

RANSAC_THRESHOLD = 4.0
RANSAC_CONFIDENCE = 0.999
RANSAC_MAX_ITERS = 20000

USE_MAGSAC = True
USE_RANSAC_DIAGNOSTIC = True
USE_AFFINE_FALLBACK = True

GRID_ROWS = 6
GRID_COLS = 6

MIN_SPATIAL_COVERAGE = 20.0
MIN_HULL_COVERAGE = 5.0
MAX_MEAN_REPROJECTION_ERROR = 5.0


# ============================================================
# SIFT BRANCH
# ============================================================

USE_SIFT = True

SIFT_CONTRAST_THRESHOLD = 0.03
SIFT_EDGE_THRESHOLD = 10
SIFT_SIGMA = 1.6

USE_CLAHE_FOR_SIFT = True
CLAHE_CLIP_LIMIT = 2.5
CLAHE_TILE_GRID_SIZE = (8, 8)
BLUR_KERNEL = (3, 3)

USE_ROOTSIFT = True


# ============================================================
# RIFT2 BRANCH
# ============================================================

USE_RIFT2 = True

# Values follow the RIFT2 research material studied for V6.
RIFT2_SCALES = 4
RIFT2_ORIENTATIONS = 6
RIFT2_PATCH_SIZE = 96
RIFT2_MAX_KEYPOINTS = 5000

RIFT2_DESCRIPTOR_GRID = 6
RIFT2_DESCRIPTOR_BINS = 6

RIFT2_MATCH_THRESHOLD = 100.0


# ============================================================
# EXPERIMENT MODE
# ============================================================

# Allowed values:
#   "SIFT"
#   "RIFT2"
#   "HYBRID"

MATCHING_MODE = "RIFT2"


# ============================================================
# DISPLAY
# ============================================================

MAX_DISPLAY_WIDTH = 1400
MAX_DISPLAY_HEIGHT = 850


# ============================================================
# CONSERVATIVE HYBRID FUSION
# ============================================================

# RIFT2 is allowed to add correspondences only when they agree
# with the SIFT-derived geometry.

HYBRID_GATE_ENABLED = True
HYBRID_GATE_ERROR = 6.0

HYBRID_MIN_RIFT_INLIERS = 8
HYBRID_MIN_GAIN = 3

HYBRID_MAX_ERROR_INCREASE = 0.50
HYBRID_MAX_COVERAGE_DROP = 5.0


# ============================================================
# RIFT2 INDEPENDENT VERIFICATION
# ============================================================

# RIFT2 must prove geometric consistency independently before
# its correspondences are allowed into HYBRID.

RIFT2_INDEPENDENT_MIN_INLIERS = 8
RIFT2_INDEPENDENT_MIN_INLIER_RATIO = 20.0
RIFT2_INDEPENDENT_MAX_MEAN_ERROR = 6.0

# Maximum geometric disagreement allowed when RIFT2
# correspondences are checked against the SIFT baseline.

RIFT2_FUSION_GATE_ERROR = 4.0


# ============================================================
# IMAGE SELECTION
# ============================================================

def select_images():
    root = tk.Tk()
    root.withdraw()

    filetypes = [
        (
            "Image Files",
            "*.png *.jpg *.jpeg *.bmp *.tif *.tiff"
        ),
        ("PNG Files", "*.png"),
        ("JPEG Files", "*.jpg *.jpeg"),
        ("TIFF Files", "*.tif *.tiff"),
        ("BMP Files", "*.bmp"),
        ("All Files", "*.*"),
    ]

    target_path = filedialog.askopenfilename(
        title="Select TARGET / MOVING image",
        filetypes=filetypes,
    )

    if not target_path:
        root.destroy()
        return None, None

    reference_path = filedialog.askopenfilename(
        title="Select REFERENCE / FIXED image",
        filetypes=filetypes,
    )

    root.destroy()

    if not reference_path:
        return None, None

    return target_path, reference_path


# ============================================================
# CONFIGURATION EXPORT
# ============================================================

def get_config():
    return {
        name: value
        for name, value in globals().items()
        if name.isupper()
    }