"""Registration job validation and persistence."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core_client.client import CoreClient, MockCoreClient
from app.db.models import Pair, Product, ProductFile, RegistrationJob


class PairNotFoundError(Exception):
	"""Raised when a requested canonical Pair does not exist."""


class RegistrationInputsMissingError(Exception):
	"""Raised when canonical raw registration files are incomplete or ambiguous."""


class CoreSubmissionError(Exception):
	"""Raised when the Core client cannot accept a job."""


def _required_raw_file(db: Session, product_id: int, role: str) -> ProductFile:
	files = list(
		db.scalars(
			select(ProductFile).where(
				ProductFile.product_id == product_id,
				ProductFile.file_role == role,
				ProductFile.file_type == "img",
			)
		).all()
	)
	if len(files) != 1:
		raise RegistrationInputsMissingError(
			f"Expected exactly one {role} img ProductFile for product {product_id}."
		)
	return files[0]


def _core_options(
	pair: Pair,
	source: Product,
	reference: Product,
	source_file: ProductFile,
	reference_file: ProductFile,
	requested_options: dict[str, Any],
) -> dict[str, Any]:
	return {
		"requested_options": requested_options,
		"source_product": {
			"id": source.id,
			"product_id": source.product_id,
			"instrument": source.instrument,
			"file": {
				"id": source_file.id,
				"file_name": source_file.file_name,
				"drive_file_id": source_file.drive_file_id,
				"drive_folder_id": source_file.drive_folder_id,
			},
		},
		"reference_product": {
			"id": reference.id,
			"product_id": reference.product_id,
			"instrument": reference.instrument,
			"file": {
				"id": reference_file.id,
				"file_name": reference_file.file_name,
				"drive_file_id": reference_file.drive_file_id,
				"drive_folder_id": reference_file.drive_folder_id,
			},
		},
	}


def create_registration_job(
	db: Session,
	pair_id: int,
	requested_options: dict[str, Any] | None = None,
	core_client: CoreClient | None = None,
) -> RegistrationJob:
	pair = db.get(Pair, pair_id)
	if pair is None:
		raise PairNotFoundError
	source = db.get(Product, pair.source_product_id)
	reference = db.get(Product, pair.reference_product_id)
	if source is None or reference is None:
		raise RegistrationInputsMissingError("Pair products are not available.")
	source_file = _required_raw_file(db, source.id, "source_raw")
	reference_file = _required_raw_file(db, reference.id, "reference_raw")
	options = requested_options or {}
	client = core_client or MockCoreClient()
	try:
		submission = client.submit_registration(
			pair.id,
			_core_options(pair, source, reference, source_file, reference_file, options),
		)
	except Exception as exc:
		raise CoreSubmissionError("Core registration job submission failed.") from exc

	job = RegistrationJob(
		pair_id=pair.id,
		status=submission.get("status", "QUEUED"),
		requested_options_json=json.dumps(options, sort_keys=True),
		core_job_id=submission["job_id"],
		created_at=datetime.utcnow(),
	)
	db.add(job)
	db.commit()
	db.refresh(job)
	return job


def get_registration_job(db: Session, job_id: int) -> RegistrationJob | None:
	return db.get(RegistrationJob, job_id)


def job_to_response_data(job: RegistrationJob) -> dict[str, Any]:
	return {
		"id": job.id,
		"pair_id": job.pair_id,
		"status": job.status,
		"requested_options": json.loads(job.requested_options_json),
		"core_job_id": job.core_job_id,
		"created_at": job.created_at,
		"started_at": job.started_at,
		"completed_at": job.completed_at,
		"error_message": job.error_message,
	}