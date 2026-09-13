"""Conservative footprint utility tests."""

from app.services.footprint import determine_overlap, normalize_longitude
from app.services.product_metadata import Coordinate


def rectangle(lat_min: float, lat_max: float, lon_min: float, lon_max: float):
    return {
        "upper_left": Coordinate(lat_min, lon_min),
        "upper_right": Coordinate(lat_min, lon_max),
        "lower_right": Coordinate(lat_max, lon_max),
        "lower_left": Coordinate(lat_max, lon_min),
    }


def test_longitude_normalization() -> None:
    assert normalize_longitude(341.0) == -19.0
    assert normalize_longitude(-181.0) == 179.0
    assert normalize_longitude(180.0) == 180.0


def test_ordinary_overlapping_footprints() -> None:
    result = determine_overlap(rectangle(0, 2, 0, 2), rectangle(1, 3, 1, 3))
    assert result.status == "TRUE"
    assert result.area is not None and result.area > 0


def test_ordinary_non_overlapping_footprints() -> None:
    result = determine_overlap(rectangle(0, 1, 0, 1), rectangle(2, 3, 2, 3))
    assert result.status == "FALSE"
    assert result.area == 0.0


def test_ambiguous_longitude_wrap_is_unknown() -> None:
    result = determine_overlap(
        rectangle(-1, 1, 170, 190),
        rectangle(-1, 1, -175, -165),
    )
    assert result.status == "UNKNOWN"
    assert result.warning is not None


def test_incomplete_footprint_is_unknown() -> None:
    result = determine_overlap({"upper_left": Coordinate(0, 0)}, rectangle(0, 1, 0, 1))
    assert result.status == "UNKNOWN"
