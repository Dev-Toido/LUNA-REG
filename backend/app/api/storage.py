"""Google Drive storage status endpoint."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Dataset
from app.services.google_auth import GoogleAuthError
from app.services.storage.google_drive import DriveFileExistsError, GoogleDriveStorage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/storage", tags=["storage"])
DATA_FOLDER_NAME = "LUNA-REG-DATA"
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
PROJECT_FOLDERS = ("raw", "processed", "experiments", "models", "metadata")


@router.get("/drive/status")
def drive_status() -> dict[str, Any]:
	try:
		storage = GoogleDriveStorage()
		folders = storage.list_files(
			query=(
				f"name = '{DATA_FOLDER_NAME}' and "
				f"mimeType = '{FOLDER_MIME_TYPE}' and trashed = false"
			),
			page_size=10,
		)
	except GoogleAuthError as exc:
		logger.warning("Google Drive authentication failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except HttpError as exc:
		logger.warning("Google Drive API query failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive could not be queried.",
		) from exc
	except Exception as exc:
		logger.warning("Google Drive connection failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive connection failed.",
		) from exc

	folder = folders[0] if folders else None
	return {
		"connected": True,
		"folder_found": folder is not None,
		"folder_name": DATA_FOLDER_NAME,
		"folder_id": folder.get("id") if folder else None,
	}


@router.post("/drive/setup")
def setup_drive_folders() -> dict[str, Any]:
	try:
		storage = GoogleDriveStorage()
		root_folder = storage.find_folder(DATA_FOLDER_NAME)
		if root_folder is None:
			root_folder = storage.create_folder(DATA_FOLDER_NAME)

		folder_ids: dict[str, str] = {}
		for folder_name in PROJECT_FOLDERS:
			folder = storage.find_folder(folder_name, parent_id=root_folder["id"])
			if folder is None:
				folder = storage.create_folder(folder_name, parent_id=root_folder["id"])
			folder_ids[folder_name] = folder["id"]
	except GoogleAuthError as exc:
		logger.warning("Google Drive authentication failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except HttpError as exc:
		logger.warning("Google Drive setup failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive setup failed.",
		) from exc
	except Exception as exc:
		logger.warning("Google Drive setup failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive setup failed.",
		) from exc

	return {
		"root_folder_id": root_folder["id"],
		"folders": folder_ids,
	}


@router.post("/drive/setup/{dataset_id}")
def setup_dataset_drive_folders(
	dataset_id: int,
	db: Session = Depends(get_db),
) -> dict[str, Any]:
	dataset = db.get(Dataset, dataset_id)
	if dataset is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)

	try:
		storage = GoogleDriveStorage()
		root_folder = storage.find_folder(DATA_FOLDER_NAME)
		if root_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="LUNA-REG-DATA folder has not been initialized",
			)

		raw_folder = storage.find_folder("raw", parent_id=root_folder["id"])
		if raw_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="The raw folder has not been initialized",
			)

		pair_folder = storage.find_folder(dataset.pair_id, parent_id=raw_folder["id"])
		if pair_folder is None:
			pair_folder = storage.create_folder(
				dataset.pair_id,
				parent_id=raw_folder["id"],
			)

		source_folder = storage.find_folder(
			dataset.source_instrument,
			parent_id=pair_folder["id"],
		)
		if source_folder is None:
			source_folder = storage.create_folder(
				dataset.source_instrument,
				parent_id=pair_folder["id"],
			)

		reference_folder = storage.find_folder(
			dataset.reference_instrument,
			parent_id=pair_folder["id"],
		)
		if reference_folder is None:
			reference_folder = storage.create_folder(
				dataset.reference_instrument,
				parent_id=pair_folder["id"],
			)

		metadata_root_folder = storage.find_folder(
			"metadata",
			parent_id=root_folder["id"],
		)
		if metadata_root_folder is None:
			metadata_root_folder = storage.create_folder(
				"metadata",
				parent_id=root_folder["id"],
			)

		metadata_folder = storage.find_folder(
			dataset.pair_id,
			parent_id=metadata_root_folder["id"],
		)
		if metadata_folder is None:
			metadata_folder = storage.create_folder(
				dataset.pair_id,
				parent_id=metadata_root_folder["id"],
			)
	except HTTPException:
		raise
	except GoogleAuthError as exc:
		logger.warning("Google Drive authentication failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except HttpError as exc:
		logger.warning("Google Drive dataset setup failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive dataset setup failed.",
		) from exc
	except Exception as exc:
		logger.warning("Google Drive dataset setup failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive dataset setup failed.",
		) from exc

	return {
		"dataset_id": dataset.id,
		"pair_id": dataset.pair_id,
		"root_folder_id": root_folder["id"],
		"raw_folder_id": raw_folder["id"],
		"pair_folder_id": pair_folder["id"],
		"metadata_folder_id": metadata_folder["id"],
		"source_folder": {
			"name": dataset.source_instrument,
			"id": source_folder["id"],
		},
		"reference_folder": {
			"name": dataset.reference_instrument,
			"id": reference_folder["id"],
		},
	}


@router.post("/drive/upload-test")
async def upload_test_file(
	dataset_id: int = Query(...),
	file: UploadFile = File(...),
	db: Session = Depends(get_db),
) -> dict[str, Any]:
	dataset = db.get(Dataset, dataset_id)
	if dataset is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)
	if not file.filename:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="A local file is required.",
		)

	try:
		storage = GoogleDriveStorage()
		root_folder = storage.find_folder(DATA_FOLDER_NAME)
		if root_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="LUNA-REG-DATA folder has not been initialized",
			)
		raw_folder = storage.find_folder("raw", parent_id=root_folder["id"])
		if raw_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="The raw folder has not been initialized",
			)
		pair_folder = storage.find_folder(dataset.pair_id, parent_id=raw_folder["id"])
		if pair_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="The dataset Drive folder has not been initialized",
			)
		source_folder = storage.find_folder(
			dataset.source_instrument,
			parent_id=pair_folder["id"],
		)
		if source_folder is None:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="The source instrument Drive folder has not been initialized",
			)

		await file.seek(0)
		uploaded = storage.upload_stream(
			file.file,
			name=file.filename,
			parent_id=source_folder["id"],
			mime_type=file.content_type or "application/octet-stream",
		)
	except HTTPException:
		raise
	except GoogleAuthError as exc:
		logger.warning("Google Drive authentication failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except DriveFileExistsError as exc:
		logger.warning("Google Drive upload rejected: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="A file with this name already exists in the destination folder.",
		) from exc
	except HttpError as exc:
		logger.warning("Google Drive upload failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive upload failed.",
		) from exc
	except Exception as exc:
		logger.warning("Google Drive upload failed: exception=%s", type(exc).__name__)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive upload failed.",
		) from exc

	return {
		"uploaded": True,
		"dataset_id": dataset.id,
		"pair_id": dataset.pair_id,
		"file_name": file.filename,
		"drive_file_id": uploaded["id"],
		"mime_type": uploaded.get("mimeType", file.content_type or "application/octet-stream"),
	}