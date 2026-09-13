"""Tests for versioned canonical write endpoints."""

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api import canonical_write
from app.db.database import Base
from app.schemas.canonical_write import PairCreate, PairUpdate, ProductCreate, ProductFileCreateRequest
from app.main import app


def test_canonical_write_success_duplicates_and_invalid_references() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    source = canonical_write.create_product_endpoint(
        ProductCreate(instrument="OHRC", mission="Chandrayaan-2", product_id="SOURCE-1", product_type="image", calibration_status="Calibrated"),
        db,
    )
    reference = canonical_write.create_product_endpoint(
        ProductCreate(instrument="TMC-2", mission="Chandrayaan-2", product_id="REFERENCE-1", product_type="image", calibration_status="Calibrated"),
        db,
    )
    assert source.id != reference.id
    try:
        canonical_write.create_product_endpoint(
            ProductCreate(instrument="OHRC", mission="Chandrayaan-2", product_id="SOURCE-1", product_type="image", calibration_status="Calibrated"), db
        )
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("duplicate product was accepted")

    source_file = canonical_write.create_product_file_endpoint(
        source.id,
        ProductFileCreateRequest(file_role="source_raw", file_name="source.img", file_type="img", drive_file_id="drive-source"),
        db,
    )
    reference_file = canonical_write.create_product_file_endpoint(
        reference.id,
        ProductFileCreateRequest(file_role="reference_raw", file_name="reference.img", file_type="img", drive_file_id="drive-reference"),
        db,
    )
    assert source_file.drive_file_id == "drive-source"
    assert reference_file.drive_file_id == "drive-reference"
    try:
        canonical_write.create_product_file_endpoint(
            source.id,
            ProductFileCreateRequest(file_role="test", file_name="other.txt", file_type="txt", drive_file_id="drive-source"),
            db,
        )
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("duplicate Drive file ID was accepted")

    pair = canonical_write.create_pair_endpoint(
        PairCreate(source_product_id=source.id, reference_product_id=reference.id, source_instrument="OHRC", reference_instrument="TMC-2"),
        db,
    )
    assert pair.overlap_status == "UNVERIFIED"
    updated = canonical_write.update_pair_endpoint(pair.id, PairUpdate(overlap_status="RUNNING"), db)
    assert updated.overlap_status == "RUNNING"
    try:
        canonical_write.create_pair_endpoint(
            PairCreate(source_product_id=source.id, reference_product_id=source.id, source_instrument="OHRC", reference_instrument="OHRC"), db
        )
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("self-pair was accepted")
    try:
        canonical_write.create_pair_endpoint(
            PairCreate(source_product_id=999, reference_product_id=reference.id, source_instrument="OHRC", reference_instrument="TMC-2"), db
        )
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("invalid product reference was accepted")
    db.close()


def test_missing_product_file_and_pair_return_404() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    try:
        canonical_write.create_product_file_endpoint(
            999,
            ProductFileCreateRequest(file_role="test", file_name="x.txt", file_type="txt", drive_file_id="drive-x"),
            db,
        )
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("missing product was accepted")
    try:
        canonical_write.update_pair_endpoint(999, PairUpdate(overlap_status="FAILED"), db)
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("missing pair was accepted")
    db.close()


def test_write_routes_and_existing_read_routes_are_exposed() -> None:
    paths = app.openapi()["paths"]
    assert "/api/v1/products" in paths and "post" in paths["/api/v1/products"]
    assert "/api/v1/products/{product_id}/files" in paths
    assert "/api/v1/pairs" in paths and "post" in paths["/api/v1/pairs"]
    assert "/api/v1/pairs/{pair_id}" in paths and "patch" in paths["/api/v1/pairs/{pair_id}"]
    assert "/api/v1/regions" in paths and "/datasets" in paths
