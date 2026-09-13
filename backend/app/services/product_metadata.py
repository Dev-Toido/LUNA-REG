"""Generic, non-destructive extraction of product metadata from XML labels."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Coordinate:
    latitude: float | None
    longitude: float | None


@dataclass
class ProductMetadata:
    product_id: str | None = None
    instrument: str | None = None
    mission: str | None = None
    acquisition_time: datetime | None = None
    image_width: int | None = None
    image_height: int | None = None
    resolution: float | None = None
    product_type: str | None = None
    calibration_status: str | None = None
    footprint: dict[str, Coordinate] = field(default_factory=dict)
    geometric_metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def extract_product_metadata(xml_path: str | Path) -> ProductMetadata:
    """Parse explicitly present metadata from a product XML label."""
    root = ET.parse(xml_path).getroot()
    elements = list(_iter_named(root))

    logical_identifier = _first_text(elements, "logical_identifier")
    product_id = logical_identifier.rsplit(":", 1)[-1] if logical_identifier else None
    instrument = _context_name(elements, "Instrument")
    mission = _context_name(elements, "Mission")
    acquisition_time = _parse_datetime(_first_text(elements, "start_date_time"))

    axis_sizes = _axis_sizes(root)
    corners = _corners(elements)
    geometric_metadata = _geometric_metadata(elements)

    return ProductMetadata(
        product_id=product_id,
        instrument=_normalize_instrument(instrument),
        mission=_normalize_mission(mission),
        acquisition_time=acquisition_time,
        image_width=axis_sizes.get("Sample"),
        image_height=axis_sizes.get("Line"),
        resolution=_parse_float(_first_text(elements, "pixel_resolution")),
        product_type=_first_text(elements, "product_class"),
        calibration_status=_first_text(elements, "processing_level"),
        footprint=corners,
        geometric_metadata=geometric_metadata,
    )


def _iter_named(root: ET.Element):
    for element in root.iter():
        yield _local_name(element.tag), element


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _first_text(elements, name: str) -> str | None:
    for local_name, element in elements:
        if local_name.lower() == name.lower():
            value = (element.text or "").strip()
            if value:
                return value
    return None


def _context_name(elements, context_type: str) -> str | None:
    for local_name, element in elements:
        if local_name.lower() == "type" and (element.text or "").strip().lower() == context_type.lower():
            # PDS labels place name and type in the same context object. The
            # first preceding name is the corresponding context name.
            index = next(index for index, (_, item) in enumerate(elements) if item is element)
            for previous_name, previous_element in reversed(elements[:index]):
                if previous_name.lower() == "name" and (previous_element.text or "").strip():
                    return (previous_element.text or "").strip()
    return None


def _axis_sizes(root: ET.Element) -> dict[str, int]:
    sizes: dict[str, int] = {}
    for axis in root.iter():
        if _local_name(axis.tag).lower() != "axis_array":
            continue
        axis_name = None
        elements_value = None
        for child in axis:
            name = _local_name(child.tag).lower()
            value = (child.text or "").strip()
            if name == "axis_name":
                axis_name = value
            elif name == "elements":
                elements_value = _parse_int(value)
        if axis_name and elements_value is not None:
            sizes[axis_name] = elements_value
    return sizes


def _corners(elements) -> dict[str, Coordinate]:
    labels = ("upper_left", "upper_right", "lower_left", "lower_right")
    corners: dict[str, Coordinate] = {}
    for label in labels:
        latitude = _find_float(elements, f"{label}_latitude")
        longitude = _find_float(elements, f"{label}_longitude")
        if latitude is not None or longitude is not None:
            corners[label] = Coordinate(latitude=latitude, longitude=longitude)
    return corners


def _geometric_metadata(elements) -> dict[str, str]:
    names = {
        "detector_pixel_width",
        "line_exposure_duration",
        "imaging_orbit_number",
        "dumping_orbit_number",
        "incidence_angle",
        "emission_angle",
        "phase_angle",
    }
    return {
        name: (element.text or "").strip()
        for name, element in elements
        if name.lower() in names and (element.text or "").strip()
    }


def _find_float(elements, name: str) -> float | None:
    return _parse_float(_first_text(elements, name))


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _normalize_instrument(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    if "orbiter high resolution camera" in normalized:
        return "OHRC"
    if "terrain mapping camera" in normalized:
        return "TMC-2"
    return value


def _normalize_mission(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value).strip().lower()
    if normalized == "chandrayaan-2":
        return "Chandrayaan-2"
    return value
