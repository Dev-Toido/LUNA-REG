import sys
import importlib
from pathlib import Path
import cv2
import numpy as np

def load_real_rift2():
    """
    Load the public Python RIFT2 implementation from a local folder.
    """
    script_dir = Path(__file__).resolve().parent

    candidates = [
        script_dir / "RIFT2-multimodal-matching-rotation-python",
        script_dir / "rift2",
        Path.cwd() / "RIFT2-multimodal-matching-rotation-python",
        Path.cwd() / "rift2",
    ]

    for root in candidates:
        if (root / "src" / "RIFT2.py").exists():
            root_string = str(root)
            if root_string not in sys.path:
                sys.path.insert(0, root_string)

            try:
                module = importlib.import_module("src.RIFT2")
                return module.RIFT2
            except Exception as exc:
                raise RuntimeError(
                    "\nRIFT2 files were found but could not be imported.\n"
                    f"RIFT2 folder: {root}\n"
                    f"Python error: {exc}\n"
                ) from exc

    raise RuntimeError(
        "\nREAL RIFT2 was selected but its implementation was not found.\n\n"
        "Download/extract the Python RIFT2 project and put this folder:\n"
        "  RIFT2-multimodal-matching-rotation-python\n"
        "beside this .py file.\n\n"
        "Required file:\n"
        "  RIFT2-multimodal-matching-rotation-python/src/RIFT2.py\n\n"
    )

def normalize_rift2_keypoints(keypoints):
    if keypoints is None:
        return []

    keypoints = list(keypoints)
    if len(keypoints) == 0:
        return []

    if hasattr(keypoints[0], "pt"):
        return keypoints

    converted = []
    for p in keypoints:
        a = np.asarray(p).reshape(-1)
        if len(a) < 2:
            continue
        size = 3.0
        if len(a) >= 3 and np.isfinite(a[2]) and float(a[2]) > 0:
            size = float(a[2])
        converted.append(cv2.KeyPoint(float(a[0]), float(a[1]), size))
    return converted

def normalize_descriptor_rows(desc):
    """L2-normalize descriptor rows without changing descriptor ordering."""
    if desc is None:
        return None
    desc = np.asarray(desc, dtype=np.float32)
    if desc.ndim != 2 or desc.shape[0] == 0:
        return desc
    norms = np.linalg.norm(desc, axis=1, keepdims=True)
    norms[norms < 1e-12] = 1.0
    return desc / norms

def detect_rift2(reference, moving):
    """
    Run RIFT2 on reference and moving images.
    Returns: kp_mov, des_mov, kp_ref, des_ref
    """
    RIFT2Class = load_real_rift2()
    rift2 = RIFT2Class()
    kp_mov, des_mov, kp_ref, des_ref = rift2(moving, reference)
    return normalize_rift2_keypoints(kp_mov), normalize_descriptor_rows(des_mov), normalize_rift2_keypoints(kp_ref), normalize_descriptor_rows(des_ref)
