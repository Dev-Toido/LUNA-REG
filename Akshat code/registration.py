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

GRID_ROWS = 6
GRID_COLS = 6

MAX_DISPLAY_WIDTH = 1400
MAX_DISPLAY_HEIGHT = 850


# ============================================================
# OUTPUT FOLDER
# ============================================================

OUTPUT_DIR = Path("sift_ransac_output")

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

        raise FileNotFoundError(
            f"Could not load image:\n{path}"
        )

    return image


# ============================================================
# PREPROCESSING
# ============================================================

def preprocess_image(image):

    # ------------------------------------------
    # Convert image to grayscale
    # ------------------------------------------

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )


    # ------------------------------------------
    # CLAHE
    # ------------------------------------------

    clahe = cv2.createCLAHE(

        clipLimit=2.5,

        tileGridSize=(
            8,
            8
        )
    )


    enhanced = clahe.apply(
        gray
    )


    # ------------------------------------------
    # Small Gaussian blur
    # ------------------------------------------

    enhanced = cv2.GaussianBlur(

        enhanced,

        (
            3,
            3
        ),

        0
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


    return (
        keypoints,
        descriptors
    )


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


    # KNN matching
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

            good_matches.append(
                m
            )


    return (
        matches,
        good_matches
    )


# ============================================================
# CONVERT MATCHES TO COORDINATES
# ============================================================

def get_match_points(
    matches,
    kp_moving,
    kp_reference
):

    source_points = np.float32([

        kp_moving[
            match.queryIdx
        ].pt

        for match in matches

    ]).reshape(
        -1,
        1,
        2
    )


    reference_points = np.float32([

        kp_reference[
            match.trainIdx
        ].pt

        for match in matches

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

def estimate_homography(
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


    return (
        H,
        mask
    )


# ============================================================
# GET RANSAC INLIERS
# ============================================================

def extract_inliers(
    matches,
    mask
):

    mask = mask.ravel().astype(bool)


    inlier_matches = [

        match

        for match, valid
        in zip(
            matches,
            mask
        )

        if valid
    ]


    return (
        inlier_matches,
        mask
    )


# ============================================================
# REPROJECTION ERROR
# ============================================================

def calculate_reprojection_error(
    source_points,
    reference_points,
    H,
    mask
):

    projected_points = cv2.perspectiveTransform(

        source_points,

        H
    )


    errors = np.linalg.norm(

        projected_points.reshape(
            -1,
            2
        )

        -

        reference_points.reshape(
            -1,
            2
        ),

        axis=1
    )


    inlier_errors = errors[
        mask
    ]


    if len(inlier_errors) == 0:

        return (
            float("inf"),
            float("inf"),
            float("inf"),
            errors
        )


    mean_error = float(
        np.mean(
            inlier_errors
        )
    )


    median_error = float(
        np.median(
            inlier_errors
        )
    )


    max_error = float(
        np.max(
            inlier_errors
        )
    )


    return (
        mean_error,
        median_error,
        max_error,
        errors
    )


# ============================================================
# SPATIAL COVERAGE
# ============================================================

def calculate_spatial_coverage(
    points,
    image_shape
):

    height, width = image_shape[:2]


    occupied_cells = set()


    for point in points.reshape(
        -1,
        2
    ):

        x, y = point


        col = min(

            int(
                x /
                (
                    width /
                    GRID_COLS
                )
            ),

            GRID_COLS - 1
        )


        row = min(

            int(
                y /
                (
                    height /
                    GRID_ROWS
                )
            ),

            GRID_ROWS - 1
        )


        occupied_cells.add(
            (
                row,
                col
            )
        )


    total_cells = (
        GRID_ROWS *
        GRID_COLS
    )


    coverage = (

        len(
            occupied_cells
        )

        /

        total_cells

    ) * 100.0


    return (
        coverage,
        occupied_cells
    )


# ============================================================
# DRAW COVERAGE MAP
# ============================================================

def draw_coverage_map(
    image,
    occupied_cells
):

    output = image.copy()


    height, width = output.shape[:2]


    cell_width = (
        width /
        GRID_COLS
    )


    cell_height = (
        height /
        GRID_ROWS
    )


    # ------------------------------------------
    # Draw horizontal lines
    # ------------------------------------------

    for row in range(
        1,
        GRID_ROWS
    ):

        y = int(
            row *
            cell_height
        )


        cv2.line(

            output,

            (
                0,
                y
            ),

            (
                width,
                y
            ),

            (
                255,
                255,
                255
            ),

            2
        )


    # ------------------------------------------
    # Draw vertical lines
    # ------------------------------------------

    for col in range(
        1,
        GRID_COLS
    ):

        x = int(
            col *
            cell_width
        )


        cv2.line(

            output,

            (
                x,
                0
            ),

            (
                x,
                height
            ),

            (
                255,
                255,
                255
            ),

            2
        )


    # ------------------------------------------
    # Mark cells containing inliers
    # ------------------------------------------

    for row in range(
        GRID_ROWS
    ):

        for col in range(
            GRID_COLS
        ):

            x = int(
                col *
                cell_width
            )

            y = int(
                row *
                cell_height
            )


            if (
                row,
                col
            ) in occupied_cells:

                text = "INLIER"

            else:

                text = "-"


            cv2.putText(

                output,

                text,

                (
                    x + 10,
                    y + 30
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.6,

                (
                    255,
                    255,
                    255
                ),

                2,

                cv2.LINE_AA
            )


    return output


# ============================================================
# DISPLAY RESIZE
# ============================================================

def resize_for_display(image):

    height, width = image.shape[:2]


    scale = min(

        MAX_DISPLAY_WIDTH / width,

        MAX_DISPLAY_HEIGHT / height,

        1.0
    )


    if scale >= 1.0:

        return image


    resized = cv2.resize(

        image,

        None,

        fx=scale,

        fy=scale,

        interpolation=cv2.INTER_AREA
    )


    return resized


# ============================================================
# MAIN PROGRAM
# ============================================================

print(
    "\n==========================================="
)

print(
    "        SIFT + RANSAC REGISTRATION"
)

print(
    "==========================================="
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


print(
    "\nReference shape:",
    reference.shape
)


print(
    "Moving shape:",
    moving.shape
)


# ============================================================
# STEP 3
# PREPROCESS
# ============================================================

print(
    "\n[3] Preprocessing..."
)


reference_gray = preprocess_image(
    reference
)


moving_gray = preprocess_image(
    moving
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "01_reference_preprocessed.png"
    ),

    reference_gray
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "02_moving_preprocessed.png"
    ),

    moving_gray
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
        "SIFT could not generate descriptors."
    )


print(
    "Reference keypoints:",
    len(
        kp_reference
    )
)


print(
    "Moving keypoints:",
    len(
        kp_moving
    )
)


# ============================================================
# DRAW KEYPOINTS
# ============================================================

reference_keypoints_image = cv2.drawKeypoints(

    reference,

    kp_reference,

    None,

    flags=
    cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)


moving_keypoints_image = cv2.drawKeypoints(

    moving,

    kp_moving,

    None,

    flags=
    cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "03_reference_keypoints.png"
    ),

    reference_keypoints_image
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "04_moving_keypoints.png"
    ),

    moving_keypoints_image
)


# ============================================================
# STEP 5
# MATCH SIFT FEATURES
# ============================================================

print(
    "\n[5] Matching SIFT descriptors..."
)


all_matches, good_matches = match_sift(

    desc_moving,

    desc_reference
)


print(
    "Total candidate matches:",
    len(
        all_matches
    )
)


print(
    "Good matches after Lowe test:",
    len(
        good_matches
    )
)


if len(
    good_matches
) < MIN_MATCHES:

    raise RuntimeError(

        "Registration rejected: "
        "not enough reliable SIFT matches."
    )


# ============================================================
# DRAW CORRESPONDENCES BEFORE RANSAC
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
        "05_sift_correspondences.png"
    ),

    correspondence_image
)


# ============================================================
# STEP 6
# MATCH COORDINATES
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


H, ransac_mask = estimate_homography(

    source_points,

    reference_points
)


if (
    H is None
    or
    ransac_mask is None
):

    raise RuntimeError(
        "RANSAC could not estimate homography."
    )


# ============================================================
# STEP 8
# EXTRACT INLIERS
# ============================================================

inlier_matches, inlier_mask = extract_inliers(

    good_matches,

    ransac_mask
)


inlier_count = len(
    inlier_matches
)


print(
    "RANSAC inliers:",
    inlier_count
)


if inlier_count < MIN_INLIERS:

    raise RuntimeError(

        "Registration rejected: "
        f"only {inlier_count} RANSAC inliers."
    )


# ============================================================
# INLIER RATIO
# ============================================================

inlier_ratio = (

    inlier_count

    /

    len(
        good_matches
    )

) * 100.0


print(
    f"Inlier ratio: {inlier_ratio:.2f}%"
)


# ============================================================
# STEP 9
# REPROJECTION ERROR
# ============================================================

(
    mean_error,
    median_error,
    max_error,
    reprojection_errors

) = calculate_reprojection_error(

    source_points,

    reference_points,

    H,

    inlier_mask
)


print(
    f"Mean reprojection error: "
    f"{mean_error:.3f} px"
)


print(
    f"Median reprojection error: "
    f"{median_error:.3f} px"
)


print(
    f"Maximum reprojection error: "
    f"{max_error:.3f} px"
)


# ============================================================
# STEP 10
# GET INLIER POINTS
# ============================================================

inlier_source_points = source_points[
    inlier_mask
]


inlier_reference_points = reference_points[
    inlier_mask
]


# ============================================================
# STEP 11
# SPATIAL COVERAGE
# ============================================================

moving_coverage, moving_cells = (
    calculate_spatial_coverage(

        inlier_source_points,

        moving.shape
    )
)


reference_coverage, reference_cells = (
    calculate_spatial_coverage(

        inlier_reference_points,

        reference.shape
    )
)


print(
    f"Moving inlier coverage: "
    f"{moving_coverage:.2f}%"
)


print(
    f"Reference inlier coverage: "
    f"{reference_coverage:.2f}%"
)


# ============================================================
# STEP 12
# DRAW RANSAC INLIERS
# ============================================================

ransac_inlier_image = cv2.drawMatches(

    moving,

    kp_moving,

    reference,

    kp_reference,

    inlier_matches,

    None,

    flags=
    cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "06_ransac_inliers.png"
    ),

    ransac_inlier_image
)


# ============================================================
# COVERAGE MAPS
# ============================================================

moving_coverage_image = draw_coverage_map(

    moving,

    moving_cells
)


reference_coverage_image = draw_coverage_map(

    reference,

    reference_cells
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "07_moving_inlier_coverage.png"
    ),

    moving_coverage_image
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "08_reference_inlier_coverage.png"
    ),

    reference_coverage_image
)


# ============================================================
# STEP 13
# REFINE HOMOGRAPHY USING ONLY RANSAC INLIERS
# ============================================================

if inlier_count >= 4:

    refined_H, _ = cv2.findHomography(

        inlier_source_points,

        inlier_reference_points,

        0
    )


    if refined_H is not None:

        H = refined_H


# ============================================================
# STEP 14
# WARP MOVING IMAGE
# ============================================================

print(
    "\n[7] Registering image..."
)


height, width = reference.shape[:2]


registered = cv2.warpPerspective(

    moving,

    H,

    (
        width,
        height
    )
)


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "09_registered.png"
    ),

    registered
)


# ============================================================
# STEP 15
# CREATE VALID WARP MASK
# ============================================================

moving_mask = np.full(

    moving.shape[:2],

    255,

    dtype=np.uint8
)


warped_mask = cv2.warpPerspective(

    moving_mask,

    H,

    (
        width,
        height
    )
)


# ============================================================
# STEP 16
# OVERLAY
# ============================================================

overlay = reference.copy()


blended = cv2.addWeighted(

    reference,

    0.5,

    registered,

    0.5,

    0
)


valid_pixels = (
    warped_mask > 0
)


overlay[
    valid_pixels
] = blended[
    valid_pixels
]


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "10_overlay.png"
    ),

    overlay
)


# ============================================================
# STEP 17
# DIFFERENCE IMAGE
# ============================================================

difference = cv2.absdiff(

    reference,

    registered
)


difference[
    warped_mask == 0
] = 0


cv2.imwrite(

    str(
        OUTPUT_DIR /
        "11_registration_difference.png"
    ),

    difference
)


# ============================================================
# STEP 18
# SAVE HOMOGRAPHY
# ============================================================

np.savetxt(

    OUTPUT_DIR /
    "homography_matrix.txt",

    H,

    fmt="%.10f"
)


# ============================================================
# STEP 19
# SAVE INLIER COORDINATES
# ============================================================

coordinates = np.hstack((

    inlier_source_points.reshape(
        -1,
        2
    ),

    inlier_reference_points.reshape(
        -1,
        2
    )

))


np.savetxt(

    OUTPUT_DIR /
    "inlier_coordinates.csv",

    coordinates,

    delimiter=",",

    header=(
        "moving_x,"
        "moving_y,"
        "reference_x,"
        "reference_y"
    ),

    comments="",

    fmt="%.3f"
)


# ============================================================
# FINAL REPORT
# ============================================================

report = f"""
===========================================
        SIFT + RANSAC REPORT
===========================================

REFERENCE IMAGE
{reference_path}

MOVING IMAGE
{moving_path}

-------------------------------------------
FEATURE DETECTION
-------------------------------------------

Reference Keypoints : {len(kp_reference)}
Moving Keypoints    : {len(kp_moving)}

-------------------------------------------
FEATURE MATCHING
-------------------------------------------

Candidate Matches   : {len(all_matches)}
Lowe Good Matches   : {len(good_matches)}

-------------------------------------------
RANSAC
-------------------------------------------

RANSAC Inliers      : {inlier_count}
Inlier Ratio        : {inlier_ratio:.2f} %

-------------------------------------------
SPATIAL DISTRIBUTION
-------------------------------------------

Moving Coverage     : {moving_coverage:.2f} %
Reference Coverage  : {reference_coverage:.2f} %

-------------------------------------------
REGISTRATION ERROR
-------------------------------------------

Mean Error          : {mean_error:.3f} px
Median Error        : {median_error:.3f} px
Maximum Error       : {max_error:.3f} px

-------------------------------------------
HOMOGRAPHY
-------------------------------------------

{H}

===========================================
"""


print(
    report
)


with open(

    OUTPUT_DIR /
    "registration_report.txt",

    "w",

    encoding="utf-8"

) as file:

    file.write(
        report
    )


# ============================================================
# DISPLAY RESULTS
# ============================================================

cv2.imshow(

    "SIFT Correspondences",

    resize_for_display(
        correspondence_image
    )
)


cv2.imshow(

    "RANSAC Inliers",

    resize_for_display(
        ransac_inlier_image
    )
)


cv2.imshow(

    "Reference Inlier Coverage",

    resize_for_display(
        reference_coverage_image
    )
)


cv2.imshow(

    "Registered Image",

    resize_for_display(
        registered
    )
)


cv2.imshow(

    "Overlay",

    resize_for_display(
        overlay
    )
)


cv2.waitKey(0)

cv2.destroyAllWindows()