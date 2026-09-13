"""Dataset file registry API endpoints."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session
from urllib.parse import quote

from app.db.database import get_db
from app.db.models import Dataset
from app.schemas.dataset_file import (
	DatasetFileCreate,
	DatasetFileResponse,
	DatasetFileUploadResponse,
	FileRole,
)
from app.services.dataset_file_service import (
	DuplicateDriveFileError,
	create_dataset_file,
	delete_dataset_file,
	get_dataset_file,
	list_dataset_files,
)
from app.services.dataset_upload_service import (
	DatasetFileRegistrationError,
	DatasetNotFoundError,
	UploadFolderNotFoundError,
	upload_dataset_file,
)
from app.services.google_auth import GoogleAuthError
from app.services.storage.google_drive import DriveFileExistsError
from app.services.storage.google_drive import GoogleDriveStorage

router = APIRouter(prefix="/datasets/{dataset_id}/files", tags=["dataset-files"])


def _require_dataset(db: Session, dataset_id: int) -> None:
	if db.get(Dataset, dataset_id) is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)


@router.post("", response_model=DatasetFileResponse, status_code=status.HTTP_201_CREATED)
def create_dataset_file_endpoint(
	dataset_id: int,
	file_data: DatasetFileCreate,
	db: Session = Depends(get_db),
) -> DatasetFileResponse:
	_require_dataset(db, dataset_id)
	try:
		file_record = create_dataset_file(db, dataset_id, file_data)
	except DuplicateDriveFileError as exc:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="A file with this drive_file_id is already registered",
		) from exc
	assert file_record is not None
	return file_record


@router.get("", response_model=list[DatasetFileResponse])
def list_dataset_files_endpoint(
	dataset_id: int,
	db: Session = Depends(get_db),
) -> list[DatasetFileResponse]:
	_require_dataset(db, dataset_id)
	return list_dataset_files(db, dataset_id)


@router.get("/{file_id}", response_model=DatasetFileResponse)
def get_dataset_file_endpoint(
	dataset_id: int,
	file_id: int,
	db: Session = Depends(get_db),
) -> DatasetFileResponse:
	_require_dataset(db, dataset_id)
	file_record = get_dataset_file(db, dataset_id, file_id)
	if file_record is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset file not found",
		)
	return file_record


@router.get("/{file_id}/download")
def download_dataset_file_endpoint(
	dataset_id: int,
	file_id: int,
	db: Session = Depends(get_db),
):
	_require_dataset(db, dataset_id)
	file_record = get_dataset_file(db, dataset_id, file_id)
	if file_record is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset file not found",
		)

	try:
		storage = GoogleDriveStorage()
		metadata = storage.get_file_metadata(file_record.drive_file_id)
		filename = metadata.get("name") or file_record.file_name
		media_type = metadata.get("mimeType") or file_record.mime_type or "application/octet-stream"
		return StreamingResponse(
			storage.iter_file_chunks(file_record.drive_file_id),
			media_type=media_type,
			headers={
				"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
			},
		)
	except GoogleAuthError as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except HttpError as exc:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="The Google Drive file was not found.",
		) from exc


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset_file_endpoint(
	dataset_id: int,
	file_id: int,
	db: Session = Depends(get_db),
) -> Response:
	_require_dataset(db, dataset_id)
	if not delete_dataset_file(db, dataset_id, file_id):
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset file not found",
		)
	return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/upload", response_model=DatasetFileUploadResponse)
async def upload_dataset_file_endpoint(
	dataset_id: int,
	file: UploadFile = File(...),
	file_role: FileRole = Form(...),
	db: Session = Depends(get_db),
) -> DatasetFileUploadResponse:
	if not file.filename:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="A local file is required.",
		)

	await file.seek(0)
	try:
		result = upload_dataset_file(
			db=db,
			dataset_id=dataset_id,
			file_role=file_role,
			file_object=file.file,
			file_name=file.filename,
			mime_type=file.content_type or "application/octet-stream",
			file_size_bytes=file.size,
		)
	except DatasetNotFoundError as exc:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		) from exc
	except UploadFolderNotFoundError as exc:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=str(exc),
		) from exc
	except DriveFileExistsError as exc:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="A file with this name already exists in the destination folder.",
		) from exc
	except DatasetFileRegistrationError as exc:
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail=str(exc),
		) from exc
	except GoogleAuthError as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google Drive authorization is required.",
		) from exc
	except HttpError as exc:
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Google Drive upload failed.",
		) from exc
	return result