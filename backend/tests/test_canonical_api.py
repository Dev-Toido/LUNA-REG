"""Focused tests for the canonical read-only API layer."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api import canonical
from app.db.database import Base
from app.db.models import Pair, Product, ProductFile, Region
from app.main import app, read_health, read_root


def _database() -> tuple[Session, int, int]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    region = Region(
        name="Synthetic Region",
        region_type="catalog",
        lat_min=-1,
        lat_max=1,
        lon_min=10,
        lon_max=12,
    )
    db.add(region)
    db.flush()
    source = Product(
        region_id=region.id,
        instrument="OHRC",
        mission="Chandrayaan-2",
        product_id="SOURCE-1",
        acquisition_time=datetime(2021, 1, 1),
        resolution=0.23,
        product_type="image",
        calibration_status="Calibrated",
        footprint_json='{"upper_left":{"latitude":0,"longitude":10}}',
    )
    reference = Product(
        region_id=region.id,
        instrument="TMC-2",
        mission="Chandrayaan-2",
        product_id="REFERENCE-1",
        product_type="image",
        calibration_status="Calibrated",
    )
    db.add_all([source, reference])
    db.flush()
    db.add_all(
        [
            ProductFile(
                product_id=source.id,
                file_role="source_raw",
                file_name="source.img",
                file_type="img",
                drive_file_id="drive-source",
            ),
            ProductFile(
                product_id=reference.id,
                file_role="reference_raw",
                file_name="reference.img",
                file_type="img",
                drive_file_id="drive-reference",
            ),
        ]
    )
    pair = Pair(
        region_id=region.id,
        source_product_id=source.id,
        reference_product_id=reference.id,
        source_instrument="OHRC",
        reference_instrument="TMC-2",
        overlap_status="UNVERIFIED",
        verification_notes="Not independently verified",
    )
    db.add(pair)
    db.commit()
    return db, source.id, pair.id


def test_listing_and_filtering_products() -> None:
    db, source_id, _ = _database()
    assert len(canonical.list_products_endpoint(db=db)) == 2
    filtered = canonical.list_products_endpoint(instrument="OHRC", db=db)
    assert [product.id for product in filtered] == [source_id]
    assert canonical.list_products_endpoint(mission="Chandrayaan-2", region_id=1, db=db)
    db.close()


def test_listing_pairs_and_registration_input() -> None:
    db, source_id, pair_id = _database()
    pairs = canonical.list_pairs_endpoint(overlap_status="UNVERIFIED", db=db)
    assert len(pairs) == 1
    result = canonical.get_pair_registration_input_endpoint(pair_id, db)
    assert result.pair.overlap_status == "UNVERIFIED"
    assert result.source.product.id == source_id
    assert result.source.files[0].drive_file_id == "drive-source"
    assert result.reference.files[0].file_name == "reference.img"
    db.close()


def test_missing_canonical_ids_return_404() -> None:
    db, _, _ = _database()
    for endpoint in (
        lambda: canonical.get_region_endpoint(999, db),
        lambda: canonical.get_product_endpoint(999, db),
        lambda: canonical.list_product_files_endpoint(999, db),
        lambda: canonical.get_pair_endpoint(999, db),
        lambda: canonical.get_pair_registration_input_endpoint(999, db),
    ):
        try:
            endpoint()
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("missing canonical resource was not rejected")
    db.close()


def test_legacy_routes_and_root_health_preserved() -> None:
    paths = app.openapi()["paths"]
    for path in (
        "/",
        "/health",
        "/datasets",
        "/datasets/{dataset_id}",
        "/datasets/{dataset_id}/files",
        "/auth/google/login",
        "/auth/google/callback",
        "/storage/drive/status",
    ):
        assert path in paths
    assert read_root() == {"project": "LUNA-REG", "status": "running"}
    assert read_health() == {"status": "ok"}
