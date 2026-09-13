"""Isolated tests for the Pair-B canonical migration."""

from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.database import Base
from app.db.models import Dataset, DatasetFile, Pair, Product, ProductFile, Region
from app.services.product_metadata import Coordinate, ProductMetadata
from scripts import migrate_pair_b_to_canonical as migration


SOURCE_ID = "ch2_ohr_ncp_20210405T0640233469_d_img_d18"
REFERENCE_ID = "ch2_tmc_ncn_20211116T1329461965_d_img_d18"


def _metadata(product_id: str, instrument: str) -> ProductMetadata:
    return ProductMetadata(
        product_id=product_id,
        instrument=instrument,
        mission="Chandrayaan-2",
        acquisition_time=datetime(2021, 1, 1, tzinfo=timezone.utc),
        image_width=10,
        image_height=20,
        resolution=1.0,
        product_type="Product_Observational",
        calibration_status="Calibrated",
        footprint={
            "upper_left": Coordinate(-1.0, 10.0),
            "upper_right": Coordinate(-1.0, 12.0),
            "lower_left": Coordinate(1.0, 10.0),
            "lower_right": Coordinate(1.0, 12.0),
        },
    )


def _database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    dataset = Dataset(
        pair_id="PAIR-B",
        source_instrument="OHRC",
        source_product_id=SOURCE_ID,
        reference_instrument="TMC-2",
        reference_product_id=REFERENCE_ID,
    )
    db.add(dataset)
    db.flush()
    db.add_all(
        [
            DatasetFile(
                dataset_id=dataset.id,
                file_role="source_raw",
                file_name="source.img",
                file_type="img",
                drive_file_id="drive-source",
            ),
            DatasetFile(
                dataset_id=dataset.id,
                file_role="reference_raw",
                file_name="reference.img",
                file_type="img",
                drive_file_id="drive-reference",
            ),
            DatasetFile(
                dataset_id=dataset.id,
                file_role="metadata",
                file_name="ohr_product.xml",
                file_type="xml",
                drive_file_id="drive-ohr-xml",
            ),
            DatasetFile(
                dataset_id=dataset.id,
                file_role="metadata",
                file_name="tmc_geometry.xml",
                file_type="xml",
                drive_file_id="drive-tmc-xml",
            ),
        ]
    )
    db.commit()
    return db, dataset.id


def _patch_metadata(monkeypatch, footprints=True):
    source = _metadata(SOURCE_ID.lower(), "OHRC")
    reference = _metadata(REFERENCE_ID.lower(), "TMC-2")
    if not footprints:
        source.footprint = {}
    monkeypatch.setattr(
        migration,
        "product_xml_paths",
        lambda: {"OHRC": "source.xml", "TMC-2": "reference.xml"},
    )
    monkeypatch.setattr(
        migration,
        "extract_product_metadata",
        lambda path: source if "source" in str(path) else reference,
    )


def test_dry_run_does_not_modify_db(monkeypatch) -> None:
    db, dataset_id = _database()
    _patch_metadata(monkeypatch)
    report = migration.migrate_pair_b(db, dataset_id, dry_run=True)
    assert report.files_created == 4
    assert db.scalar(select(Region)) is None
    assert db.scalar(select(Product)) is None
    assert db.scalar(select(Pair)) is None
    assert db.scalar(select(DatasetFile).where(DatasetFile.drive_file_id == "drive-source"))
    db.close()


def test_migration_is_idempotent_and_reuses_drive_ids(monkeypatch) -> None:
    db, dataset_id = _database()
    _patch_metadata(monkeypatch)
    first = migration.migrate_pair_b(db, dataset_id)
    second = migration.migrate_pair_b(db, dataset_id)
    assert first.files_created == 4
    assert second.files_created == 0
    assert second.files_reused == 4
    assert db.query(Product).count() == 2
    assert db.query(ProductFile).count() == 4
    assert db.query(Pair).count() == 1
    assert all(product.footprint_json for product in db.query(Product))
    assert db.scalar(select(Pair)).region_id is None
    assert db.scalar(select(Pair)).overlap_status == "UNVERIFIED"
    assert {file.drive_file_id for file in db.query(ProductFile)} == {
        "drive-source",
        "drive-reference",
        "drive-ohr-xml",
        "drive-tmc-xml",
    }
    db.close()


def test_existing_product_file_is_reused(monkeypatch) -> None:
    db, dataset_id = _database()
    _patch_metadata(monkeypatch)
    region = Region(
        name="PAIR-B-common-footprint",
        region_type="bounding_box",
        lat_min=-1,
        lat_max=1,
        lon_min=10,
        lon_max=12,
    )
    db.add(region)
    db.flush()
    source = Product(
        region_id=region.id,
        product_id=SOURCE_ID.lower(),
        instrument="OHRC",
        mission="Chandrayaan-2",
        product_type="Product_Observational",
        calibration_status="Calibrated",
    )
    reference = Product(
        region_id=region.id,
        product_id=REFERENCE_ID.lower(),
        instrument="TMC-2",
        mission="Chandrayaan-2",
        product_type="Product_Observational",
        calibration_status="Calibrated",
    )
    db.add_all([source, reference])
    db.flush()
    db.add(ProductFile(product_id=source.id, file_role="source_raw", file_name="source.img", file_type="img", drive_file_id="drive-source"))
    db.commit()
    report = migration.migrate_pair_b(db, dataset_id)
    assert report.files_reused == 1
    assert report.files_created == 3
    db.close()


def test_transaction_rolls_back_on_failure(monkeypatch) -> None:
    db, dataset_id = _database()
    _patch_metadata(monkeypatch)
    original = migration._find_or_create_pair
    monkeypatch.setattr(
        migration,
        "_find_or_create_pair",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("synthetic failure")),
    )
    try:
        migration.migrate_pair_b(db, dataset_id)
    except RuntimeError:
        pass
    else:
        raise AssertionError("migration failure was not raised")
    assert db.scalar(select(Region)) is None
    assert db.scalar(select(Product)) is None
    assert db.query(Dataset).count() == 1
    assert db.query(DatasetFile).count() == 4
    monkeypatch.setattr(migration, "_find_or_create_pair", original)
    db.close()


def test_migration_refuses_insufficient_geography(monkeypatch) -> None:
    db, dataset_id = _database()
    _patch_metadata(monkeypatch, footprints=False)
    report = migration.migrate_pair_b(db, dataset_id)
    assert "no explicit region classification" in report.region_status
    assert db.scalar(select(Region)) is None
    assert db.query(Product).count() == 2
    assert db.scalar(select(Pair)).overlap_status == "UNVERIFIED"
    db.close()
