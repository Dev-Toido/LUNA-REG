"""Isolated schema checks for the canonical product-centric model."""

from datetime import datetime

from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import Base
from app.db.models import Pair, Product, ProductFile, Region


def _product(region_id: int, product_id: str, instrument: str) -> Product:
    return Product(
        region_id=region_id,
        instrument=instrument,
        mission="CHANDRAYAAN",
        product_id=product_id,
        acquisition_time=datetime(2021, 1, 1),
        resolution=1.0,
        product_type="image",
        calibration_status="calibrated",
    )


def test_canonical_tables_and_relationships() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)

    assert {"regions", "products", "product_files", "pairs"}.issubset(
        inspector.get_table_names()
    )
    assert "datasets" in inspector.get_table_names()
    assert "dataset_files" in inspector.get_table_names()
    product_columns = {column["name"]: column for column in inspector.get_columns("products")}
    pair_columns = {column["name"]: column for column in inspector.get_columns("pairs")}
    assert {
        "footprint_json",
        "footprint_lat_min",
        "footprint_lat_max",
        "footprint_lon_min",
        "footprint_lon_max",
    }.issubset(product_columns)
    assert "overlap_geometry_json" in pair_columns
    assert product_columns["region_id"]["nullable"] is True
    assert pair_columns["region_id"]["nullable"] is True

    with Session(engine) as db:
        region = Region(
            name="Test Region",
            region_type="bounding_box",
            lat_min=-1.0,
            lat_max=1.0,
            lon_min=10.0,
            lon_max=12.0,
            description="Synthetic region",
        )
        source = _product(1, "SOURCE-1", "OHRC")
        reference = _product(1, "REFERENCE-1", "TMC-2")
        region.products.extend([source, reference])
        db.add(region)
        db.commit()

        assert source.region is region
        assert reference in region.products
        assert region.pairs == []

        product_file = ProductFile(
            product_id=source.id,
            file_role="source_raw",
            file_name="source.img",
            file_type="img",
            drive_file_id="drive-source",
        )
        pair = Pair(
            region_id=region.id,
            source_product_id=source.id,
            reference_product_id=reference.id,
            source_instrument="OHRC",
            reference_instrument="TMC-2",
            overlap_status="verified",
        )
        source.files.append(product_file)
        region.pairs.append(pair)
        db.commit()

        assert product_file.product is source
        assert pair.source_product is source
        assert pair.reference_product is reference
        assert pair in region.pairs


def test_canonical_unique_constraints() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        region = Region(
            name="Test Region",
            region_type="bounding_box",
            lat_min=0.0,
            lat_max=1.0,
            lon_min=0.0,
            lon_max=1.0,
        )
        db.add(region)
        db.commit()
        source = _product(region.id, "SOURCE-1", "OHRC")
        reference = _product(region.id, "REFERENCE-1", "TMC-2")
        db.add_all([source, reference])
        db.commit()

        db.add(_product(region.id, "SOURCE-1", "OTHER"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            raise AssertionError("duplicate Product.product_id was accepted")

        db.add(
            ProductFile(
                product_id=source.id,
                file_role="source_raw",
                file_name="source.img",
                file_type="img",
                drive_file_id="drive-source",
            )
        )
        db.commit()
        db.add(
            ProductFile(
                product_id=reference.id,
                file_role="reference_raw",
                file_name="reference.img",
                file_type="img",
                drive_file_id="drive-source",
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            raise AssertionError("duplicate ProductFile.drive_file_id was accepted")

        pair = Pair(
            region_id=region.id,
            source_product_id=source.id,
            reference_product_id=reference.id,
            source_instrument="OHRC",
            reference_instrument="TMC-2",
            overlap_status="unknown",
        )
        db.add(pair)
        db.commit()
        db.add(
            Pair(
                region_id=region.id,
                source_product_id=source.id,
                reference_product_id=reference.id,
                source_instrument="OHRC",
                reference_instrument="TMC-2",
                overlap_status="unknown",
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            raise AssertionError("duplicate source/reference Pair was accepted")
