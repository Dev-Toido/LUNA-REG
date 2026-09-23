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

# Local triangular correspondence verification (RUCO-style)
TRIANGLE_K_NEIGHBORS = 6
TRIANGLE_MIN_SUPPORT = 1
TRIANGLE_MAX_SIDE_RATIO_ERROR = 0.18
TRIANGLE_MAX_ANGLE_ERROR_DEG = 12.0
TRIANGLE_MIN_AREA = 20.0
TRIANGLE_MAX_CANDIDATES = 1200

# SIFT-only accuracy filter
ENABLE_BIDIRECTIONAL_MATCHING = True

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
# BIDIRECTIONAL / MUTUAL SIFT MATCHING
# ============================================================

def match_sift_bidirectional(
    descriptors_moving,
    descriptors_reference
):
    """
    Lowe-ratio matching in both directions.

    A correspondence is retained only if:
      moving[i] -> reference[j]
    and
      reference[j] -> moving[i]

    both pass the Lowe ratio test.
    """

    _, forward = match_sift(
        descriptors_moving,
        descriptors_reference
    )

    _, reverse = match_sift(
        descriptors_reference,
        descriptors_moving
    )

    reverse_pairs = {
        (
            m.queryIdx,
            m.trainIdx
        )
        for m in reverse
    }

    mutual = [
        m
        for m in forward
        if (
            m.trainIdx,
            m.queryIdx
        ) in reverse_pairs
    ]

    return (
        forward,
        reverse,
        mutual
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
# LOCAL TRIANGULAR CORRESPONDENCE VERIFICATION
# ============================================================

def _triangle_signature(points):
    """
    Return scale-independent triangle geometry:
    sorted normalized side lengths + sorted internal angles.
    """
    p = np.asarray(points, dtype=np.float64).reshape(3, 2)

    # 2D triangle area using explicit scalar cross product.
    # This avoids NumPy 2.x / Python 3.14 np.cross() requiring 3D vectors.
    v1 = p[1] - p[0]
    v2 = p[2] - p[0]

    area = abs(
        v1[0] * v2[1] -
        v1[1] * v2[0]
    ) * 0.5

    if area < TRIANGLE_MIN_AREA:
        return None

    sides = np.array([
        np.linalg.norm(p[0] - p[1]),
        np.linalg.norm(p[1] - p[2]),
        np.linalg.norm(p[2] - p[0])
    ], dtype=np.float64)

    if np.min(sides) < 1e-6:
        return None

    sides_sorted = np.sort(sides)
    side_ratios = sides_sorted[:2] / sides_sorted[2]

    def angle(a, b, c):
        v1 = a - b
        v2 = c - b
        denom = np.linalg.norm(v1) * np.linalg.norm(v2)
        if denom < 1e-12:
            return 0.0
        cosv = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
        return np.degrees(np.arccos(cosv))

    angles = np.sort(np.array([
        angle(p[1], p[0], p[2]),
        angle(p[0], p[1], p[2]),
        angle(p[0], p[2], p[1])
    ], dtype=np.float64))

    return side_ratios, angles


def triangular_correspondence_filter(
    matches,
    kp_moving,
    kp_reference
):
    """
    Validate SIFT correspondences using local triangle geometry.

    For each candidate match, nearby candidate matches are selected in
    the MOVING image. Triangles are built from triples of already matched
    points. A triangle votes for all three matches when its normalized
    side ratios and internal angles are consistent in MOVING and REFERENCE.

    This is deliberately a verification layer after SIFT/Lowe, not a
    replacement for descriptor matching.
    """

    if len(matches) < 6:
        return matches, np.ones(len(matches), dtype=np.int32)

    # Keep computation bounded. Best SIFT matches have lower distance.
    indexed = list(enumerate(matches))
    indexed.sort(key=lambda item: item[1].distance)
    indexed = indexed[:TRIANGLE_MAX_CANDIDATES]

    original_indices = [item[0] for item in indexed]
    working_matches = [item[1] for item in indexed]

    moving_pts = np.float64([
        kp_moving[m.queryIdx].pt
        for m in working_matches
    ])

    reference_pts = np.float64([
        kp_reference[m.trainIdx].pt
        for m in working_matches
    ])

    n = len(working_matches)
    support = np.zeros(n, dtype=np.int32)

    # Pairwise distances only among Lowe-filtered candidate matches.
    diff = moving_pts[:, None, :] - moving_pts[None, :, :]
    dist2 = np.sum(diff * diff, axis=2)

    tested_triangles = set()

    for i in range(n):
        order = np.argsort(dist2[i])

        neighbors = [
            int(j) for j in order
            if j != i
        ][:TRIANGLE_K_NEIGHBORS]

        for a in range(len(neighbors)):
            for b in range(a + 1, len(neighbors)):
                j = neighbors[a]
                k = neighbors[b]

                tri = tuple(sorted((i, j, k)))

                if tri in tested_triangles:
                    continue

                tested_triangles.add(tri)

                sig_m = _triangle_signature(
                    moving_pts[list(tri)]
                )

                sig_r = _triangle_signature(
                    reference_pts[list(tri)]
                )

                if sig_m is None or sig_r is None:
                    continue

                ratios_m, angles_m = sig_m
                ratios_r, angles_r = sig_r

                side_error = float(
                    np.max(np.abs(ratios_m - ratios_r))
                )

                angle_error = float(
                    np.max(np.abs(angles_m - angles_r))
                )

                if (
                    side_error <= TRIANGLE_MAX_SIDE_RATIO_ERROR
                    and
                    angle_error <= TRIANGLE_MAX_ANGLE_ERROR_DEG
                ):
                    support[list(tri)] += 1

    keep_local = support >= TRIANGLE_MIN_SUPPORT

    filtered_matches = [
        working_matches[i]
        for i in range(n)
        if keep_local[i]
    ]

    # If local geometry becomes too strict, do not silently destroy an
    # otherwise usable SIFT result. RANSAC remains the global verifier.
    if len(filtered_matches) < MIN_MATCHES:
        print(
            "Triangle verification retained too few matches; "
            "falling back to Lowe-filtered matches."
        )
        return matches, np.zeros(len(matches), dtype=np.int32)

    # Return support aligned to the original match list for reporting.
    full_support = np.zeros(len(matches), dtype=np.int32)
    for local_i, original_i in enumerate(original_indices):
        full_support[original_i] = support[local_i]

    return filtered_matches, full_support



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
# STEP 5A
# BIDIRECTIONAL / MUTUAL SIFT CONSISTENCY
# ============================================================

forward_lowe_matches = list(good_matches)

if ENABLE_BIDIRECTIONAL_MATCHING:

    print(
        "\n[5A] Checking bidirectional SIFT consistency..."
    )

    (
        forward_lowe_matches,
        reverse_lowe_matches,
        mutual_matches
    ) = match_sift_bidirectional(
        desc_moving,
        desc_reference
    )

    print(
        "Forward Lowe matches:",
        len(forward_lowe_matches)
    )

    print(
        "Reverse Lowe matches:",
        len(reverse_lowe_matches)
    )

    print(
        "Mutual / bidirectional matches:",
        len(mutual_matches)
    )

    if len(mutual_matches) < MIN_MATCHES:
        raise RuntimeError(
            "Registration rejected: not enough "
            "bidirectionally consistent SIFT matches."
        )

    good_matches = mutual_matches

else:

    reverse_lowe_matches = []
    mutual_matches = list(good_matches)


# ============================================================
# STEP 5B
# LOCAL TRIANGULAR CORRESPONDENCE VERIFICATION
# ============================================================

print(
    "\n[5B] Verifying local triangular geometry..."
)

lowe_matches = good_matches

triangle_matches, triangle_support = (
    triangular_correspondence_filter(
        lowe_matches,
        kp_moving,
        kp_reference
    )
)

print(
    "Matches before triangle verification:",
    len(lowe_matches)
)

print(
    "Matches after triangle verification:",
    len(triangle_matches)
)

# All downstream geometry uses the triangle-verified candidates.
good_matches = triangle_matches

triangle_correspondence_image = cv2.drawMatches(
    moving,
    kp_moving,
    reference,
    kp_reference,
    good_matches,
    None,
    flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)

cv2.imwrite(
    str(
        OUTPUT_DIR /
        "05a_triangle_verified_correspondences.png"
    ),
    triangle_correspondence_image
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
Forward Lowe Matches : {len(forward_lowe_matches)}
Mutual SIFT Matches  : {len(lowe_matches)}
Triangle Verified    : {len(good_matches)}

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

    "Triangle Verified Correspondences",

    resize_for_display(
        triangle_correspondence_image
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
