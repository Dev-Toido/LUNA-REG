# """
# Generate a synthetic "moving" image from any single reference image by
# applying a KNOWN rotation + translation + scale. This is the best way to
# test a registration pipeline, because you know the exact ground-truth
# transform and can check whether your algorithm recovers it correctly.

# Usage:
#     python make_synthetic_pair.py reference.png
#     python make_synthetic_pair.py reference.png --angle 15 --scale 0.9 --tx 40 --ty -25
# """

import argparse
import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", help="Any single image (a real lunar crater image works well)")
    parser.add_argument("--angle", type=float, default=12.0, help="Rotation in degrees")
    parser.add_argument("--scale", type=float, default=0.92, help="Scale factor")
    parser.add_argument("--tx", type=float, default=35, help="Translation X (pixels)")
    parser.add_argument("--ty", type=float, default=-20, help="Translation Y (pixels)")
    parser.add_argument("--brightness", type=float, default=0.85, help="Brightness multiplier, simulates different sun angle")
    parser.add_argument("--out", default="moving_synthetic.png")
    args = parser.parse_args()

    img = cv2.imread(args.reference)
    if img is None:
        raise FileNotFoundError(args.reference)

    h, w = img.shape[:2]
    center = (w / 2, h / 2)

    M = cv2.getRotationMatrix2D(center, args.angle, args.scale)
    M[0, 2] += args.tx
    M[1, 2] += args.ty

    moving = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    # Simulate a different illumination (sun angle) between captures
    moving = np.clip(moving.astype(np.float32) * args.brightness, 0, 255).astype(np.uint8)

    cv2.imwrite(args.out, moving)
    print(f"Saved: {args.out}")
    print(f"Ground truth: angle={args.angle} deg, scale={args.scale}, tx={args.tx}, ty={args.ty}")
    print("Use the original file as your REFERENCE image, and this output as your MOVING image.")


if __name__ == "__main__":
    main()