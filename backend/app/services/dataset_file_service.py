"""Database operations for dataset file registry records."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Dataset, DatasetFile
from app.schemas.dataset_file import DatasetFileCreate


class DuplicateDriveFileError(Exception):
	"""Raised when a Drive file ID is already registered."""


def create_dataset_file(
	db: Session,
	dataset_id: int,
	file_data: DatasetFileCreate,
) -> DatasetFile | None:
	if db.get(Dataset, dataset_id) is None:
		return None

	dataset_file = DatasetFile(dataset_id=dataset_id, **file_data.model_dump())
	db.add(dataset_file)
	try:
		db.commit()
	except IntegrityError as exc:
		db.rollback()
		raise DuplicateDriveFileError from exc
	db.refresh(dataset_file)
	return dataset_file


def get_dataset_file(
	db: Session,
	dataset_id: int,
	file_id: int,
) -> DatasetFile | None:
	return db.scalar(
		select(DatasetFile).where(
			DatasetFile.id == file_id,
			DatasetFile.dataset_id == dataset_id,
		)
	)


def list_dataset_files(db: Session, dataset_id: int) -> list[DatasetFile]:
	return list(
		db.scalars(
			select(DatasetFile)
			.where(DatasetFile.dataset_id == dataset_id)
			.order_by(DatasetFile.id)
		).all()
	)


def get_registration_input_files(
	db: Session,
	dataset_id: int,
) -> tuple[DatasetFile, DatasetFile] | None:
	files = list(
		db.scalars(
			select(DatasetFile).where(
				DatasetFile.dataset_id == dataset_id,
				DatasetFile.file_role.in_(("source_raw", "reference_raw")),
				DatasetFile.file_type == "img",
			)
		).all()
	)
	source_files = [file for file in files if file.file_role == "source_raw"]
	reference_files = [file for file in files if file.file_role == "reference_raw"]
	if len(source_files) != 1 or len(reference_files) != 1:
		return None
	return source_files[0], reference_files[0]


def delete_dataset_file(db: Session, dataset_id: int, file_id: int) -> bool:
	dataset_file = get_dataset_file(db, dataset_id, file_id)
	if dataset_file is None:
		return False

	db.delete(dataset_file)
	db.commit()
	return True