"""Pydantic schemas for dataset file registry records."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

FileRole = Literal[
	"source_raw",
	"reference_raw",
	"source_processed",
	"reference_processed",
	"experiment_output",
	"metadata",
	"model",
	"test",
]


class DatasetFileCreate(BaseModel):
	file_role: str
	file_name: str
	file_type: str
	storage_provider: str = "google_drive"
	drive_file_id: str
	drive_folder_id: str | None = None
	file_size_bytes: int | None = None
	mime_type: str | None = None
	checksum: str | None = None


class DatasetFileResponse(DatasetFileCreate):
	model_config = ConfigDict(from_attributes=True)

	id: int
	dataset_id: int
	created_at: datetime


class DatasetFileUploadResponse(BaseModel):
	uploaded: bool
	dataset_file_id: int
	dataset_id: int
	pair_id: str
	file_role: FileRole
	file_name: str
	drive_file_id: str
	drive_folder_id: str
	mime_type: str
	file_size_bytes: int | None = None