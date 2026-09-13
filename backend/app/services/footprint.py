"""Conservative geographic operations for four-corner product footprints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Mapping

from app.services.product_metadata import Coordinate

OverlapStatus = Literal["TRUE", "FALSE", "UNKNOWN"]


@dataclass(frozen=True)
class BoundingBox:
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    longitude_wrapping_ambiguous: bool


@dataclass(frozen=True)
class FootprintPolygon:
    points: tuple[Coordinate, ...]
    bounding_box: BoundingBox
    longitude_wrapping_ambiguous: bool


@dataclass(frozen=True)
class OverlapAssessment:
    status: OverlapStatus
    area: float | None = None
    geometry: tuple[Coordinate, ...] | None = None
    warning: str | None = None


def normalize_longitude(longitude: float) -> float:
    """Normalize longitude to [-180, 180) without changing stored source data."""
    normalized = ((longitude + 180.0) % 360.0) - 180.0
    return 180.0 if normalized == -180.0 and longitude > 0 else normalized


def ordered_polygon(corners: Mapping[str, Coordinate]) -> FootprintPolygon | None:
    """Return UL, UR, LR, LL order when all four complete corners exist."""
    order = ("upper_left", "upper_right", "lower_right", "lower_left")
    if any(
        name not in corners
        or corners[name].latitude is None
        or corners[name].longitude is None
        for name in order
    ):
        return None
    points = tuple(
        Coordinate(
            latitude=corners[name].latitude,
            longitude=normalize_longitude(corners[name].longitude),
        )
        for name in order
    )
    bounding_box = conservative_bounding_box(points)
    return FootprintPolygon(
        points=points,
        bounding_box=bounding_box,
        longitude_wrapping_ambiguous=bounding_box.longitude_wrapping_ambiguous,
    )


def conservative_bounding_box(points: tuple[Coordinate, ...]) -> BoundingBox:
    latitudes = [point.latitude for point in points if point.latitude is not None]
    raw_longitudes = [point.longitude for point in points if point.longitude is not None]
    longitudes = [normalize_longitude(value) for value in raw_longitudes]
    raw_span = max(raw_longitudes) - min(raw_longitudes)
    normalized_span = max(longitudes) - min(longitudes)
    return BoundingBox(
        lat_min=min(latitudes),
        lat_max=max(latitudes),
        lon_min=min(longitudes),
        lon_max=max(longitudes),
        longitude_wrapping_ambiguous=raw_span > 180.0 or normalized_span > 180.0,
    )


def determine_overlap(
    first_corners: Mapping[str, Coordinate],
    second_corners: Mapping[str, Coordinate],
) -> OverlapAssessment:
    first = ordered_polygon(first_corners)
    second = ordered_polygon(second_corners)
    if first is None or second is None:
        return OverlapAssessment("UNKNOWN", warning="A complete four-corner footprint is required.")
    if first.longitude_wrapping_ambiguous or second.longitude_wrapping_ambiguous:
        return OverlapAssessment(
            "UNKNOWN",
            warning="Longitude wrapping or dateline representation makes a simple overlap test ambiguous.",
        )
    if not _is_convex(first.points) or not _is_convex(second.points):
        return OverlapAssessment(
            "UNKNOWN",
            warning="Non-standard footprint geometry cannot be safely reduced to a simple polygon test.",
        )

    first_box = first.bounding_box
    second_box = second.bounding_box
    if (
        first_box.lat_max <= second_box.lat_min
        or second_box.lat_max <= first_box.lat_min
        or first_box.lon_max <= second_box.lon_min
        or second_box.lon_max <= first_box.lon_min
    ):
        return OverlapAssessment("FALSE", area=0.0)

    intersection = _clip_polygon(first.points, second.points)
    area = abs(_polygon_area(intersection))
    if area <= 0.0:
        return OverlapAssessment("FALSE", area=0.0)
    return OverlapAssessment("TRUE", area=area, geometry=tuple(intersection))


def _is_convex(points: tuple[Coordinate, ...]) -> bool:
    signs: list[bool] = []
    for index in range(len(points)):
        a = points[index - 1]
        b = points[index]
        c = points[(index + 1) % len(points)]
        cross = _cross(a, b, c)
        if abs(cross) > 1e-12:
            signs.append(cross > 0)
    return bool(signs) and all(sign == signs[0] for sign in signs)


def _cross(a: Coordinate, b: Coordinate, c: Coordinate) -> float:
    return (
        (b.longitude - a.longitude) * (c.latitude - b.latitude)
        - (b.latitude - a.latitude) * (c.longitude - b.longitude)
    )


def _clip_polygon(subject: tuple[Coordinate, ...], clip: tuple[Coordinate, ...]) -> list[Coordinate]:
    result = list(subject)
    orientation = _polygon_area(clip)
    for index, edge_start in enumerate(clip):
        edge_end = clip[(index + 1) % len(clip)]
        if not result:
            break
        input_points = result
        result = []
        previous = input_points[-1]
        for current in input_points:
            current_inside = _inside(current, edge_start, edge_end, orientation)
            previous_inside = _inside(previous, edge_start, edge_end, orientation)
            if current_inside:
                if not previous_inside:
                    result.append(_intersection(previous, current, edge_start, edge_end))
                result.append(current)
            elif previous_inside:
                result.append(_intersection(previous, current, edge_start, edge_end))
            previous = current
    return result


def _inside(point: Coordinate, start: Coordinate, end: Coordinate, orientation: float) -> bool:
    value = _cross(start, end, point)
    return value >= -1e-12 if orientation >= 0 else value <= 1e-12


def _intersection(a: Coordinate, b: Coordinate, start: Coordinate, end: Coordinate) -> Coordinate:
    dx1 = b.longitude - a.longitude
    dy1 = b.latitude - a.latitude
    dx2 = end.longitude - start.longitude
    dy2 = end.latitude - start.latitude
    denominator = dx1 * dy2 - dy1 * dx2
    if abs(denominator) < 1e-12:
        return b
    t = ((start.longitude - a.longitude) * dy2 - (start.latitude - a.latitude) * dx2) / denominator
    return Coordinate(
        latitude=a.latitude + t * dy1,
        longitude=a.longitude + t * dx1,
    )


def _polygon_area(points: list[Coordinate] | tuple[Coordinate, ...]) -> float:
    if len(points) < 3:
        return 0.0
    return 0.5 * sum(
        points[index].longitude * points[(index + 1) % len(points)].latitude
        - points[(index + 1) % len(points)].longitude * points[index].latitude
        for index in range(len(points))
    )
