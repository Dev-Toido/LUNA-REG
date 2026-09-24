"""
LUNA-REG V6.2
Image processing module.

V6 architecture:

TARGET + REFERENCE
        |
   +----+----+
   |         |
 SIFT      RIFT2
   |         |
RootSIFT  Phase Congruency
   |         |
matching  FAST + orientation
   |         |
   |        MIM descriptor
   |         |
   +----+----+
        |
 correspondence fusion
        |
 duplicate removal
        |
 MAGSAC++ / RANSAC
        |
 spatial validation
        |
 homography / affine
        |
 registration

Note:
The RIFT2 branch is a research-oriented Python implementation
following the structure of the supplied RIFT/RIFT2 material.
The phase-congruency implementation is not claimed to be
byte-for-byte identical to the original MATLAB PhasePack code.
"""

import cv2
import numpy as np

from input import (
    N_FEATURES,
    LOWE_RATIO,
    MIN_GOOD_MATCHES,
    MIN_INLIERS,
    MIN_INLIER_RATIO,
    RANSAC_THRESHOLD,
    RANSAC_CONFIDENCE,
    RANSAC_MAX_ITERS,
    SIFT_CONTRAST_THRESHOLD,
    SIFT_EDGE_THRESHOLD,
    SIFT_SIGMA,
    USE_CLAHE_FOR_SIFT,
    CLAHE_CLIP_LIMIT,
    CLAHE_TILE_GRID_SIZE,
    BLUR_KERNEL,
    USE_ROOTSIFT,

    RIFT2_SCALES,
    RIFT2_ORIENTATIONS,
    RIFT2_PATCH_SIZE,
    RIFT2_MAX_KEYPOINTS,
    RIFT2_DESCRIPTOR_GRID,
    RIFT2_DESCRIPTOR_BINS,
    RIFT2_MATCH_THRESHOLD,

    GRID_ROWS,
    GRID_COLS,
    MIN_SPATIAL_COVERAGE,
    MIN_HULL_COVERAGE,
    MAX_MEAN_REPROJECTION_ERROR,

    MAX_DISPLAY_WIDTH,
    MAX_DISPLAY_HEIGHT,

    HYBRID_GATE_ENABLED,
    HYBRID_GATE_ERROR,
    HYBRID_MIN_RIFT_INLIERS,
    HYBRID_MIN_GAIN,
    HYBRID_MAX_ERROR_INCREASE,
    HYBRID_MAX_COVERAGE_DROP,

    # ========================================================
    # CORRECT V6.2 RIFT2 CONFIGURATION NAMES
    # ========================================================
    RIFT2_INDEPENDENT_MIN_INLIERS,
    RIFT2_INDEPENDENT_MIN_INLIER_RATIO,
    RIFT2_INDEPENDENT_MAX_MEAN_ERROR,
    RIFT2_FUSION_GATE_ERROR,
)


# ============================================================
# BASIC
# ============================================================

def load_image(path):
    image = cv2.imread(
        str(path),
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise ValueError(
            f"Could not load image: {path}"
        )

    return image


def to_gray(image):
    if len(image.shape) == 2:
        return image

    return cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )


def resize_for_display(image):
    h, w = image.shape[:2]

    scale = min(
        1.0,
        MAX_DISPLAY_WIDTH / max(w, 1),
        MAX_DISPLAY_HEIGHT / max(h, 1),
    )

    if scale == 1.0:
        return image.copy()

    return cv2.resize(
        image,
        (
            int(w * scale),
            int(h * scale),
        ),
        interpolation=cv2.INTER_AREA,
    )


# ============================================================
# SIFT
# ============================================================

def preprocess_sift(image):
    gray = to_gray(image)

    if USE_CLAHE_FOR_SIFT:
        clahe = cv2.createCLAHE(
            clipLimit=CLAHE_CLIP_LIMIT,
            tileGridSize=CLAHE_TILE_GRID_SIZE,
        )

        gray = clahe.apply(gray)

    gray = cv2.GaussianBlur(
        gray,
        BLUR_KERNEL,
        0,
    )

    return gray


def rootsift(descriptors):
    if descriptors is None or len(descriptors) == 0:
        return descriptors

    d = descriptors.astype(np.float32)

    d /= np.maximum(
        np.sum(
            np.abs(d),
            axis=1,
            keepdims=True,
        ),
        1e-12,
    )

    d = np.sqrt(
        np.maximum(
            d,
            0.0,
        )
    )

    d /= np.maximum(
        np.linalg.norm(
            d,
            axis=1,
            keepdims=True,
        ),
        1e-12,
    )

    return d


def detect_sift(image):
    gray = preprocess_sift(image)

    sift = cv2.SIFT_create(
        nfeatures=N_FEATURES,
        contrastThreshold=SIFT_CONTRAST_THRESHOLD,
        edgeThreshold=SIFT_EDGE_THRESHOLD,
        sigma=SIFT_SIGMA,
    )

    keypoints, descriptors = sift.detectAndCompute(
        gray,
        None,
    )

    if USE_ROOTSIFT and descriptors is not None:
        descriptors = rootsift(descriptors)

    return keypoints, descriptors


def match_sift(
    desc_target,
    desc_reference,
):
    if (
        desc_target is None
        or desc_reference is None
    ):
        return [], 0

    if (
        len(desc_target) < 2
        or len(desc_reference) < 2
    ):
        return [], 0

    matcher = cv2.BFMatcher(
        cv2.NORM_L2,
        crossCheck=False,
    )

    knn = matcher.knnMatch(
        desc_target,
        desc_reference,
        k=2,
    )

    good = []

    for pair in knn:
        if len(pair) < 2:
            continue

        m, n = pair

        if m.distance < LOWE_RATIO * n.distance:
            good.append(m)

    return good, len(knn)


# ============================================================
# RIFT2-STYLE PHASE CONGRUENCY
# ============================================================

def log_gabor_kernel(
    size,
    wavelength,
    sigma_on_f,
):
    h, w = size

    fy = np.fft.fftfreq(h)
    fx = np.fft.fftfreq(w)

    fx, fy = np.meshgrid(
        fx,
        fy,
    )

    radius = np.sqrt(
        fx * fx + fy * fy
    )

    radius[0, 0] = 1.0

    f0 = 1.0 / max(
        float(wavelength),
        1.0,
    )

    radial = np.exp(
        -(
            np.log(
                radius / max(
                    f0,
                    1e-8,
                )
            ) ** 2
        )
        /
        (
            2.0
            *
            np.log(
                max(
                    sigma_on_f,
                    1e-4,
                )
            ) ** 2
        )
    )

    radial[0, 0] = 0.0

    return radial


def phase_congruency_maps(gray):
    """
    Approximate phase-congruency maps.

    Structure:
        grayscale
        -> multi-scale log-Gabor responses
        -> local energy
        -> orientation aggregation
        -> maximum-moment-like saliency map
    """

    image = (
        gray.astype(np.float32)
        / 255.0
    )

    h, w = image.shape

    F = np.fft.fftshift(
        np.fft.fft2(image)
    )

    energy = []

    min_wave = 3.0
    mult = 1.6
    sigma_on_f = 0.75

    yy, xx = np.mgrid[
        0:h,
        0:w,
    ]

    cy = (h - 1) / 2.0
    cx = (w - 1) / 2.0

    angle = np.arctan2(
        -(yy - cy),
        xx - cx,
    )

    for s in range(RIFT2_SCALES):

        wavelength = (
            min_wave
            * (mult ** s)
        )

        radial = np.fft.fftshift(
            log_gabor_kernel(
                (h, w),
                wavelength,
                sigma_on_f,
            )
        )

        for o in range(
            RIFT2_ORIENTATIONS
        ):

            direction = (
                o
                * np.pi
                / RIFT2_ORIENTATIONS
            )

            angular = np.maximum(
                np.cos(
                    angle - direction
                ),
                0.0,
            ) ** 4

            response = np.fft.ifft2(
                np.fft.ifftshift(
                    F
                    * radial
                    * angular
                )
            )

            even = np.real(response)
            odd = np.imag(response)

            amplitude = np.sqrt(
                even * even
                + odd * odd
            )

            energy.append(
                amplitude.astype(
                    np.float32
                )
            )

    stack = np.stack(
        energy,
        axis=0,
    )

    local_energy = cv2.GaussianBlur(
        np.mean(
            stack,
            axis=0,
        ),
        (5, 5),
        0,
    )

    orientation_stack = np.stack(
        [
            np.mean(
                stack[
                    o::RIFT2_ORIENTATIONS
                ],
                axis=0,
            )
            for o in range(
                RIFT2_ORIENTATIONS
            )
        ],
        axis=0,
    )

    max_moment = (
        np.max(
            orientation_stack,
            axis=0,
        )
        -
        np.min(
            orientation_stack,
            axis=0,
        )
    )

    pc = (
        local_energy
        *
        (
            0.5
            + np.maximum(
                max_moment,
                0,
            )
        )
    )

    pc -= pc.min()

    if pc.max() > 1e-12:
        pc /= pc.max()

    return pc.astype(
        np.float32
    )


def detect_rift2_keypoints(image):
    gray = to_gray(image)

    pc = phase_congruency_maps(
        gray
    )

    pc_u8 = np.uint8(
        np.clip(
            pc * 255.0,
            0,
            255,
        )
    )

    fast = cv2.FastFeatureDetector_create(
        threshold=10,
        nonmaxSuppression=True,
    )

    keypoints = fast.detect(
        pc_u8,
        None,
    )

    keypoints = sorted(
        keypoints,
        key=lambda k: k.response,
        reverse=True,
    )

    half = (
        RIFT2_PATCH_SIZE
        // 2
    )

    valid = []

    h, w = gray.shape

    for kp in keypoints:

        x = int(
            round(kp.pt[0])
        )

        y = int(
            round(kp.pt[1])
        )

        if (
            x - half >= 0
            and y - half >= 0
            and x + half < w
            and y + half < h
        ):
            valid.append(kp)

        if (
            len(valid)
            >= RIFT2_MAX_KEYPOINTS
        ):
            break

    return valid, pc


def estimate_orientation(
    gray,
    kp,
):
    half = (
        RIFT2_PATCH_SIZE
        // 2
    )

    x = int(
        round(kp.pt[0])
    )

    y = int(
        round(kp.pt[1])
    )

    patch = gray[
        y-half:y+half,
        x-half:x+half,
    ]

    if patch.size == 0:
        return 0.0

    gx = cv2.Sobel(
        patch,
        cv2.CV_32F,
        1,
        0,
        3,
    )

    gy = cv2.Sobel(
        patch,
        cv2.CV_32F,
        0,
        1,
        3,
    )

    mag, angle = cv2.cartToPolar(
        gx,
        gy,
        angleInDegrees=True,
    )

    hist, edges = np.histogram(
        angle.ravel(),
        bins=24,
        range=(0, 360),
        weights=mag.ravel(),
    )

    i = int(
        np.argmax(hist)
    )

    return float(
        (
            edges[i]
            + edges[i + 1]
        )
        / 2.0
    )


def rift2_descriptor(
    gray,
    kp,
    orientation,
):
    """
    RIFT2-style MIM descriptor.

    6 x 6 spatial cells x 6 index bins = 216 dimensions.
    """

    half = (
        RIFT2_PATCH_SIZE
        // 2
    )

    x = int(
        round(kp.pt[0])
    )

    y = int(
        round(kp.pt[1])
    )

    patch = gray[
        y-half:y+half,
        x-half:x+half,
    ]

    if patch.shape != (
        RIFT2_PATCH_SIZE,
        RIFT2_PATCH_SIZE,
    ):
        return None

    M = cv2.getRotationMatrix2D(
        (
            half,
            half,
        ),
        -orientation,
        1.0,
    )

    patch = cv2.warpAffine(
        patch,
        M,
        (
            RIFT2_PATCH_SIZE,
            RIFT2_PATCH_SIZE,
        ),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT101,
    )

    patch = (
        patch.astype(np.float32)
        / 255.0
    )

    H, W = patch.shape

    F = np.fft.fftshift(
        np.fft.fft2(patch)
    )

    responses = np.zeros(
        (
            RIFT2_DESCRIPTOR_BINS,
            H,
            W,
        ),
        dtype=np.float32,
    )

    yy, xx = np.mgrid[
        0:H,
        0:W,
    ]

    cy = (H - 1) / 2.0
    cx = (W - 1) / 2.0

    theta = np.arctan2(
        -(yy - cy),
        xx - cx,
    )

    for s in range(
        RIFT2_SCALES
    ):

        wavelength = (
            3.0
            * (1.6 ** s)
        )

        radial = np.fft.fftshift(
            log_gabor_kernel(
                (
                    H,
                    W,
                ),
                wavelength,
                0.75,
            )
        )

        for o in range(
            RIFT2_DESCRIPTOR_BINS
        ):

            angular = np.maximum(
                np.cos(
                    theta
                    -
                    o
                    * np.pi
                    / RIFT2_DESCRIPTOR_BINS
                ),
                0.0,
            ) ** 4

            response = np.fft.ifft2(
                np.fft.ifftshift(
                    F
                    * radial
                    * angular
                )
            )

            responses[o] += np.abs(
                response
            ).astype(
                np.float32
            )

    mim = np.argmax(
        responses,
        axis=0,
    )

    descriptor = []

    ys = np.linspace(
        0,
        H,
        RIFT2_DESCRIPTOR_GRID + 1,
        dtype=int,
    )

    xs = np.linspace(
        0,
        W,
        RIFT2_DESCRIPTOR_GRID + 1,
        dtype=int,
    )

    for gy in range(
        RIFT2_DESCRIPTOR_GRID
    ):

        for gx in range(
            RIFT2_DESCRIPTOR_GRID
        ):

            cell = mim[
                ys[gy]:ys[gy+1],
                xs[gx]:xs[gx+1],
            ]

            hist = np.bincount(
                cell.ravel(),
                minlength=RIFT2_DESCRIPTOR_BINS,
            ).astype(
                np.float32
            )

            hist /= max(
                float(hist.sum()),
                1.0,
            )

            descriptor.extend(
                hist.tolist()
            )

    d = np.asarray(
        descriptor,
        dtype=np.float32,
    )

    d /= max(
        float(
            np.linalg.norm(d)
        ),
        1e-12,
    )

    return d


def describe_rift2(
    image,
    keypoints,
):
    gray = to_gray(image)

    descriptors = []
    valid_keypoints = []

    for kp in keypoints:

        angle = estimate_orientation(
            gray,
            kp,
        )

        kp.angle = angle

        d = rift2_descriptor(
            gray,
            kp,
            angle,
        )

        if d is not None:

            valid_keypoints.append(kp)
            descriptors.append(d)

    if not descriptors:
        return (
            valid_keypoints,
            None,
        )

    return (
        valid_keypoints,
        np.asarray(
            descriptors,
            dtype=np.float32,
        ),
    )


def detect_and_describe_rift2(
    image,
):
    keypoints, pc = (
        detect_rift2_keypoints(
            image
        )
    )

    keypoints, descriptors = (
        describe_rift2(
            image,
            keypoints,
        )
    )

    return (
        keypoints,
        descriptors,
        pc,
    )


def match_rift2(
    desc_target,
    desc_reference,
):
    """
    RIFT2-style nearest-neighbor matching followed by
    unique-reference filtering.
    """

    if (
        desc_target is None
        or desc_reference is None
    ):
        return [], 0

    if (
        len(desc_target) == 0
        or len(desc_reference) == 0
    ):
        return [], 0

    matcher = cv2.BFMatcher(
        cv2.NORM_L2,
        crossCheck=False,
    )

    knn = matcher.knnMatch(
        desc_target,
        desc_reference,
        k=1,
    )

    candidates = []

    for pair in knn:

        if not pair:
            continue

        m = pair[0]

        if (
            m.distance
            <= RIFT2_MATCH_THRESHOLD
        ):
            candidates.append(m)

    best = {}

    for m in candidates:

        old = best.get(
            m.trainIdx
        )

        if (
            old is None
            or m.distance < old.distance
        ):
            best[m.trainIdx] = m

    matches = sorted(
        best.values(),
        key=lambda m: m.distance,
    )

    return (
        matches,
        len(knn),
    )


# ============================================================
# FUSION
# ============================================================

def matches_to_points(
    target_kp,
    reference_kp,
    matches,
):
    src = np.float32(
        [
            target_kp[m.queryIdx].pt
            for m in matches
        ]
    )

    dst = np.float32(
        [
            reference_kp[m.trainIdx].pt
            for m in matches
        ]
    )

    return src, dst


def fuse_correspondences(
    sift_src,
    sift_dst,
    rift_src,
    rift_dst,
):
    src_parts = []
    dst_parts = []
    labels = []

    if len(sift_src):
        src_parts.append(sift_src)
        dst_parts.append(sift_dst)

        labels.extend(
            ["SIFT"] * len(sift_src)
        )

    if len(rift_src):
        src_parts.append(rift_src)
        dst_parts.append(rift_dst)

        labels.extend(
            ["RIFT2"] * len(rift_src)
        )

    if not src_parts:
        return (
            np.empty(
                (0, 2),
                np.float32,
            ),
            np.empty(
                (0, 2),
                np.float32,
            ),
            [],
            0,
        )

    src = np.vstack(
        src_parts
    ).astype(
        np.float32
    )

    dst = np.vstack(
        dst_parts
    ).astype(
        np.float32
    )

    before = len(src)

    seen = {}
    keep = []

    for i, (s, d) in enumerate(
        zip(src, dst)
    ):

        key = (
            round(float(s[0])),
            round(float(s[1])),
            round(float(d[0])),
            round(float(d[1])),
        )

        if key not in seen:
            seen[key] = i
            keep.append(i)

    keep = np.asarray(
        keep,
        dtype=int,
    )

    return (
        src[keep],
        dst[keep],
        [
            labels[i]
            for i in keep
        ],
        before - len(keep),
    )


# ============================================================
# GEOMETRY
# ============================================================

def estimate_homography(
    src,
    dst,
    method,
):
    if len(src) < 4:
        return None, None

    return cv2.findHomography(
        src,
        dst,
        method,
        RANSAC_THRESHOLD,
        None,
        RANSAC_MAX_ITERS,
        RANSAC_CONFIDENCE,
    )


def estimate_affine(
    src,
    dst,
):
    if len(src) < 3:
        return None, None

    return cv2.estimateAffine2D(
        src,
        dst,
        method=cv2.RANSAC,
        ransacReprojThreshold=RANSAC_THRESHOLD,
        maxIters=RANSAC_MAX_ITERS,
        confidence=RANSAC_CONFIDENCE,
        refineIters=10,
    )


def project_points(
    src,
    model,
    model_type,
):
    if model_type == "AFFINE":
        return cv2.transform(
            src.reshape(-1, 1, 2),
            model,
        ).reshape(-1, 2)

    return cv2.perspectiveTransform(
        src.reshape(-1, 1, 2),
        model,
    ).reshape(-1, 2)


def model_metrics(
    src,
    dst,
    model,
    model_type,
    mask,
):
    if (
        model is None
        or mask is None
    ):
        return {
            "inliers": 0,
            "outliers": len(src),
            "inlier_ratio": 0.0,
            "mean_error": float("inf"),
            "median_error": float("inf"),
            "max_error": float("inf"),
        }

    inlier_mask = (
        mask.ravel()
        .astype(bool)
    )

    if not np.any(inlier_mask):
        return {
            "inliers": 0,
            "outliers": len(src),
            "inlier_ratio": 0.0,
            "mean_error": float("inf"),
            "median_error": float("inf"),
            "max_error": float("inf"),
        }

    predicted = project_points(
        src[inlier_mask],
        model,
        model_type,
    )

    errors = np.linalg.norm(
        predicted
        - dst[inlier_mask],
        axis=1,
    )

    return {
        "inliers": int(
            inlier_mask.sum()
        ),
        "outliers": int(
            len(src)
            - inlier_mask.sum()
        ),
        "inlier_ratio": float(
            100.0
            * inlier_mask.sum()
            / max(len(src), 1)
        ),
        "mean_error": float(
            errors.mean()
        ),
        "median_error": float(
            np.median(errors)
        ),
        "max_error": float(
            errors.max()
        ),
    }


def estimate_candidates(
    src,
    dst,
):
    candidates = {}

    H, mask = estimate_homography(
        src,
        dst,
        cv2.RANSAC,
    )

    candidates[
        "RANSAC_HOMOGRAPHY"
    ] = {
        "model": H,
        "mask": mask,
        "type": "HOMOGRAPHY",
        "metrics": model_metrics(
            src,
            dst,
            H,
            "HOMOGRAPHY",
            mask,
        ),
    }

    if hasattr(
        cv2,
        "USAC_MAGSAC",
    ):

        Hm, mm = estimate_homography(
            src,
            dst,
            cv2.USAC_MAGSAC,
        )

        candidates[
            "MAGSAC_HOMOGRAPHY"
        ] = {
            "model": Hm,
            "mask": mm,
            "type": "HOMOGRAPHY",
            "metrics": model_metrics(
                src,
                dst,
                Hm,
                "HOMOGRAPHY",
                mm,
            ),
        }

    A, ma = estimate_affine(
        src,
        dst,
    )

    candidates[
        "AFFINE_RANSAC"
    ] = {
        "model": A,
        "mask": ma,
        "type": "AFFINE",
        "metrics": model_metrics(
            src,
            dst,
            A,
            "AFFINE",
            ma,
        ),
    }

    return candidates


# ============================================================
# SPATIAL VALIDATION
# ============================================================

def spatial_coverage(
    points,
    shape,
):
    h, w = shape[:2]

    grid = np.zeros(
        (
            GRID_ROWS,
            GRID_COLS,
        ),
        dtype=np.int32,
    )

    for x, y in points:

        c = min(
            GRID_COLS - 1,
            max(
                0,
                int(
                    float(x)
                    / max(w, 1)
                    * GRID_COLS
                ),
            ),
        )

        r = min(
            GRID_ROWS - 1,
            max(
                0,
                int(
                    float(y)
                    / max(h, 1)
                    * GRID_ROWS
                ),
            ),
        )

        grid[r, c] += 1

    occupied = int(
        np.sum(grid > 0)
    )

    total = (
        GRID_ROWS
        * GRID_COLS
    )

    return {
        "occupied": occupied,
        "total": total,
        "percent": (
            100.0
            * occupied
            / total
        ),
        "grid": grid.tolist(),
    }


def hull_coverage(
    points,
    shape,
):
    if len(points) < 3:
        return 0.0

    h, w = shape[:2]

    hull = cv2.convexHull(
        np.asarray(
            points,
            np.float32,
        ).reshape(
            -1,
            1,
            2,
        )
    )

    area = cv2.contourArea(
        hull
    )

    return float(
        100.0
        * area
        / max(
            w * h,
            1,
        )
    )


def uniformity(
    points,
    shape,
):
    coverage = spatial_coverage(
        points,
        shape,
    )

    counts = np.asarray(
        coverage["grid"],
        dtype=np.float32,
    ).ravel()

    nonzero = counts[
        counts > 0
    ]

    if len(nonzero) == 0:
        return 0.0

    cv = float(
        nonzero.std()
        /
        max(
            nonzero.mean(),
            1e-12,
        )
    )

    return float(
        100.0
        /
        (1.0 + cv)
    )


def validate(
    src,
    dst,
    shape_t,
    shape_r,
    metrics,
):
    tc = spatial_coverage(
        src,
        shape_t,
    )

    rc = spatial_coverage(
        dst,
        shape_r,
    )

    th = hull_coverage(
        src,
        shape_t,
    )

    rh = hull_coverage(
        dst,
        shape_r,
    )

    tu = uniformity(
        src,
        shape_t,
    )

    ru = uniformity(
        dst,
        shape_r,
    )

    avg_cov = (
        tc["percent"]
        + rc["percent"]
    ) / 2.0

    avg_hull = (
        th + rh
    ) / 2.0

    valid = (
        metrics["inliers"]
        >= MIN_INLIERS

        and
        metrics["inlier_ratio"]
        >= MIN_INLIER_RATIO

        and
        avg_cov
        >= MIN_SPATIAL_COVERAGE

        and
        avg_hull
        >= MIN_HULL_COVERAGE

        and
        metrics["mean_error"]
        <= MAX_MEAN_REPROJECTION_ERROR
    )

    return {
        "valid": bool(valid),
        "target_coverage": tc,
        "reference_coverage": rc,
        "target_hull_coverage": th,
        "reference_hull_coverage": rh,
        "target_uniformity": tu,
        "reference_uniformity": ru,
        "average_coverage": avg_cov,
        "average_hull_coverage": avg_hull,
    }


def choose_model(
    candidates,
    src,
    dst,
    shape_t,
    shape_r,
):
    best = None
    best_score = -1e30

    for name, item in candidates.items():

        mask = item["mask"]
        model = item["model"]

        if (
            mask is None
            or model is None
        ):
            continue

        m = item["metrics"]

        inlier_mask = (
            mask.ravel()
            .astype(bool)
        )

        validation = validate(
            src[inlier_mask],
            dst[inlier_mask],
            shape_t,
            shape_r,
            m,
        )

        item["validation"] = validation

        error_term = (
            1.0
            /
            max(
                m["mean_error"],
                0.1,
            )
            if np.isfinite(
                m["mean_error"]
            )
            else 0.0
        )

        score = (
            0.40
            * m["inlier_ratio"]

            +
            0.25
            * validation[
                "average_coverage"
            ]

            +
            0.15
            * validation[
                "average_hull_coverage"
            ]

            +
            10.0
            * error_term
        )

        item["score"] = float(
            score
        )

        if validation["valid"]:

            if (
                best is None
                or
                not candidates[
                    best
                ]["validation"]["valid"]
                or
                score > best_score
            ):
                best = name
                best_score = score

        elif (
            best is None
            and score > best_score
        ):
            best = name
            best_score = score

    return best


def refine_model(
    src,
    dst,
    item,
):
    mask = item["mask"]

    if mask is None:
        return item

    good = (
        mask.ravel()
        .astype(bool)
    )

    if (
        good.sum()
        < MIN_INLIERS
    ):
        return item

    if item["type"] == "AFFINE":

        model, _ = cv2.estimateAffine2D(
            src[good],
            dst[good],
            method=cv2.RANSAC,
            ransacReprojThreshold=RANSAC_THRESHOLD,
            maxIters=RANSAC_MAX_ITERS,
            confidence=RANSAC_CONFIDENCE,
            refineIters=10,
        )

    else:

        model, _ = cv2.findHomography(
            src[good],
            dst[good],
            0,
        )

    if model is not None:
        item["model"] = model

    refined = project_points(
        src[good],
        item["model"],
        item["type"],
    )

    errors = np.linalg.norm(
        refined
        - dst[good],
        axis=1,
    )

    item[
        "refined_mean_error"
    ] = float(
        errors.mean()
    )

    item[
        "refined_median_error"
    ] = float(
        np.median(errors)
    )

    item[
        "refined_max_error"
    ] = float(
        errors.max()
    )

    return item


# ============================================================
# VISUALIZATION
# ============================================================

def draw_keypoints(
    image,
    keypoints,
    title,
):
    out = cv2.drawKeypoints(
        image.copy(),
        keypoints,
        None,
        flags=(
            cv2.DRAW_MATCHES_FLAGS_DEFAULT
            .DRAW_RICH_KEYPOINTS
        ),
    )

    cv2.putText(
        out,
        title,
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return resize_for_display(
        out
    )


def draw_matches(
    target,
    reference,
    target_kp,
    reference_kp,
    matches,
    title,
):
    th, tw = target.shape[:2]
    rh, rw = reference.shape[:2]

    canvas = np.zeros(
        (
            max(th, rh),
            tw + rw,
            3,
        ),
        dtype=np.uint8,
    )

    canvas[
        :th,
        :tw
    ] = target

    canvas[
        :rh,
        tw:tw+rw
    ] = reference

    for m in matches:

        p1 = tuple(
            np.round(
                target_kp[
                    m.queryIdx
                ].pt
            ).astype(int)
        )

        p2 = tuple(
            np.round(
                reference_kp[
                    m.trainIdx
                ].pt
            ).astype(int)
        )

        p2 = (
            p2[0] + tw,
            p2[1],
        )

        cv2.line(
            canvas,
            p1,
            p2,
            (0, 255, 0),
            1,
            cv2.LINE_AA,
        )

        cv2.circle(
            canvas,
            p1,
            3,
            (255, 0, 0),
            -1,
        )

        cv2.circle(
            canvas,
            p2,
            3,
            (0, 0, 255),
            -1,
        )

    cv2.putText(
        canvas,
        title,
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return resize_for_display(
        canvas
    )


def draw_coordinate_inliers(
    target,
    reference,
    src,
    dst,
    mask,
    title,
):
    target_kp = [
        cv2.KeyPoint(
            float(x),
            float(y),
            4,
        )
        for x, y in src
    ]

    reference_kp = [
        cv2.KeyPoint(
            float(x),
            float(y),
            4,
        )
        for x, y in dst
    ]

    class M:
        pass

    matches = []

    for i, flag in enumerate(mask):

        if flag:

            m = M()

            m.queryIdx = i
            m.trainIdx = i

            matches.append(m)

    return draw_matches(
        target,
        reference,
        target_kp,
        reference_kp,
        matches,
        title,
    )


def draw_coverage(
    points,
    shape,
    title,
):
    h, w = shape[:2]

    canvas = np.zeros(
        (
            h,
            w,
            3,
        ),
        dtype=np.uint8,
    )

    for r in range(
        GRID_ROWS + 1
    ):

        y = int(
            r * h / GRID_ROWS
        )

        cv2.line(
            canvas,
            (0, y),
            (w, y),
            (100, 100, 100),
            1,
        )

    for c in range(
        GRID_COLS + 1
    ):

        x = int(
            c * w / GRID_COLS
        )

        cv2.line(
            canvas,
            (x, 0),
            (x, h),
            (100, 100, 100),
            1,
        )

    for x, y in points:

        cv2.circle(
            canvas,
            (
                int(x),
                int(y),
            ),
            4,
            (0, 255, 0),
            -1,
        )

    cv2.putText(
        canvas,
        title,
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return resize_for_display(
        canvas
    )


# ============================================================
# CONSERVATIVE MODEL SELECTION
# ============================================================

def select_baseline_model(
    candidates,
    src,
    dst,
    shape_t,
    shape_r,
):
    names = [
        n
        for n in (
            "MAGSAC_HOMOGRAPHY",
            "RANSAC_HOMOGRAPHY",
            "AFFINE_RANSAC",
        )
        if n in candidates
    ]

    evaluated = []

    for name in names:

        item = candidates[name]

        model = item.get(
            "model"
        )

        mask = item.get(
            "mask"
        )

        if (
            model is None
            or mask is None
        ):
            continue

        m = item["metrics"]

        good = (
            mask.ravel()
            .astype(bool)
        )

        validation = validate(
            src[good],
            dst[good],
            shape_t,
            shape_r,
            m,
        )

        item[
            "validation"
        ] = validation

        item[
            "baseline_valid"
        ] = bool(
            validation["valid"]
        )

        evaluated.append(
            (
                name,
                item,
            )
        )

    if not evaluated:
        return None

    valid = [
        x
        for x in evaluated
        if x[1]["baseline_valid"]
    ]

    pool = (
        valid
        if valid
        else evaluated
    )

    hom = [
        x
        for x in pool
        if x[1]["type"]
        == "HOMOGRAPHY"
    ]

    if hom:
        pool = hom

    pool.sort(
        key=lambda x: (
            x[1]["metrics"][
                "inliers"
            ],
            x[1]["metrics"][
                "inlier_ratio"
            ],
            -x[1]["metrics"][
                "mean_error"
            ],
        ),
        reverse=True,
    )

    selected_name, selected = pool[0]

    return selected_name


def model_inlier_points(
    src,
    dst,
    item,
):
    mask = item.get(
        "mask"
    )

    if mask is None:
        return (
            np.empty(
                (0, 2),
                np.float32,
            ),
            np.empty(
                (0, 2),
                np.float32,
            ),
        )

    good = (
        mask.ravel()
        .astype(bool)
    )

    return (
        src[good],
        dst[good],
    )


def filter_by_model(
    src,
    dst,
    model,
    model_type,
    threshold,
):
    if (
        model is None
        or len(src) == 0
    ):
        return (
            np.zeros(
                len(src),
                dtype=bool,
            ),
            np.full(
                len(src),
                np.inf,
                dtype=np.float32,
            ),
        )

    predicted = project_points(
        src,
        model,
        model_type,
    )

    errors = np.linalg.norm(
        predicted - dst,
        axis=1,
    )

    return (
        errors <= threshold,
        errors,
    )


def summarize_source_inliers(
    src,
    dst,
    labels,
    item,
):
    mask = item.get(
        "mask"
    )

    if mask is None:
        return 0, 0

    good = (
        mask.ravel()
        .astype(bool)
    )

    inlier_labels = [
        labels[i]
        for i, flag
        in enumerate(good)
        if flag
    ]

    return (
        sum(
            x == "SIFT"
            for x in inlier_labels
        ),
        sum(
            x == "RIFT2"
            for x in inlier_labels
        ),
    )


# ============================================================
# RESULT BASE
# ============================================================

def build_result_base(
    mode,
    sift_t_kp,
    sift_r_kp,
    rift_t_kp,
    rift_r_kp,
    sift_candidates,
    rift_candidates,
    sift_matches,
    rift_matches,
    fused_count,
    duplicates_removed,
):
    return {
        "mode": mode,

        "target_keypoints_sift":
            len(sift_t_kp),

        "reference_keypoints_sift":
            len(sift_r_kp),

        "target_keypoints_rift2":
            len(rift_t_kp),

        "reference_keypoints_rift2":
            len(rift_r_kp),

        "sift_candidate_matches":
            sift_candidates,

        "rift2_candidate_matches":
            rift_candidates,

        "sift_matches":
            len(sift_matches),

        "rift2_matches":
            len(rift_matches),

        "fused_matches":
            fused_count,

        "duplicate_matches_removed":
            duplicates_removed,
    }


# ============================================================
# V6.2 PIPELINE
# ============================================================

def process_images(
    target_image,
    reference_image,
    mode="SIFT",
):
    """
    V6.2 pipeline.

    SIFT and RIFT2 are evaluated independently first.

    HYBRID:

      1. Build a SIFT baseline geometry.
      2. Build an independent RIFT2 geometry.
      3. Keep only RIFT2 inliers.
      4. Gate those RIFT2 inliers against the SIFT baseline.
      5. Fuse only the surviving RIFT2 points.
      6. Re-estimate final geometry.
      7. If fusion is not an improvement,
         fall back to SIFT.
    """

    mode = mode.upper()

    if mode not in {
        "SIFT",
        "RIFT2",
        "HYBRID",
    }:
        raise ValueError(
            "MATCHING_MODE must be SIFT, RIFT2, or HYBRID."
        )

    # ========================================================
    # 1. DETECT + DESCRIBE
    # ========================================================

    sift_t_kp = []
    sift_t_desc = None

    sift_r_kp = []
    sift_r_desc = None

    sift_matches = []
    sift_candidates = 0

    if mode in {
        "SIFT",
        "HYBRID",
    }:

        sift_t_kp, sift_t_desc = detect_sift(
            target_image
        )

        sift_r_kp, sift_r_desc = detect_sift(
            reference_image
        )

        sift_matches, sift_candidates = match_sift(
            sift_t_desc,
            sift_r_desc,
        )

    rift_t_kp = []
    rift_t_desc = None

    rift_r_kp = []
    rift_r_desc = None

    rift_matches = []
    rift_candidates = 0

    target_pc = None
    reference_pc = None

    if mode in {
        "RIFT2",
        "HYBRID",
    }:

        (
            rift_t_kp,
            rift_t_desc,
            target_pc,
        ) = detect_and_describe_rift2(
            target_image
        )

        (
            rift_r_kp,
            rift_r_desc,
            reference_pc,
        ) = detect_and_describe_rift2(
            reference_image
        )

        rift_matches, rift_candidates = match_rift2(
            rift_t_desc,
            rift_r_desc,
        )

    # ========================================================
    # 2. COORDINATES
    # ========================================================

    empty = np.empty(
        (0, 2),
        dtype=np.float32,
    )

    sift_src = empty.copy()
    sift_dst = empty.copy()

    rift_src = empty.copy()
    rift_dst = empty.copy()

    if sift_matches:

        sift_src, sift_dst = matches_to_points(
            sift_t_kp,
            sift_r_kp,
            sift_matches,
        )

    if rift_matches:

        rift_src, rift_dst = matches_to_points(
            rift_t_kp,
            rift_r_kp,
            rift_matches,
        )

    # ========================================================
    # 3. INDEPENDENT SIFT GEOMETRY
    # ========================================================

    sift_candidates_geom = {}
    sift_selected_name = None
    sift_selected = None

    if (
        len(sift_src)
        >= MIN_GOOD_MATCHES
    ):

        sift_candidates_geom = estimate_candidates(
            sift_src,
            sift_dst,
        )

        sift_selected_name = select_baseline_model(
            sift_candidates_geom,
            sift_src,
            sift_dst,
            target_image.shape,
            reference_image.shape,
        )

        if sift_selected_name is not None:

            sift_selected = refine_model(
                sift_src,
                sift_dst,
                sift_candidates_geom[
                    sift_selected_name
                ],
            )

    # ========================================================
    # 4. INDEPENDENT RIFT2 GEOMETRY
    # ========================================================

    rift_candidates_geom = {}
    rift_selected_name = None
    rift_selected = None

    rift_independent_valid = False

    if (
        len(rift_src)
        >= MIN_GOOD_MATCHES
    ):

        rift_candidates_geom = estimate_candidates(
            rift_src,
            rift_dst,
        )

        rift_selected_name = select_baseline_model(
            rift_candidates_geom,
            rift_src,
            rift_dst,
            target_image.shape,
            reference_image.shape,
        )

        if rift_selected_name is not None:

            rift_selected = refine_model(
                rift_src,
                rift_dst,
                rift_candidates_geom[
                    rift_selected_name
                ],
            )

            rm = rift_selected[
                "metrics"
            ]

            rmask = rift_selected[
                "mask"
            ]

            if rmask is not None:

                rgood = (
                    rmask.ravel()
                    .astype(bool)
                )

                rift_validation = validate(
                    rift_src[rgood],
                    rift_dst[rgood],
                    target_image.shape,
                    reference_image.shape,
                    rm,
                )

                # =================================================
                # IMPORTANT V6.2 FIX
                # Use the variable names actually defined
                # in input.py.
                # =================================================

                rift_independent_valid = bool(
                    rm["inliers"]
                    >=
                    RIFT2_INDEPENDENT_MIN_INLIERS

                    and

                    rm["inlier_ratio"]
                    >=
                    RIFT2_INDEPENDENT_MIN_INLIER_RATIO

                    and

                    rm["mean_error"]
                    <=
                    RIFT2_INDEPENDENT_MAX_MEAN_ERROR

                    and

                    rift_validation[
                        "average_coverage"
                    ]
                    >=
                    MIN_SPATIAL_COVERAGE
                )

            else:
                rift_validation = {}

        else:
            rift_validation = {}

    else:
        rift_validation = {}

    # ========================================================
    # 5. FINAL CORRESPONDENCE POOL
    # ========================================================

    used_src = sift_src.copy()
    used_dst = sift_dst.copy()

    used_labels = [
        "SIFT"
    ] * len(sift_src)

    hybrid_added_rift = 0
    hybrid_rejected_rift = 0

    duplicate_matches_removed = 0

    rift_gate_errors = []

    if mode == "RIFT2":

        used_src = rift_src.copy()
        used_dst = rift_dst.copy()

        used_labels = [
            "RIFT2"
        ] * len(rift_src)

    elif mode == "HYBRID":

        if (
            rift_independent_valid
            and
            rift_selected is not None
        ):

            rmask = (
                rift_selected[
                    "mask"
                ]
                .ravel()
                .astype(bool)
            )

            verified_src = rift_src[
                rmask
            ]

            verified_dst = rift_dst[
                rmask
            ]

            if (
                sift_selected is not None
                and
                sift_selected.get(
                    "model"
                ) is not None
            ):

                gate_mask, gate_errors = filter_by_model(
                    verified_src,
                    verified_dst,
                    sift_selected["model"],
                    sift_selected["type"],
                    RIFT2_FUSION_GATE_ERROR,
                )

                rift_gate_errors = (
                    gate_errors.tolist()
                )

                accepted_rift_src = (
                    verified_src[
                        gate_mask
                    ]
                )

                accepted_rift_dst = (
                    verified_dst[
                        gate_mask
                    ]
                )

                hybrid_rejected_rift = int(
                    np.sum(
                        ~gate_mask
                    )
                )

            else:

                accepted_rift_src = (
                    verified_src
                )

                accepted_rift_dst = (
                    verified_dst
                )

            if (
                len(
                    accepted_rift_src
                )
                >=
                HYBRID_MIN_RIFT_INLIERS
            ):

                used_src = np.vstack(
                    [
                        sift_src,
                        accepted_rift_src,
                    ]
                ).astype(
                    np.float32
                )

                used_dst = np.vstack(
                    [
                        sift_dst,
                        accepted_rift_dst,
                    ]
                ).astype(
                    np.float32
                )

                used_labels = (
                    ["SIFT"]
                    * len(sift_src)
                    +
                    ["RIFT2"]
                    * len(
                        accepted_rift_src
                    )
                )

                hybrid_added_rift = len(
                    accepted_rift_src
                )

            else:

                hybrid_rejected_rift += len(
                    accepted_rift_src
                )

        else:

            hybrid_rejected_rift = len(
                rift_src
            )

    # ========================================================
    # 6. DUPLICATE REMOVAL
    # ========================================================

    if len(used_src):

        before = len(
            used_src
        )

        seen = set()
        keep = []

        for i, (
            src_pt,
            dst_pt,
        ) in enumerate(
            zip(
                used_src,
                used_dst,
            )
        ):

            key = (
                round(
                    float(
                        src_pt[0]
                    ),
                    1,
                ),
                round(
                    float(
                        src_pt[1]
                    ),
                    1,
                ),
                round(
                    float(
                        dst_pt[0]
                    ),
                    1,
                ),
                round(
                    float(
                        dst_pt[1]
                    ),
                    1,
                ),
            )

            if key not in seen:

                seen.add(key)
                keep.append(i)

        keep = np.asarray(
            keep,
            dtype=int,
        )

        used_src = used_src[
            keep
        ]

        used_dst = used_dst[
            keep
        ]

        used_labels = [
            used_labels[i]
            for i in keep
        ]

        duplicate_matches_removed = (
            before
            - len(keep)
        )

    # ========================================================
    # 7. FINAL GEOMETRY
    # ========================================================

    final_candidates = {}

    if (
        len(used_src)
        >= MIN_GOOD_MATCHES
    ):

        final_candidates = estimate_candidates(
            used_src,
            used_dst,
        )

    selected_name = None
    selected = None

    if final_candidates:

        selected_name = select_baseline_model(
            final_candidates,
            used_src,
            used_dst,
            target_image.shape,
            reference_image.shape,
        )

        if selected_name is not None:

            selected = refine_model(
                used_src,
                used_dst,
                final_candidates[
                    selected_name
                ],
            )

    # ========================================================
    # 8. SIFT BASELINE METRICS
    # ========================================================

    sift_inliers = 0
    sift_inlier_ratio = 0.0

    sift_mean_error = float(
        "inf"
    )

    sift_validation = {}

    if sift_selected is not None:

        sm = sift_selected[
            "metrics"
        ]

        sift_inliers = sm[
            "inliers"
        ]

        sift_inlier_ratio = sm[
            "inlier_ratio"
        ]

        sift_mean_error = (
            sift_selected.get(
                "refined_mean_error",
                sm["mean_error"],
            )
        )

        if (
            sift_selected.get(
                "mask"
            )
            is not None
        ):

            sgood = (
                sift_selected[
                    "mask"
                ]
                .ravel()
                .astype(bool)
            )

            sift_validation = validate(
                sift_src[sgood],
                sift_dst[sgood],
                target_image.shape,
                reference_image.shape,
                sm,
            )

    # ========================================================
    # 9. NO MODEL
    # ========================================================

    if selected is None:

        return {
            "mode": mode,

            "target_keypoints_sift":
                len(sift_t_kp),

            "reference_keypoints_sift":
                len(sift_r_kp),

            "target_keypoints_rift2":
                len(rift_t_kp),

            "reference_keypoints_rift2":
                len(rift_r_kp),

            "sift_candidate_matches":
                sift_candidates,

            "rift2_candidate_matches":
                rift_candidates,

            "sift_matches":
                len(sift_matches),

            "rift2_matches":
                len(rift_matches),

            "fused_matches":
                len(used_src),

            "duplicate_matches_removed":
                duplicate_matches_removed,

            "sift_baseline_geometry":
                sift_selected_name,

            "sift_inliers":
                sift_inliers,

            "rift2_inliers":
                (
                    rift_selected[
                        "metrics"
                    ]["inliers"]
                    if rift_selected
                    is not None
                    else 0
                ),

            "rift2_independent_geometry":
                rift_selected_name,

            "rift2_independent_valid":
                rift_independent_valid,

            "rift2_independent_inliers":
                (
                    rift_selected[
                        "metrics"
                    ]["inliers"]
                    if rift_selected
                    is not None
                    else 0
                ),

            "rift2_independent_inlier_ratio":
                (
                    rift_selected[
                        "metrics"
                    ]["inlier_ratio"]
                    if rift_selected
                    is not None
                    else 0.0
                ),

            "rift2_independent_mean_error":
                (
                    rift_selected.get(
                        "refined_mean_error",
                        rift_selected[
                            "metrics"
                        ]["mean_error"],
                    )
                    if rift_selected
                    is not None
                    else float("inf")
                ),

            "hybrid_added_rift":
                hybrid_added_rift,

            "hybrid_rejected_rift":
                hybrid_rejected_rift,

            "hybrid_kept":
                False,

            "selected_geometry":
                "NONE",

            "final_inliers":
                0,

            "final_outliers":
                len(used_src),

            "final_inlier_ratio":
                0.0,

            "mean_reprojection_error":
                float("inf"),

            "median_reprojection_error":
                float("inf"),

            "max_reprojection_error":
                float("inf"),

            "validation":
                {},

            "reason":
                "NO GEOMETRIC MODEL",

            "registered_image":
                None,

            "overlay":
                None,

            "visuals":
                {},

            "target_inlier_points":
                np.empty(
                    (0, 2),
                    np.float32,
                ),

            "reference_inlier_points":
                np.empty(
                    (0, 2),
                    np.float32,
                ),

            "geometry_candidates":
                {},

            "sift_validation":
                sift_validation,

            "rift2_validation":
                rift_validation,

            "sift_gate_mean_error":
                sift_mean_error,

            "rift2_gate_errors":
                rift_gate_errors,

            "sift_processed_target":
                target_pc,

            "phase_congruency_target":
                target_pc,

            "phase_congruency_reference":
                reference_pc,
        }

    # ========================================================
    # 10. FINAL METRICS
    # ========================================================

    mask = (
        selected["mask"]
        .ravel()
        .astype(bool)
    )

    final_metrics = dict(
        selected["metrics"]
    )

    final_metrics["mean_error"] = (
        selected.get(
            "refined_mean_error",
            final_metrics[
                "mean_error"
            ],
        )
    )

    final_metrics[
        "median_error"
    ] = selected.get(
        "refined_median_error",
        final_metrics[
            "median_error"
        ],
    )

    final_metrics[
        "max_error"
    ] = selected.get(
        "refined_max_error",
        final_metrics[
            "max_error"
        ],
    )

    validation = validate(
        used_src[mask],
        used_dst[mask],
        target_image.shape,
        reference_image.shape,
        final_metrics,
    )

    # ========================================================
    # 11. HYBRID SAFETY
    # ========================================================

    hybrid_kept = True

    if (
        mode == "HYBRID"
        and sift_selected is not None
    ):

        final_is_worse = (
            final_metrics[
                "inliers"
            ]
            < sift_inliers

            or

            final_metrics[
                "inlier_ratio"
            ]
            < sift_inlier_ratio

            or

            final_metrics[
                "mean_error"
            ]
            >
            sift_mean_error
            +
            HYBRID_MAX_ERROR_INCREASE

            or

            (
                validation.get(
                    "average_coverage",
                    0.0,
                )
                +
                HYBRID_MAX_COVERAGE_DROP
                <
                sift_validation.get(
                    "average_coverage",
                    0.0,
                )
            )
        )

        if final_is_worse:

            hybrid_kept = False

            selected_name = (
                sift_selected_name
            )

            selected = (
                sift_selected
            )

            used_src = (
                sift_src
            )

            used_dst = (
                sift_dst
            )

            used_labels = (
                ["SIFT"]
                * len(sift_src)
            )

            mask = (
                selected[
                    "mask"
                ]
                .ravel()
                .astype(bool)
            )

            final_metrics = dict(
                selected["metrics"]
            )

            final_metrics[
                "mean_error"
            ] = selected.get(
                "refined_mean_error",
                final_metrics[
                    "mean_error"
                ],
            )

            final_metrics[
                "median_error"
            ] = selected.get(
                "refined_median_error",
                final_metrics[
                    "median_error"
                ],
            )

            final_metrics[
                "max_error"
            ] = selected.get(
                "refined_max_error",
                final_metrics[
                    "max_error"
                ],
            )

            validation = validate(
                used_src[mask],
                used_dst[mask],
                target_image.shape,
                reference_image.shape,
                final_metrics,
            )

    # ========================================================
    # 12. SOURCE CONTRIBUTION
    # ========================================================

    final_labels = [
        used_labels[i]
        for i, flag
        in enumerate(mask)
        if flag
    ]

    final_sift_inliers = sum(
        x == "SIFT"
        for x in final_labels
    )

    final_rift_inliers = sum(
        x == "RIFT2"
        for x in final_labels
    )

    # ========================================================
    # 13. REGISTRATION
    # ========================================================

    model = selected[
        "model"
    ]

    if selected["type"] == "AFFINE":

        registered = cv2.warpAffine(
            target_image,
            model,
            (
                reference_image.shape[1],
                reference_image.shape[0],
            ),
        )

    else:

        registered = cv2.warpPerspective(
            target_image,
            model,
            (
                reference_image.shape[1],
                reference_image.shape[0],
            ),
        )

    overlay = cv2.addWeighted(
        reference_image,
        0.5,
        registered,
        0.5,
        0,
    )

    # ========================================================
    # 14. VISUAL DIAGNOSTICS
    # ========================================================

    visuals = {}

    if mode in {
        "SIFT",
        "HYBRID",
    }:

        visuals[
            "sift_keypoints_target"
        ] = draw_keypoints(
            target_image,
            sift_t_kp,
            "SIFT target keypoints",
        )

        visuals[
            "sift_keypoints_reference"
        ] = draw_keypoints(
            reference_image,
            sift_r_kp,
            "SIFT reference keypoints",
        )

        visuals[
            "sift_matches"
        ] = draw_matches(
            target_image,
            reference_image,
            sift_t_kp,
            sift_r_kp,
            sift_matches,
            f"SIFT Lowe matches: {len(sift_matches)}",
        )

    if mode in {
        "RIFT2",
        "HYBRID",
    }:

        visuals[
            "rift2_keypoints_target"
        ] = draw_keypoints(
            target_image,
            rift_t_kp,
            "RIFT2 target keypoints",
        )

        visuals[
            "rift2_keypoints_reference"
        ] = draw_keypoints(
            reference_image,
            rift_r_kp,
            "RIFT2 reference keypoints",
        )

        visuals[
            "rift2_matches"
        ] = draw_matches(
            target_image,
            reference_image,
            rift_t_kp,
            rift_r_kp,
            rift_matches,
            f"RIFT2 matches: {len(rift_matches)}",
        )

        if target_pc is not None:

            visuals[
                "phase_congruency_target"
            ] = cv2.normalize(
                target_pc,
                None,
                0,
                255,
                cv2.NORM_MINMAX,
            ).astype(
                np.uint8
            )

        if reference_pc is not None:

            visuals[
                "phase_congruency_reference"
            ] = cv2.normalize(
                reference_pc,
                None,
                0,
                255,
                cv2.NORM_MINMAX,
            ).astype(
                np.uint8
            )

    visuals[
        "final_inliers"
    ] = draw_coordinate_inliers(
        target_image,
        reference_image,
        used_src,
        used_dst,
        mask,
        "Final geometrically verified inliers",
    )

    visuals[
        "target_coverage"
    ] = draw_coverage(
        used_src[mask],
        target_image.shape,
        "Target inlier coverage",
    )

    visuals[
        "reference_coverage"
    ] = draw_coverage(
        used_dst[mask],
        reference_image.shape,
        "Reference inlier coverage",
    )

    # ========================================================
    # FINAL RESULT
    # ========================================================

    return {
        "mode": mode,

        "target_keypoints_sift":
            len(sift_t_kp),

        "reference_keypoints_sift":
            len(sift_r_kp),

        "target_keypoints_rift2":
            len(rift_t_kp),

        "reference_keypoints_rift2":
            len(rift_r_kp),

        "sift_candidate_matches":
            sift_candidates,

        "rift2_candidate_matches":
            rift_candidates,

        "sift_matches":
            len(sift_matches),

        "rift2_matches":
            len(rift_matches),

        "fused_matches":
            len(used_src),

        "fused_matches_before_dedup":
            (
                len(sift_src)
                +
                (
                    hybrid_added_rift
                    if mode == "HYBRID"
                    else (
                        len(rift_src)
                        if mode == "RIFT2"
                        else 0
                    )
                )
            ),

        "duplicate_matches_removed":
            duplicate_matches_removed,

        "sift_baseline_geometry":
            sift_selected_name,

        "sift_inliers":
            sift_inliers,

        "rift2_inliers":
            final_rift_inliers,

        "rift2_independent_geometry":
            rift_selected_name,

        "rift2_independent_valid":
            rift_independent_valid,

        "rift2_independent_inliers":
            (
                rift_selected[
                    "metrics"
                ]["inliers"]
                if rift_selected
                is not None
                else 0
            ),

        "rift2_independent_inlier_ratio":
            (
                rift_selected[
                    "metrics"
                ]["inlier_ratio"]
                if rift_selected
                is not None
                else 0.0
            ),

        "rift2_independent_mean_error":
            (
                rift_selected.get(
                    "refined_mean_error",
                    rift_selected[
                        "metrics"
                    ]["mean_error"],
                )
                if rift_selected
                is not None
                else float("inf")
            ),

        "hybrid_added_rift":
            hybrid_added_rift,

        "hybrid_rejected_rift":
            hybrid_rejected_rift,

        "hybrid_kept":
            hybrid_kept,

        "selected_geometry":
            selected_name,

        "final_inliers":
            final_metrics[
                "inliers"
            ],

        "final_outliers":
            final_metrics[
                "outliers"
            ],

        "final_inlier_ratio":
            final_metrics[
                "inlier_ratio"
            ],

        "mean_reprojection_error":
            final_metrics[
                "mean_error"
            ],

        "median_reprojection_error":
            final_metrics[
                "median_error"
            ],

        "max_reprojection_error":
            final_metrics[
                "max_error"
            ],

        "validation":
            validation,

        "sift_validation":
            sift_validation,

        "rift2_validation":
            rift_validation,

        "target_inlier_points":
            used_src[mask],

        "reference_inlier_points":
            used_dst[mask],

        "registered_image":
            registered,

        "overlay":
            overlay,

        "geometry_candidates":
            final_candidates,

        "rift2_gate_errors":
            rift_gate_errors,

        "visuals":
            visuals,

        "target_pc":
            target_pc,

        "reference_pc":
            reference_pc,

        "sift_descriptor_shape":
            (
                list(
                    sift_t_desc.shape
                )
                if sift_t_desc is not None
                else None
            ),

        "rift2_descriptor_shape":
            (
                list(
                    rift_t_desc.shape
                )
                if rift_t_desc is not None
                else None
            ),

        "reason":
            (
                "CORRESPONDENCE FOUND"
                if validation["valid"]
                else
                "GEOMETRIC MODEL FOUND BUT VALIDATION FAILED"
            ),

        "valid":
            bool(
                validation["valid"]
            ),
    }