import cv2
import numpy as np
import torch
from lightglue import SuperPoint

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

def cv2_to_tensor(image_bgr):
    """Convert an OpenCV BGR uint8 image into the RGB float tensor LightGlue expects."""
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_rgb).permute(2, 0, 1)  # (3, H, W)
    return tensor.to(DEVICE)

def detect_superpoint(extractor, image_bgr):
    tensor = cv2_to_tensor(image_bgr)
    with torch.no_grad():
        feats = extractor.extract(tensor)
    return feats  # dict with 'keypoints', 'keypoint_scores', 'descriptors'

def feats_to_cv2_keypoints(feats):
    """Convert SuperPoint's (N,2) keypoint tensor into cv2.KeyPoint objects."""
    kps = feats["keypoints"][0].cpu().numpy()
    scores = feats["keypoint_scores"][0].cpu().numpy()
    cv_keypoints = [
        cv2.KeyPoint(float(x), float(y), size=6, response=float(s))
        for (x, y), s in zip(kps, scores)
    ]
    return cv_keypoints
