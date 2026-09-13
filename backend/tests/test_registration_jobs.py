"""Tests for the Backend-to-Core registration job contract."""

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.api import registration_jobs
from app.core_client.client import MockCoreClient
from app.db.database import Base
from app.db.models import Pair, Product, ProductFile, RegistrationJob
from app.main import app, read_health, read_root


class CapturingCoreClient:
    def __init__(self) -> None:
        self.pair_id = None
        self.options = None

    def submit_registration(self, pair_id, registration_input, options=None):
        self.pair_id = pair_id
        self.registration_input = registration_input
        self.options = options
        return {"core_job_id": "core-job-1", "pair_id": pair_id, "status": "QUEUED"}


def _database(include_source=True, include_reference=True):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    source = Product(
        instrument="OHRC",
        mission="Chandrayaan-2",
        product_id="SOURCE-1",
        product_type="image",
        calibration_status="Calibrated",
    )
    reference = Product(
        instrument="TMC-2",
        mission="Chandrayaan-2",
        product_id="REFERENCE-1",
        product_type="image",
        calibration_status="Calibrated",
    )
    db.add_all([source, reference])
    db.flush()
    pair = Pair(
        source_product_id=source.id,
        reference_product_id=reference.id,
        source_instrument="OHRC",
        reference_instrument="TMC-2",
        overlap_status="UNVERIFIED",
    )
    db.add(pair)
    if include_source:
        db.add(ProductFile(product_id=source.id, file_role="source_raw", file_name="source.img", file_type="img", drive_file_id="drive-source", drive_folder_id="folder-source"))
    if include_reference:
        db.add(ProductFile(product_id=reference.id, file_role="reference_raw", file_name="reference.img", file_type="img", drive_file_id="drive-reference", drive_folder_id="folder-reference"))
    db.commit()
    db.refresh(pair)
    return db, pair.id


def test_missing_pair_returns_404() -> None:
    db, _ = _database()
    try:
        registration_jobs.submit_registration_job(999, None, db, CapturingCoreClient())
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("missing pair was not rejected")
    db.close()


def test_missing_source_or_reference_returns_409() -> None:
    for include_source, include_reference in ((False, True), (True, False)):
        db, pair_id = _database(include_source, include_reference)
        try:
            registration_jobs.submit_registration_job(pair_id, None, db, CapturingCoreClient())
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("missing registration input was not rejected")
        db.close()


def test_successful_mock_submission_persists_and_retrieves_job() -> None:
    db, pair_id = _database()
    client = CapturingCoreClient()
    original = registration_jobs.create_registration_job
    registration_jobs.create_registration_job = lambda db, pair_id, requested_options=None, core_client=None: original(
        db, pair_id, requested_options, client
    )
    try:
        response = registration_jobs.submit_registration_job(
            pair_id,
            registration_jobs.CoreJobCreate(options={"roi": "synthetic"}),
            db,
        )
    finally:
        registration_jobs.create_registration_job = original
    assert response.status == "QUEUED"
    assert response.core_job_id == "core-job-1"
    assert client.pair_id == pair_id
    assert client.registration_input["source_product"]["files"][0]["drive_file_id"] == "drive-source"
    job = db.scalar(select(RegistrationJob).where(RegistrationJob.id == response.id))
    assert job is not None and job.status == "QUEUED"
    retrieved = registration_jobs.get_registration_job_endpoint(response.id, db)
    assert retrieved.id == response.id
    db.close()


def test_invalid_job_id_returns_404() -> None:
    db, _ = _database()
    try:
        registration_jobs.get_registration_job_endpoint(999, db)
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("missing job was not rejected")
    db.close()


def test_core_failure_persists_failed_job() -> None:
    class FailingCoreClient:
        def submit_registration(self, pair_id, registration_input, options=None):
            raise RuntimeError("synthetic core failure")

    db, pair_id = _database()
    try:
        registration_jobs.submit_registration_job(pair_id, None, db, FailingCoreClient())
    except HTTPException as exc:
        assert exc.status_code == 502
    else:
        raise AssertionError("Core failure was not surfaced")
    job = db.scalar(select(RegistrationJob).order_by(RegistrationJob.id.desc()))
    assert job is not None and job.status == "FAILED"
    assert "synthetic core failure" in job.error_message
    db.close()


def test_mock_client_contract_and_legacy_routes() -> None:
    result = MockCoreClient().submit_registration(1, {"pair_id": 1}, {"x": 1})
    assert result["core_job_id"].startswith("mock-") and result["status"] == "QUEUED"
    paths = app.openapi()["paths"]
    assert "/datasets" in paths and "/auth/google/login" in paths and "/storage/drive/status" in paths
    assert read_root() == {"project": "LUNA-REG", "status": "running"}
    assert read_health() == {"status": "ok"}
