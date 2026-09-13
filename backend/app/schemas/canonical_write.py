"""Request schemas for canonical write APIs."""

from datetime import datetime

from pydantic import BaseModel


class ProductCreate(BaseModel):
    region_id: int | None = None
    instrument: str
    mission: str
    product_id: str
    acquisition_time: datetime | None = None
    resolution: float | None = None
    product_type: str
    calibration_status: str
    footprint_json: str | None = None
    footprint_lat_min: float | None = None
    footprint_lat_max: float | None = None
    footprint_lon_min: float | None = None
    footprint_lon_max: float | None = None


class ProductFileCreateRequest(BaseModel):
    file_role: str
    file_name: str
    file_type: str
    drive_file_id: str
    drive_folder_id: str | None = None
    file_size_bytes: int | None = None
    mime_type: str | None = None
    checksum: str | None = None


class PairCreate(BaseModel):
    region_id: int | None = None
    source_product_id: int
    reference_product_id: int
    source_instrument: str
    reference_instrument: str
    overlap_status: str = "UNVERIFIED"
    overlap_area: float | None = None
    overlap_ratio: float | None = None
    verification_method: str | None = None
    evidence_source: str | None = None
    verification_notes: str | None = None
    overlap_geometry_json: str | None = None


class PairUpdate(BaseModel):
    region_id: int | None = None
    source_instrument: str | None = None
    reference_instrument: str | None = None
    overlap_status: str | None = None
    overlap_area: float | None = None
    overlap_ratio: float | None = None
    verification_method: str | None = None
    evidence_source: str | None = None
    verification_notes: str | None = None
    overlap_geometry_json: str | None = None
