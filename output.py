"""
LUNA-REG V6.1
Output module.
"""

import json
import os
from datetime import datetime

import cv2
import numpy as np


BASE_OUTPUT_DIR = "OUTPUT"


def make_output_directory():
    run_name = datetime.now().strftime(
        "RUN_%Y-%m-%d_%H-%M-%S"
    )
    output_dir = os.path.join(
        BASE_OUTPUT_DIR,
        run_name,
    )
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def json_safe(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, dict):
        return {
            str(k): json_safe(v)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def save_image(output_dir, name, image):
    if image is None:
        return
    cv2.imwrite(
        os.path.join(output_dir, name),
        image,
    )


def save_transformation(output_dir, result):
    selected = result.get("selected_geometry")
    candidates = result.get(
        "geometry_candidates",
        {},
    )

    item = candidates.get(selected)
    if not item or item.get("model") is None:
        return

    path = os.path.join(
        output_dir,
        "transformation.txt",
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"Selected model: {selected}\n")
        f.write(
            f"Model type: {item.get('type')}\n\n"
        )
        f.write(
            "Transformation matrix:\n"
        )
        f.write(str(item["model"]))
        f.write("\n")


def save_results(
    result,
    config,
    target_path,
    reference_path,
):
    output_dir = make_output_directory()

    if result.get("registered_image") is not None:
        save_image(
            output_dir,
            "registered_image.png",
            result["registered_image"],
        )

    if result.get("overlay") is not None:
        save_image(
            output_dir,
            "overlay.png",
            result["overlay"],
        )

    for name, image in result.get(
        "visuals",
        {},
    ).items():
        save_image(
            output_dir,
            f"{name}.png",
            image,
        )

    metrics = {}
    for key, value in result.items():
        if key in {
            "registered_image",
            "overlay",
            "visuals",
            "target_inlier_points",
            "reference_inlier_points",
        }:
            continue
        metrics[key] = json_safe(value)

    metrics["target_path"] = str(target_path)
    metrics["reference_path"] = str(reference_path)
    metrics["config"] = json_safe(config)

    with open(
        os.path.join(
            output_dir,
            "metrics.json",
        ),
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            metrics,
            f,
            indent=4,
        )

    save_transformation(
        output_dir,
        result,
    )

    return output_dir
