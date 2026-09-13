"""Dataset registry API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Dataset
from app.services.dataset_file_service import get_registration_input_files
from app.schemas.dataset import DatasetCreate, DatasetResponse
from app.services.dataset_service import (
	DuplicatePairError,
	create_dataset,
	delete_dataset,
	get_dataset,
	list_datasets,
)

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset_endpoint(
	dataset_data: DatasetCreate,
	db: Session = Depends(get_db),
) -> DatasetResponse:
	try:
		return create_dataset(db, dataset_data)
	except DuplicatePairError as exc:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="A dataset with this pair_id already exists",
		) from exc


@router.get("", response_model=list[DatasetResponse])
def list_dataset_endpoint(db: Session = Depends(get_db)) -> list[DatasetResponse]:
	return list_datasets(db)


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset_endpoint(
	dataset_id: int,
	db: Session = Depends(get_db),
) -> DatasetResponse:
	dataset = get_dataset(db, dataset_id)
	if dataset is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)
	return dataset


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset_endpoint(
	dataset_id: int,
	db: Session = Depends(get_db),
) -> Response:
	if not delete_dataset(db, dataset_id):
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)
	return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{dataset_id}/registration-input")
def get_registration_input_endpoint(
	dataset_id: int,
	db: Session = Depends(get_db),
) -> dict[str, object]:
	dataset = db.get(Dataset, dataset_id)
	if dataset is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Dataset not found",
		)

	registration_files = get_registration_input_files(db, dataset_id)
	if registration_files is None:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Dataset must have exactly one source_raw and one reference_raw img file.",
		)
	source_file, reference_file = registration_files
	return {
		"dataset_id": dataset.id,
		"pair_id": dataset.pair_id,
		"source": {
			"dataset_file_id": source_file.id,
			"instrument": dataset.source_instrument,
			"file_name": source_file.file_name,
			"file_type": source_file.file_type,
			"drive_file_id": source_file.drive_file_id,
		},
		"reference": {
			"dataset_file_id": reference_file.id,
			"instrument": dataset.reference_instrument,
			"file_name": reference_file.file_name,
			"file_type": reference_file.file_type,
			"drive_file_id": reference_file.drive_file_id,
		},
	}
