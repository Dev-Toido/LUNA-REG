"""Dataset-aware Google Drive upload orchestration."""

from io import BufferedIOBase
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Dataset
from app.schemas.dataset_file import DatasetFileCreate, FileRole
from app.services.dataset_file_service import create_dataset_file
from app.services.storage.google_drive import GoogleDriveStorage

DATA_FOLDER_NAME = "LUNA-REG-DATA"
ROLE_FOLDER_PATHS: dict[str, tuple[str, ...]] = {
	"source_raw": ("raw", "{pair_id}", "{source_instrument}"),
	"reference_raw": ("raw", "{pair_id}", "{reference_instrument}"),
	"source_processed": ("processed", "{pair_id}", "source"),
	"reference_processed": ("processed", "{pair_id}", "reference"),
	"experiment_output": ("experiments", "{pair_id}"),
	"metadata": ("metadata", "{pair_id}"),
	"model": ("models", "{pair_id}"),
	"test": ("raw", "{pair_id}", "{source_instrument}"),
}


class DatasetUploadError(Exception):
	"""Base error for dataset-aware upload failures."""


class DatasetNotFoundError(DatasetUploadError):
	"""Raised when the requested dataset does not exist."""


class UploadFolderNotFoundError(DatasetUploadError):
	"""Raised when the required Drive folder structure is not initialized."""


class DatasetFileRegistrationError(DatasetUploadError):
	"""Raised when Drive upload succeeds but registry insertion fails."""


def _resolve_folder_path(dataset: Dataset, file_role: str) -> tuple[str, ...]:
	try:
		path = ROLE_FOLDER_PATHS[file_role]
	except KeyError as exc:
		raise DatasetUploadError(f"Unsupported file role: {file_role}") from exc
	return tuple(
		part.format(
			pair_id=dataset.pair_id,
			source_instrument=dataset.source_instrument,
			reference_instrument=dataset.reference_instrument,
		)
		for part in path
	)


def resolve_upload_folder(
	storage: GoogleDriveStorage,
	dataset: Dataset,
	file_role: str,
) -> dict[str, Any]:
	current = storage.find_folder(DATA_FOLDER_NAME)
	if current is None:
		raise UploadFolderNotFoundError("LUNA-REG-DATA folder has not been initialized")

	for folder_name in _resolve_folder_path(dataset, file_role):
		current = storage.find_folder(folder_name, parent_id=current["id"])
		if current is None:
			raise UploadFolderNotFoundError(
				f"Drive folder '{folder_name}' has not been initialized"
			)
	return current


def upload_dataset_file(
	db: Session,
	dataset_id: int,
	file_role: FileRole,
	file_object: BufferedIOBase,
	file_name: str,
	mime_type: str,
	file_size_bytes: int | None,
) -> dict[str, Any]:
	dataset = db.get(Dataset, dataset_id)
	if dataset is None:
		raise DatasetNotFoundError

	storage = GoogleDriveStorage()
	folder = resolve_upload_folder(storage, dataset, file_role)
	uploaded = storage.upload_stream(
		file_object,
		name=file_name,
		parent_id=folder["id"],
		mime_type=mime_type,
	)

	registry_data = DatasetFileCreate(
		file_role=file_role,
		file_name=file_name,
		file_type=_file_type_from_name(file_name),
		storage_provider="google_drive",
		drive_file_id=uploaded["id"],
		drive_folder_id=folder["id"],
		file_size_bytes=file_size_bytes,
		mime_type=uploaded.get("mimeType", mime_type),
	)
	try:
		record = create_dataset_file(db, dataset_id, registry_data)
	except Exception as exc:
		raise DatasetFileRegistrationError(
			"File was uploaded to Google Drive, but DatasetFile registration failed."
		) from exc
	if record is None:
		raise DatasetFileRegistrationError(
			"File was uploaded to Google Drive, but DatasetFile registration failed."
		)

	return {
		"uploaded": True,
		"dataset_file_id": record.id,
		"dataset_id": dataset.id,
		"pair_id": dataset.pair_id,
		"file_role": file_role,
		"file_name": file_name,
		"drive_file_id": uploaded["id"],
		"drive_folder_id": folder["id"],
		"mime_type": uploaded.get("mimeType", mime_type),
		"file_size_bytes": file_size_bytes,
	}


def _file_type_from_name(file_name: str) -> str:
	suffix = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
	return suffix if suffix in {"img", "xml", "png", "tiff", "json", "txt", "zip"} else "other"