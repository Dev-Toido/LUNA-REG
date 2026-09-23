import cv2
import numpy as np

# =========================================================
# 1. LOAD IMAGES
# =========================================================

moving = cv2.imread("Moving image.png", cv2.IMREAD_GRAYSCALE)
reference = cv2.imread("Referenced image.png", cv2.IMREAD_GRAYSCALE)

if moving is None or reference is None:
    print("Error: Could not load images.")
    exit()

print("Images loaded successfully.")


# =========================================================
# 2. SIFT
# =========================================================

sift = cv2.SIFT_create()

kp1, des1 = sift.detectAndCompute(moving, None)
kp2, des2 = sift.detectAndCompute(reference, None)

print("\n--- SIFT ---")
print("Moving keypoints:", len(kp1))
print("Reference keypoints:", len(kp2))

print("Moving descriptor shape:", des1.shape)
print("Reference descriptor shape:", des2.shape)


# =========================================================
# 3. VISUALIZE SIFT KEYPOINTS
# =========================================================

moving_keypoints = cv2.drawKeypoints(
    moving,
    kp1,
    None,
    flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)

reference_keypoints = cv2.drawKeypoints(
    reference,
    kp2,
    None,
    flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)

cv2.imwrite("01_moving_sift_keypoints.png", moving_keypoints)
cv2.imwrite("02_reference_sift_keypoints.png", reference_keypoints)


# =========================================================
# 4. BF MATCHER
# =========================================================

bf = cv2.BFMatcher(cv2.NORM_L2)

matches = bf.knnMatch(des1, des2, k=2)

print("\n--- BF MATCHER ---")
print("Candidate matches:", len(matches))


# =========================================================
# 5. LOWE RATIO TEST
# =========================================================

good_matches = []

for m, n in matches:

    if m.distance < 0.75 * n.distance:
        good_matches.append(m)

print("\n--- RATIO TEST ---")
print("Good matches:", len(good_matches))


# =========================================================
# 6. VISUALIZE GOOD CORRESPONDENCES
# =========================================================

good_match_image = cv2.drawMatches(
    moving,
    kp1,
    reference,
    kp2,
    good_matches,
    None,
    flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)

cv2.imwrite(
    "03_sift_good_correspondences.jpg",
    good_match_image
)


# =========================================================
# 7. RANSAC + HOMOGRAPHY
# =========================================================

if len(good_matches) >= 4:

    src_points = np.float32([
        kp1[m.queryIdx].pt
        for m in good_matches
    ]).reshape(-1, 1, 2)

    dst_points = np.float32([
        kp2[m.trainIdx].pt
        for m in good_matches
    ]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(
        src_points,
        dst_points,
        cv2.RANSAC,
        5.0
    )

    if H is not None:

        mask = mask.ravel()

        inlier_matches = [
            good_matches[i]
            for i in range(len(good_matches))
            if mask[i] == 1
        ]

        outlier_count = len(good_matches) - len(inlier_matches)

        print("\n--- RANSAC ---")
        print("Inliers:", len(inlier_matches))
        print("Outliers:", outlier_count)


        # =================================================
        # 8. VISUALIZE RANSAC INLIERS
        # =================================================

        inlier_image = cv2.drawMatches(
            moving,
            kp1,
            reference,
            kp2,
            inlier_matches,
            None,
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
        )

        cv2.imwrite(
            "04_sift_ransac_inliers.jpg",
            inlier_image
        )


        # =================================================
        # 9. ALIGN / REGISTER MOVING IMAGE
        # =================================================

        height, width = reference.shape

        registered = cv2.warpPerspective(
            moving,
            H,
            (width, height)
        )

        cv2.imwrite(
            "05_sift_registered.jpg",
            registered
        )

        print("\n--- REGISTRATION ---")
        print("Image registration completed successfully.")

    else:

        print("Homography could not be calculated.")

else:

    print("Not enough good matches for RANSAC.")