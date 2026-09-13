"""Database operations for the dataset registry."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Dataset
from app.schemas.dataset import DatasetCreate


class DuplicatePairError(Exception):
	"""Raised when a dataset pair ID is already registered."""


def create_dataset(db: Session, dataset_data: DatasetCreate) -> Dataset:
	existing_dataset = db.scalar(
		select(Dataset).where(Dataset.pair_id == dataset_data.pair_id)
	)
	if existing_dataset is not None:
		raise DuplicatePairError

	dataset = Dataset(**dataset_data.model_dump())
	db.add(dataset)
	try:
		db.commit()
	except IntegrityError as exc:
		db.rollback()
		raise DuplicatePairError from exc
	db.refresh(dataset)
	return dataset


def get_dataset(db: Session, dataset_id: int) -> Dataset | None:
	return db.get(Dataset, dataset_id)


def list_datasets(db: Session) -> list[Dataset]:
	return list(db.scalars(select(Dataset).order_by(Dataset.id)).all())


def delete_dataset(db: Session, dataset_id: int) -> bool:
	dataset = get_dataset(db, dataset_id)
	if dataset is None:
		return False

	db.delete(dataset)
	db.commit()
	return True
