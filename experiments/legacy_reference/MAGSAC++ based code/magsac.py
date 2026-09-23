import cv2
import numpy as np
from pathlib import Path
import tkinter as tk
from tkinter import filedialog


# ============================================================
# CONFIGURATION
# ============================================================

SIFT_FEATURES = 15000

LOWE_RATIO = 0.75

RANSAC_THRESHOLD = 4.0

RANSAC_CONFIDENCE = 0.999

RANSAC_MAX_ITERS = 20000

MIN_MATCHES = 10

MIN_INLIERS = 8

OUTPUT_DIR = Path("ransac_vs_magsac_output")

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# SELECT IMAGE
# ============================================================

def select_image(title):

    root = tk.Tk()

    root.withdraw()

    root.attributes(
        "-topmost",
        True
    )

    path = filedialog.askopenfilename(

        title=title,

        filetypes=[
            (
                "Image Files",
                "*.png *.jpg *.jpeg *.tif *.tiff"
            ),
            (
                "All Files",
                "*.*"
            )
        ]
    )

    root.destroy()

    if not path:

        raise RuntimeError(
            f"No image selected: {title}"
        )

    return path


# ============================================================
# LOAD IMAGE
# ============================================================

def load_image(path):

    image = cv2.imread(
        path,
        cv2.IMREAD_COLOR
    )

    if image is None:

        raise RuntimeError(
            f"Could not load image:\n{path}"
        )

    return image


# ============================================================
# PREPROCESSING
# ============================================================

def preprocess_image(image):

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    # CLAHE improves local contrast
    clahe = cv2.createCLAHE(
        clipLimit=2.5,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(
        gray
    )

    return enhanced


# ============================================================
# SIFT FEATURE DETECTION
# ============================================================

def detect_sift(image):

    sift = cv2.SIFT_create(

        nfeatures=SIFT_FEATURES,

        contrastThreshold=0.03,

        edgeThreshold=10,

        sigma=1.6
    )

    keypoints, descriptors = sift.detectAndCompute(
        image,
        None
    )

    return keypoints, descriptors


# ============================================================
# SIFT MATCHING
# ============================================================

def match_sift(
    descriptors_moving,
    descriptors_reference
):

    matcher = cv2.BFMatcher(
        cv2.NORM_L2
    )

    matches = matcher.knnMatch(

        descriptors_moving,

        descriptors_reference,

        k=2
    )

    # ------------------------------------------
    # LOWE RATIO TEST
    # ------------------------------------------

    good_matches = []

    for pair in matches:

        if len(pair) < 2:
            continue

        m, n = pair

        if m.distance < LOWE_RATIO * n.distance:

            good_matches.append(m)

    return matches, good_matches


# ============================================================
# MATCH POINTS
# ============================================================

def get_match_points(
    matches,
    kp_moving,
    kp_reference
):

    source_points = np.float32([

        kp_moving[
            m.queryIdx
        ].pt

        for m in matches

    ]).reshape(
        -1,
        1,
        2
    )

    reference_points = np.float32([

        kp_reference[
            m.trainIdx
        ].pt

        for m in matches

    ]).reshape(
        -1,
        1,
        2
    )

    return (
        source_points,
        reference_points
    )


# ============================================================
# RANSAC HOMOGRAPHY
# ============================================================

def run_ransac(
    source_points,
    reference_points
):

    H, mask = cv2.findHomography(

        source_points,

        reference_points,

        cv2.RANSAC,

        RANSAC_THRESHOLD,

        maxIters=RANSAC_MAX_ITERS,

        confidence=RANSAC_CONFIDENCE
    )

    return H, mask


# ============================================================
# MAGSAC++ HOMOGRAPHY
# ============================================================

def run_magsac(
    source_points,
    reference_points
):

    # OpenCV's USAC_MAGSAC implements
    # the MAGSAC++ robust estimation approach.

    H, mask = cv2.findHomography(

        source_points,

        reference_points,

        cv2.USAC_MAGSAC,

        RANSAC_THRESHOLD,

        maxIters=RANSAC_MAX_ITERS,

        confidence=RANSAC_CONFIDENCE
    )

    return H, mask


# ============================================================
# CALCULATE METRICS
# ============================================================

def calculate_metrics(
    source_points,
    reference_points,
    H,
    mask
):

    if H is None or mask is None:

        return {
            "inliers": 0,
            "outliers": len(source_points),
            "ratio": 0.0,
            "mean_error": float("inf"),
            "median_error": float("inf"),
            "max_error": float("inf")
        }

    mask = mask.ravel().astype(bool)

    inlier_count = int(
        np.sum(mask)
    )

    outlier_count = (
        len(mask) -
        inlier_count
    )

    ratio = (

        inlier_count /

        len(mask)

    ) * 100.0

    # ------------------------------------------
    # Reproject source points
    # ------------------------------------------

    projected = cv2.perspectiveTransform(

        source_points,

        H
    )

    errors = np.linalg.norm(

        projected.reshape(-1, 2)

        -

        reference_points.reshape(-1, 2),

        axis=1
    )

    inlier_errors = errors[mask]

    if len(inlier_errors) == 0:

        return {
            "inliers": inlier_count,
            "outliers": outlier_count,
            "ratio": ratio,
            "mean_error": float("inf"),
            "median_error": float("inf"),
            "max_error": float("inf")
        }

    return {

        "inliers": inlier_count,

        "outliers": outlier_count,

        "ratio": ratio,

        "mean_error":
            float(np.mean(inlier_errors)),

        "median_error":
            float(np.median(inlier_errors)),

        "max_error":
            float(np.max(inlier_errors))
    }


# ============================================================
# DRAW INLIERS
# ============================================================

def draw_inliers(
    moving,
    kp_moving,
    reference,
    kp_reference,
    matches,
    mask
):

    mask = mask.ravel()

    inlier_matches = [

        matches[i]

        for i in range(len(matches))

        if mask[i] == 1
    ]

    result = cv2.drawMatches(

        moving,

        kp_moving,

        reference,

        kp_reference,

        inlier_matches,

        None,

        flags=
        cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
    )

    return result


# ============================================================
# REGISTER IMAGE
# ============================================================

def register_image(
    moving,
    reference,
    H
):

    height, width = reference.shape[:2]

    registered = cv2.warpPerspective(

        moving,

        H,

        (
            width,
            height
        )
    )

    return registered


# ============================================================
# OVERLAY
# ============================================================

def create_overlay(
    reference,
    registered
):

    overlay = cv2.addWeighted(

        reference,

        0.5,

        registered,

        0.5,

        0
    )

    return overlay


# ============================================================
# MAIN
# ============================================================

print(
    "\n=================================================="
)

print(
    "        RANSAC vs MAGSAC++ COMPARISON"
)

print(
    "=================================================="
)


# ============================================================
# STEP 1
# SELECT IMAGES
# ============================================================

print(
    "\n[1] Select REFERENCE image..."
)

reference_path = select_image(
    "Select Reference Image"
)

print(
    "Reference:",
    reference_path
)


print(
    "\n[2] Select MOVING image..."
)

moving_path = select_image(
    "Select Moving Image"
)

print(
    "Moving:",
    moving_path
)


# ============================================================
# STEP 2
# LOAD IMAGES
# ============================================================

reference = load_image(
    reference_path
)

moving = load_image(
    moving_path
)


# ============================================================
# STEP 3
# PREPROCESSING
# ============================================================

print(
    "\n[3] Preprocessing images..."
)

reference_gray = preprocess_image(
    reference
)

moving_gray = preprocess_image(
    moving
)


# ============================================================
# STEP 4
# SIFT
# ============================================================

print(
    "\n[4] Detecting SIFT features..."
)

kp_reference, desc_reference = detect_sift(
    reference_gray
)

kp_moving, desc_moving = detect_sift(
    moving_gray
)


if (
    desc_reference is None
    or
    desc_moving is None
):

    raise RuntimeError(
        "SIFT descriptors could not be generated."
    )


print(
    "Reference keypoints:",
    len(kp_reference)
)

print(
    "Moving keypoints:",
    len(kp_moving)
)


# ============================================================
# STEP 5
# MATCHING
# ============================================================

print(
    "\n[5] Matching SIFT descriptors..."
)

all_matches, good_matches = match_sift(

    desc_moving,

    desc_reference
)


print(
    "Candidate KNN matches:",
    len(all_matches)
)

print(
    "Lowe matches:",
    len(good_matches)
)


if len(good_matches) < MIN_MATCHES:

    raise RuntimeError(
        "Not enough SIFT correspondences."
    )


# ============================================================
# SAVE CORRESPONDENCES
# ============================================================

correspondence_image = cv2.drawMatches(

    moving,

    kp_moving,

    reference,

    kp_reference,

    good_matches,

    None,

    flags=
    cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "01_sift_correspondences.png"
    ),

    correspondence_image
)


# ============================================================
# STEP 6
# CONVERT MATCHES TO POINTS
# ============================================================

source_points, reference_points = get_match_points(

    good_matches,

    kp_moving,

    kp_reference
)


# ============================================================
# STEP 7
# RANSAC
# ============================================================

print(
    "\n[6] Running RANSAC..."
)

H_ransac, mask_ransac = run_ransac(

    source_points,

    reference_points
)


ransac_metrics = calculate_metrics(

    source_points,

    reference_points,

    H_ransac,

    mask_ransac
)


# ============================================================
# STEP 8
# MAGSAC++
# ============================================================

print(
    "\n[7] Running MAGSAC++..."
)

H_magsac, mask_magsac = run_magsac(

    source_points,

    reference_points
)


magsac_metrics = calculate_metrics(

    source_points,

    reference_points,

    H_magsac,

    mask_magsac
)


# ============================================================
# STEP 9
# PRINT COMPARISON
# ============================================================

print(
    "\n=================================================="
)

print(
    "              RANSAC vs MAGSAC++"
)

print(
    "=================================================="
)


print(
    "\n                 RANSAC        MAGSAC++"
)

print(
    "Inliers       : "
    f"{ransac_metrics['inliers']:<14}"
    f"{magsac_metrics['inliers']}"
)

print(
    "Outliers      : "
    f"{ransac_metrics['outliers']:<14}"
    f"{magsac_metrics['outliers']}"
)

print(
    "Inlier ratio  : "
    f"{ransac_metrics['ratio']:.2f}%"
    f"{'':<9}"
    f"{magsac_metrics['ratio']:.2f}%"
)

print(
    "Mean error    : "
    f"{ransac_metrics['mean_error']:.4f} px"
    f"{'':<3}"
    f"{magsac_metrics['mean_error']:.4f} px"
)

print(
    "Median error  : "
    f"{ransac_metrics['median_error']:.4f} px"
    f"{'':<3}"
    f"{magsac_metrics['median_error']:.4f} px"
)

print(
    "Max error     : "
    f"{ransac_metrics['max_error']:.4f} px"
    f"{'':<3}"
    f"{magsac_metrics['max_error']:.4f} px"
)


# ============================================================
# STEP 10
# SAVE RANSAC RESULT
# ============================================================

if H_ransac is not None:

    ransac_inlier_image = draw_inliers(

        moving,

        kp_moving,

        reference,

        kp_reference,

        good_matches,

        mask_ransac
    )

    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "02_ransac_inliers.png"
        ),

        ransac_inlier_image
    )


    registered_ransac = register_image(

        moving,

        reference,

        H_ransac
    )


    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "03_ransac_registered.png"
        ),

        registered_ransac
    )


    overlay_ransac = create_overlay(

        reference,

        registered_ransac
    )


    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "04_ransac_overlay.png"
        ),

        overlay_ransac
    )


# ============================================================
# STEP 11
# SAVE MAGSAC++ RESULT
# ============================================================

if H_magsac is not None:

    magsac_inlier_image = draw_inliers(

        moving,

        kp_moving,

        reference,

        kp_reference,

        good_matches,

        mask_magsac
    )

    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "05_magsac_inliers.png"
        ),

        magsac_inlier_image
    )


    registered_magsac = register_image(

        moving,

        reference,

        H_magsac
    )


    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "06_magsac_registered.png"
        ),

        registered_magsac
    )


    overlay_magsac = create_overlay(

        reference,

        registered_magsac
    )


    cv2.imwrite(

        str(
            OUTPUT_DIR /
            "07_magsac_overlay.png"
        ),

        overlay_magsac
    )


# ============================================================
# STEP 12
# SAVE METRICS
# ============================================================

metrics_file = OUTPUT_DIR / "08_comparison_metrics.txt"


with open(
    metrics_file,
    "w"
) as file:

    file.write(
        "RANSAC vs MAGSAC++ COMPARISON\n"
    )

    file.write(
        "=============================\n\n"
    )

    file.write(
        f"Moving keypoints: "
        f"{len(kp_moving)}\n"
    )

    file.write(
        f"Reference keypoints: "
        f"{len(kp_reference)}\n"
    )

    file.write(
        f"Lowe matches: "
        f"{len(good_matches)}\n\n"
    )


    file.write(
        "RANSAC\n"
    )

    file.write(
        f"Inliers: "
        f"{ransac_metrics['inliers']}\n"
    )

    file.write(
        f"Outliers: "
        f"{ransac_metrics['outliers']}\n"
    )

    file.write(
        f"Inlier ratio: "
        f"{ransac_metrics['ratio']:.2f}%\n"
    )

    file.write(
        f"Mean reprojection error: "
        f"{ransac_metrics['mean_error']:.4f} px\n"
    )

    file.write(
        f"Median reprojection error: "
        f"{ransac_metrics['median_error']:.4f} px\n"
    )

    file.write(
        f"Maximum reprojection error: "
        f"{ransac_metrics['max_error']:.4f} px\n\n"
    )


    file.write(
        "MAGSAC++\n"
    )

    file.write(
        f"Inliers: "
        f"{magsac_metrics['inliers']}\n"
    )

    file.write(
        f"Outliers: "
        f"{magsac_metrics['outliers']}\n"
    )

    file.write(
        f"Inlier ratio: "
        f"{magsac_metrics['ratio']:.2f}%\n"
    )

    file.write(
        f"Mean reprojection error: "
        f"{magsac_metrics['mean_error']:.4f} px\n"
    )

    file.write(
        f"Median reprojection error: "
        f"{magsac_metrics['median_error']:.4f} px\n"
    )

    file.write(
        f"Maximum reprojection error: "
        f"{magsac_metrics['max_error']:.4f} px\n"
    )


# ============================================================
# FINAL
# ============================================================

print(
    "\n=================================================="
)

print(
    "             COMPARISON COMPLETED"
)

print(
    "=================================================="
)

print(
    "\nOutput folder:"
)

print(
    OUTPUT_DIR.resolve()
)

print(
    "\nSaved:"
)

print(
    "1. 01_sift_correspondences.png"
)

print(
    "2. 02_ransac_inliers.png"
)

print(
    "3. 03_ransac_registered.png"
)

print(
    "4. 04_ransac_overlay.png"
)

print(
    "5. 05_magsac_inliers.png"
)

print(
    "6. 06_magsac_registered.png"
)

print(
    "7. 07_magsac_overlay.png"
)

print(
    "8. 08_comparison_metrics.txt"
)