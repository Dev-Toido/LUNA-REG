import cv2
import numpy as np
import matplotlib.pyplot as plt
import json
import os


# ============================================================
# 1. FILE PATHS
# ============================================================

SOURCE_IMAGE = "data/source.png"
REFERENCE_IMAGE = "data/reference.png"

SOURCE_METADATA = "metadata/source.json"
REFERENCE_METADATA = "metadata/reference.json"

RESULTS_FOLDER = "results"


# ============================================================
# 2. CREATE RESULTS FOLDER
# ============================================================

os.makedirs(RESULTS_FOLDER, exist_ok=True)


# ============================================================
# 3. CHECK FILES
# ============================================================

if not os.path.exists(SOURCE_IMAGE):
    print("ERROR: Source image not found!")
    print("Put your image at:", SOURCE_IMAGE)
    exit()

if not os.path.exists(REFERENCE_IMAGE):
    print("ERROR: Reference image not found!")
    print("Put your image at:", REFERENCE_IMAGE)
    exit()


# ============================================================
# 4. LOAD IMAGES
# ============================================================

source = cv2.imread(SOURCE_IMAGE, cv2.IMREAD_GRAYSCALE)
reference = cv2.imread(REFERENCE_IMAGE, cv2.IMREAD_GRAYSCALE)

if source is None:
    print("ERROR: Could not read source image.")
    exit()

if reference is None:
    print("ERROR: Could not read reference image.")
    exit()


print("\n======================================")
print(" SIH LUNAR IMAGE REGISTRATION DEMO")
print("======================================")

print("\nSource image:")
print("  ", SOURCE_IMAGE)

print("Reference image:")
print("  ", REFERENCE_IMAGE)

print("\nSource size:", source.shape)
print("Reference size:", reference.shape)


# ============================================================
# 5. READ METADATA
# ============================================================

def read_metadata(filename):

    if not os.path.exists(filename):
        return {}

    try:
        with open(filename, "r") as file:
            return json.load(file)

    except Exception as e:
        print("Could not read metadata:", filename)
        print(e)
        return {}


source_metadata = read_metadata(SOURCE_METADATA)
reference_metadata = read_metadata(REFERENCE_METADATA)


print("\n--------------------------------------")
print("SOURCE METADATA")
print("--------------------------------------")

if source_metadata:
    for key, value in source_metadata.items():
        print(key, ":", value)
else:
    print("No source metadata found.")


print("\n--------------------------------------")
print("REFERENCE METADATA")
print("--------------------------------------")

if reference_metadata:
    for key, value in reference_metadata.items():
        print(key, ":", value)
else:
    print("No reference metadata found.")


# ============================================================
# 6. CREATE SIFT DETECTOR
# ============================================================

print("\n[1] Detecting SIFT keypoints...")

sift = cv2.SIFT_create()

source_keypoints, source_descriptors = sift.detectAndCompute(
    source,
    None
)

reference_keypoints, reference_descriptors = sift.detectAndCompute(
    reference,
    None
)


print("Source keypoints:", len(source_keypoints))
print("Reference keypoints:", len(reference_keypoints))


# ============================================================
# 7. VISUALIZE KEYPOINTS
# ============================================================

source_keypoint_image = cv2.drawKeypoints(
    source,
    source_keypoints,
    None,
    flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)

reference_keypoint_image = cv2.drawKeypoints(
    reference,
    reference_keypoints,
    None,
    flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
)


cv2.imwrite(
    os.path.join(
        RESULTS_FOLDER,
        "01_source_keypoints.png"
    ),
    source_keypoint_image
)

cv2.imwrite(
    os.path.join(
        RESULTS_FOLDER,
        "02_reference_keypoints.png"
    ),
    reference_keypoint_image
)


# ============================================================
# 8. CHECK DESCRIPTORS
# ============================================================

if source_descriptors is None or reference_descriptors is None:

    print("\nERROR:")
    print("SIFT could not find enough features.")
    print("Try using images with craters, rocks, edges or texture.")
    exit()


# ============================================================
# 9. BF MATCHER
# ============================================================

print("\n[2] Matching SIFT descriptors...")

bf = cv2.BFMatcher()


matches = bf.knnMatch(
    source_descriptors,
    reference_descriptors,
    k=2
)


print("Total descriptor pairs:", len(matches))


# ============================================================
# 10. LOWE RATIO TEST
# ============================================================

print("\n[3] Applying Lowe ratio test...")

good_matches = []

for pair in matches:

    if len(pair) == 2:

        m, n = pair

        if m.distance < 0.75 * n.distance:

            good_matches.append(m)


print("Good matches:", len(good_matches))


# ============================================================
# 11. VISUALIZE ALL GOOD MATCHES
# ============================================================

good_match_image = cv2.drawMatches(
    source,
    source_keypoints,
    reference,
    reference_keypoints,
    good_matches,
    None,
    flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)


cv2.imwrite(
    os.path.join(
        RESULTS_FOLDER,
        "04_good_matches.png"
    ),
    good_match_image
)


# ============================================================
# 12. CHECK WHETHER ENOUGH MATCHES EXIST
# ============================================================

if len(good_matches) < 4:

    print("\n======================================")
    print("NOT ENOUGH MATCHES")
    print("======================================")

    print("At least 4 good matches are required")
    print("to calculate a homography.")

    print("\nTry:")
    print("1. Use images showing the same lunar region.")
    print("2. Use images with visible craters/features.")
    print("3. Avoid completely blank/dark images.")
    print("4. Try a different pair of images.")

    exit()


# ============================================================
# 13. PREPARE MATCHING POINTS
# ============================================================

source_points = np.float32(
    [
        source_keypoints[m.queryIdx].pt
        for m in good_matches
    ]
).reshape(-1, 1, 2)


reference_points = np.float32(
    [
        reference_keypoints[m.trainIdx].pt
        for m in good_matches
    ]
).reshape(-1, 1, 2)


# ============================================================
# 14. RANSAC + HOMOGRAPHY
# ============================================================

print("\n[4] Running RANSAC...")

homography, mask = cv2.findHomography(
    source_points,
    reference_points,
    cv2.RANSAC,
    5.0
)


if homography is None:

    print("\nRANSAC could not calculate a valid homography.")
    print("The images may not contain enough geometrically")
    print("consistent matching points.")

    exit()


# ============================================================
# 15. SEPARATE INLIERS AND OUTLIERS
# ============================================================

mask = mask.ravel()

inlier_matches = []

for i, match in enumerate(good_matches):

    if mask[i] == 1:

        inlier_matches.append(match)


outlier_count = len(good_matches) - len(inlier_matches)


print("Good matches:", len(good_matches))
print("RANSAC inliers:", len(inlier_matches))
print("RANSAC outliers:", outlier_count)


# ============================================================
# 16. CALCULATE INLIER RATIO
# ============================================================

inlier_ratio = (
    len(inlier_matches) / len(good_matches)
) * 100


print(
    "Inlier ratio: {:.2f}%".format(inlier_ratio)
)


# ============================================================
# 17. VISUALIZE RANSAC INLIERS
# ============================================================

inlier_image = cv2.drawMatches(
    source,
    source_keypoints,
    reference,
    reference_keypoints,
    inlier_matches,
    None,
    matchColor=None,
    singlePointColor=None,
    flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
)


cv2.imwrite(
    os.path.join(
        RESULTS_FOLDER,
        "05_ransac_inliers.png"
    ),
    inlier_image
)


# ============================================================
# 18. REGISTER SOURCE IMAGE
# ============================================================

print("\n[5] Registering source image...")

height, width = reference.shape


registered_image = cv2.warpPerspective(
    source,
    homography,
    (width, height)
)


cv2.imwrite(
    os.path.join(
        RESULTS_FOLDER,
        "06_registered_image.png"
    ),
    registered_image
)


# ============================================================
# 19. SHOW FINAL RESULTS
# ============================================================

print("\n======================================")
print("REGISTRATION COMPLETE")
print("======================================")

print("Good matches     :", len(good_matches))
print("RANSAC inliers   :", len(inlier_matches))
print("Inlier ratio     : {:.2f}%".format(inlier_ratio))

print("\nResults saved inside:")
print(RESULTS_FOLDER)


# ============================================================
# 20. DISPLAY RESULTS
# ============================================================

plt.figure(figsize=(12, 5))

plt.subplot(1, 2, 1)
plt.imshow(source, cmap="gray")
plt.title("Source / Moving Image")
plt.axis("off")

plt.subplot(1, 2, 2)
plt.imshow(reference, cmap="gray")
plt.title("Reference / Fixed Image")
plt.axis("off")

plt.tight_layout()
plt.show()


# ============================================================
# MATCH VISUALIZATION
# ============================================================

plt.figure(figsize=(16, 8))

plt.imshow(
    cv2.cvtColor(
        inlier_image,
        cv2.COLOR_BGR2RGB
    )
)

plt.title(
    "RANSAC Inlier Correspondences"
)

plt.axis("off")

plt.tight_layout()
plt.show()


# ============================================================
# REGISTERED IMAGE
# ============================================================

plt.figure(figsize=(12, 5))

plt.subplot(1, 2, 1)
plt.imshow(reference, cmap="gray")
plt.title("Reference Image")
plt.axis("off")

plt.subplot(1, 2, 2)
plt.imshow(registered_image, cmap="gray")
plt.title("Registered Source Image")
plt.axis("off")

plt.tight_layout()
plt.show()


print("\nDemo finished successfully.")