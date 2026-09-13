"""SQLAlchemy database models."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Dataset(Base):
	__tablename__ = "datasets"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	pair_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
	source_instrument: Mapped[str] = mapped_column(String, nullable=False)
	source_product_id: Mapped[str] = mapped_column(String, nullable=False)
	reference_instrument: Mapped[str] = mapped_column(String, nullable=False)
	reference_product_id: Mapped[str] = mapped_column(String, nullable=False)
	source_resolution: Mapped[float | None] = mapped_column(Float, nullable=True)
	reference_resolution: Mapped[float | None] = mapped_column(Float, nullable=True)
	source_acquisition_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
	reference_acquisition_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
	overlap_status: Mapped[str] = mapped_column(String, nullable=False, default="UNKNOWN")
	verification_status: Mapped[str] = mapped_column(String, nullable=False, default="DISCOVERED")
	source_local_path: Mapped[str | None] = mapped_column(String, nullable=True)
	reference_local_path: Mapped[str | None] = mapped_column(String, nullable=True)
	source_drive_file_id: Mapped[str | None] = mapped_column(String, nullable=True)
	reference_drive_file_id: Mapped[str | None] = mapped_column(String, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
	files: Mapped[list["DatasetFile"]] = relationship(
		back_populates="dataset",
		cascade="all, delete-orphan",
	)


class DatasetFile(Base):
	__tablename__ = "dataset_files"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	dataset_id: Mapped[int] = mapped_column(
		Integer,
		ForeignKey("datasets.id"),
		nullable=False,
	)
	file_role: Mapped[str] = mapped_column(String, nullable=False)
	file_name: Mapped[str] = mapped_column(String, nullable=False)
	file_type: Mapped[str] = mapped_column(String, nullable=False)
	storage_provider: Mapped[str] = mapped_column(
		String,
		nullable=False,
		default="google_drive",
	)
	drive_file_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
	drive_folder_id: Mapped[str | None] = mapped_column(String, nullable=True)
	file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
	mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
	checksum: Mapped[str | None] = mapped_column(String, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

	dataset: Mapped[Dataset] = relationship(back_populates="files")


class Region(Base):
	__tablename__ = "regions"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	name: Mapped[str] = mapped_column(String, nullable=False)
	region_type: Mapped[str] = mapped_column(String, nullable=False)
	lat_min: Mapped[float] = mapped_column(Float, nullable=False)
	lat_max: Mapped[float] = mapped_column(Float, nullable=False)
	lon_min: Mapped[float] = mapped_column(Float, nullable=False)
	lon_max: Mapped[float] = mapped_column(Float, nullable=False)
	description: Mapped[str | None] = mapped_column(String, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

	products: Mapped[list["Product"]] = relationship(back_populates="region")
	pairs: Mapped[list["Pair"]] = relationship(back_populates="region")


class Product(Base):
	__tablename__ = "products"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
	instrument: Mapped[str] = mapped_column(String, nullable=False)
	mission: Mapped[str] = mapped_column(String, nullable=False)
	product_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
	acquisition_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
	resolution: Mapped[float | None] = mapped_column(Float, nullable=True)
	product_type: Mapped[str] = mapped_column(String, nullable=False)
	calibration_status: Mapped[str] = mapped_column(String, nullable=False)
	footprint_json: Mapped[str | None] = mapped_column(String, nullable=True)
	footprint_lat_min: Mapped[float | None] = mapped_column(Float, nullable=True)
	footprint_lat_max: Mapped[float | None] = mapped_column(Float, nullable=True)
	footprint_lon_min: Mapped[float | None] = mapped_column(Float, nullable=True)
	footprint_lon_max: Mapped[float | None] = mapped_column(Float, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

	region: Mapped[Region | None] = relationship(back_populates="products")
	files: Mapped[list["ProductFile"]] = relationship(back_populates="product")
	source_pairs: Mapped[list["Pair"]] = relationship(
		back_populates="source_product",
		foreign_keys="Pair.source_product_id",
	)
	reference_pairs: Mapped[list["Pair"]] = relationship(
		back_populates="reference_product",
		foreign_keys="Pair.reference_product_id",
	)


class ProductFile(Base):
	__tablename__ = "product_files"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
	file_role: Mapped[str] = mapped_column(String, nullable=False)
	file_name: Mapped[str] = mapped_column(String, nullable=False)
	file_type: Mapped[str] = mapped_column(String, nullable=False)
	drive_file_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
	drive_folder_id: Mapped[str | None] = mapped_column(String, nullable=True)
	file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
	mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
	checksum: Mapped[str | None] = mapped_column(String, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

	product: Mapped[Product] = relationship(back_populates="files")


class Pair(Base):
	__tablename__ = "pairs"
	__table_args__ = (
		UniqueConstraint(
			"source_product_id",
			"reference_product_id",
			name="uq_pairs_source_reference",
		),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
	source_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
	reference_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
	source_instrument: Mapped[str] = mapped_column(String, nullable=False)
	reference_instrument: Mapped[str] = mapped_column(String, nullable=False)
	overlap_status: Mapped[str] = mapped_column(String, nullable=False)
	overlap_area: Mapped[float | None] = mapped_column(Float, nullable=True)
	overlap_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
	verification_method: Mapped[str | None] = mapped_column(String, nullable=True)
	evidence_source: Mapped[str | None] = mapped_column(String, nullable=True)
	verification_notes: Mapped[str | None] = mapped_column(String, nullable=True)
	overlap_geometry_json: Mapped[str | None] = mapped_column(String, nullable=True)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

	region: Mapped[Region | None] = relationship(back_populates="pairs")
	source_product: Mapped[Product] = relationship(
		back_populates="source_pairs",
		foreign_keys=[source_product_id],
	)
	reference_product: Mapped[Product] = relationship(
		back_populates="reference_pairs",
		foreign_keys=[reference_product_id],
	)
	jobs: Mapped[list["RegistrationJob"]] = relationship(back_populates="pair")


class RegistrationJob(Base):
	__tablename__ = "registration_jobs"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	pair_id: Mapped[int] = mapped_column(ForeignKey("pairs.id"), nullable=False)
	status: Mapped[str] = mapped_column(String, nullable=False)
	requested_options_json: Mapped[str] = mapped_column(String, nullable=False, default="{}")
	core_job_id: Mapped[str] = mapped_column(String, nullable=False)
	created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
	started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
	completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
	error_message: Mapped[str | None] = mapped_column(String, nullable=True)

	pair: Mapped[Pair] = relationship(back_populates="jobs")
