"""Read schemas for canonical products, files, and pairs."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProductFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    file_role: str
    file_name: str
    file_type: str
    drive_file_id: str
    drive_folder_id: str | None
    file_size_bytes: int | None
    mime_type: str | None
    checksum: str | None
    created_at: datetime


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    region_id: int | None
    instrument: str
    mission: str
    product_id: str
    acquisition_time: datetime | None
    resolution: float | None
    product_type: str
    calibration_status: str
    footprint_json: str | None
    footprint_lat_min: float | None
    footprint_lat_max: float | None
    footprint_lon_min: float | None
    footprint_lon_max: float | None
    created_at: datetime


class PairResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    region_id: int | None
    source_product_id: int
    reference_product_id: int
    source_instrument: str
    reference_instrument: str
    overlap_status: str
    overlap_area: float | None
    overlap_ratio: float | None
    verification_method: str | None
    evidence_source: str | None
    verification_notes: str | None
    overlap_geometry_json: str | None
    created_at: datetime


class PairRegistrationProduct(BaseModel):
    product: ProductResponse
    files: list[ProductFileResponse]


class PairRegistrationInputResponse(BaseModel):
    pair: PairResponse
    source: PairRegistrationProduct
    reference: PairRegistrationProduct
