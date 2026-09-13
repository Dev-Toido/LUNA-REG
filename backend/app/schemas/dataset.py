"""Pydantic schemas for dataset registry operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DatasetCreate(BaseModel):
	pair_id: str
	source_instrument: str
	source_product_id: str
	reference_instrument: str
	reference_product_id: str
	source_resolution: float | None = None
	reference_resolution: float | None = None
	source_acquisition_time: datetime | None = None
	reference_acquisition_time: datetime | None = None
	overlap_status: str = "UNKNOWN"
	verification_status: str = "DISCOVERED"
	source_local_path: str | None = None
	reference_local_path: str | None = None
	source_drive_file_id: str | None = None
	reference_drive_file_id: str | None = None


class DatasetResponse(DatasetCreate):
	model_config = ConfigDict(from_attributes=True)

	id: int
	created_at: datetime
