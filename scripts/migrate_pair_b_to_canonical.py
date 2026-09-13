"""Migrate legacy Pair-B metadata into the canonical product model."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import SessionLocal
from app.db.models import Dataset, DatasetFile, Pair, Product, ProductFile
from app.services.footprint import conservative_bounding_box, determine_overlap
from app.services.product_metadata import Coordinate, ProductMetadata, extract_product_metadata

PAIR_ROOT = Path(r"C:\My sep_stuffs\SIH 2026\Image_Registration_Test\dataset\Pair-B")
EXPECTED_PAIR_ID = "PAIR-B"
EXPECTED_PRODUCTS = {
    "OHRC": "ch2_ohr_ncp_20210405T0640233469_d_img_d18",
    "TMC-2": "ch2_tmc_ncn_20211116T1329461965_d_img_d18",
}


class MigrationError(Exception):
    """Raised when canonical migration cannot be completed safely."""


class DryRunRollback(Exception):
    """Internal signal used to roll back a dry-run transaction."""


@dataclass
class MigrationReport:
    region_status: str = "not created: no explicit region classification"
    product_ids: list[str] = field(default_factory=list)
    pair_id: str = EXPECTED_PAIR_ID
    pair_status: str = "created"
    files_created: int = 0
    files_reused: int = 0
    files_skipped: int = 0
    overlap_status: str = "UNVERIFIED"
    warnings: list[str] = field(default_factory=list)


def product_xml_paths() -> dict[str, Path]:
    return {
        "OHRC": PAIR_ROOT / "OHRC/data/calibrated/20210405/ch2_ohr_ncp_20210405T0640233469_d_img_d18.xml",
        "TMC-2": PAIR_ROOT / "TMC-2/data/calibrated/20211116/ch2_tmc_ncn_20211116T1329461965_d_img_d18.xml",
    }


def _metadata_matches_legacy(metadata: ProductMetadata, legacy_id: str) -> bool:
    return bool(metadata.product_id) and metadata.product_id.casefold() == legacy_id.casefold()


def _footprint_json(metadata: ProductMetadata) -> str:
    return json.dumps(
        {
            name: {"latitude": point.latitude, "longitude": point.longitude}
            for name, point in metadata.footprint.items()
        },
        sort_keys=True,
    )


def _footprint_fields(metadata: ProductMetadata) -> dict[str, object]:
    if not metadata.footprint:
        return {
            "footprint_json": None,
            "footprint_lat_min": None,
            "footprint_lat_max": None,
            "footprint_lon_min": None,
            "footprint_lon_max": None,
        }
    points = tuple(metadata.footprint.values())
    if any(point.latitude is None or point.longitude is None for point in points):
        raise MigrationError(f"Product {metadata.product_id} has incomplete footprint coordinates.")
    bounds = conservative_bounding_box(points)  # Original corners remain in footprint_json.
    return {
        "footprint_json": _footprint_json(metadata),
        "footprint_lat_min": bounds.lat_min,
        "footprint_lat_max": bounds.lat_max,
        "footprint_lon_min": bounds.lon_min,
        "footprint_lon_max": bounds.lon_max,
    }


def _find_or_create_product(
    db: Session,
    metadata: ProductMetadata,
    report: MigrationReport,
) -> Product:
    required = {
        "product_id": metadata.product_id,
        "instrument": metadata.instrument,
        "mission": metadata.mission,
        "product_type": metadata.product_type,
        "calibration_status": metadata.calibration_status,
    }
    missing = [name for name, value in required.items() if value is None]
    if missing:
        raise MigrationError(
            f"Cannot create Product {metadata.product_id or '<unknown>'}: missing {', '.join(missing)}"
        )

    footprint_fields = _footprint_fields(metadata)
    product = db.scalar(select(Product).where(Product.product_id == metadata.product_id))
    if product is None:
        product = Product(
            region_id=None,
            product_id=metadata.product_id,
            instrument=metadata.instrument,
            mission=metadata.mission,
            acquisition_time=metadata.acquisition_time,
            resolution=metadata.resolution,
            product_type=metadata.product_type,
            calibration_status=metadata.calibration_status,
            **footprint_fields,
        )
        db.add(product)
        db.flush()
    elif product.footprint_json is None:
        for name, value in footprint_fields.items():
            setattr(product, name, value)
    elif product.footprint_json != footprint_fields["footprint_json"]:
        raise MigrationError(f"Product {metadata.product_id} has conflicting footprint metadata.")
    if metadata.product_id not in report.product_ids:
        report.product_ids.append(metadata.product_id)
    return product


def _find_or_create_pair(
    db: Session,
    dataset: Dataset,
    source: Product,
    reference: Product,
    report: MigrationReport,
    overlap_warning: str,
) -> Pair:
    pair = db.scalar(
        select(Pair).where(
            Pair.source_product_id == source.id,
            Pair.reference_product_id == reference.id,
        )
    )
    if pair is None:
        pair = Pair(
            region_id=None,
            source_product_id=source.id,
            reference_product_id=reference.id,
            source_instrument=dataset.source_instrument,
            reference_instrument=dataset.reference_instrument,
            overlap_status="UNVERIFIED",
        )
        db.add(pair)
        db.flush()
        report.pair_status = "created"
    else:
        report.pair_status = "reused"
    report.overlap_status = pair.overlap_status
    if overlap_warning not in report.warnings:
        report.warnings.append(overlap_warning)
    return pair


def _product_for_file(
    legacy_file: DatasetFile,
    source: Product,
    reference: Product,
    report: MigrationReport,
) -> Product | None:
    if legacy_file.file_role == "source_raw":
        return source
    if legacy_file.file_role == "reference_raw":
        return reference
    lower_name = legacy_file.file_name.casefold()
    if "ohr" in lower_name or "ohrc" in lower_name:
        return source
    if "tmc" in lower_name:
        return reference
    report.warnings.append(f"Skipped ambiguous legacy file: {legacy_file.file_name}")
    return None


def migrate_pair_b(db: Session, dataset_id: int, dry_run: bool = False) -> MigrationReport:
    db.rollback()
    report = MigrationReport()
    try:
        with db.begin():
            dataset = db.get(Dataset, dataset_id)
            if dataset is None:
                raise MigrationError(f"Dataset {dataset_id} does not exist.")
            if dataset.pair_id != EXPECTED_PAIR_ID:
                raise MigrationError(
                    f"Dataset {dataset_id} has pair_id {dataset.pair_id!r}, expected {EXPECTED_PAIR_ID!r}."
                )

            metadata = {
                instrument: extract_product_metadata(path)
                for instrument, path in product_xml_paths().items()
            }
            if not _metadata_matches_legacy(metadata["OHRC"], dataset.source_product_id):
                raise MigrationError("OHRC XML product ID does not match the legacy source product ID.")
            if not _metadata_matches_legacy(metadata["TMC-2"], dataset.reference_product_id):
                raise MigrationError("TMC-2 XML product ID does not match the legacy reference product ID.")

            source = _find_or_create_product(db, metadata["OHRC"], report)
            reference = _find_or_create_product(db, metadata["TMC-2"], report)
            overlap = determine_overlap(metadata["OHRC"].footprint, metadata["TMC-2"].footprint)
            warning = overlap.warning or "Pair overlap has not been independently verified."
            _find_or_create_pair(db, dataset, source, reference, report, warning)
            report.warnings.append(
                "No explicit region classification exists in the legacy dataset; region_id remains NULL."
            )

            legacy_files = db.scalars(
                select(DatasetFile).where(DatasetFile.dataset_id == dataset_id)
            ).all()
            for legacy_file in legacy_files:
                product = _product_for_file(legacy_file, source, reference, report)
                if product is None:
                    report.files_skipped += 1
                    continue
                existing = db.scalar(
                    select(ProductFile).where(ProductFile.drive_file_id == legacy_file.drive_file_id)
                )
                if existing is not None:
                    report.files_reused += 1
                    continue
                db.add(
                    ProductFile(
                        product_id=product.id,
                        file_role=legacy_file.file_role,
                        file_name=legacy_file.file_name,
                        file_type=legacy_file.file_type,
                        drive_file_id=legacy_file.drive_file_id,
                        drive_folder_id=legacy_file.drive_folder_id,
                        file_size_bytes=legacy_file.file_size_bytes,
                        mime_type=legacy_file.mime_type,
                        checksum=legacy_file.checksum,
                    )
                )
                report.files_created += 1
            db.flush()
            if dry_run:
                raise DryRunRollback
    except DryRunRollback:
        db.rollback()
    except Exception:
        db.rollback()
        raise
    return report


def print_report(report: MigrationReport, dry_run: bool) -> None:
    print(f"Region: {report.region_status}")
    print(f"Products: {', '.join(report.product_ids)}")
    print(f"Pair: {report.pair_id} ({report.pair_status})")
    print(f"ProductFiles created: {report.files_created}")
    print(f"ProductFiles reused: {report.files_reused}")
    print(f"ProductFiles skipped: {report.files_skipped}")
    print(f"Overlap status: {report.overlap_status}")
    print(f"Dry-run: {dry_run}")
    print("Warnings:")
    for warning in report.warnings:
        print(f"- {warning}")
    if not report.warnings:
        print("- None")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        report = migrate_pair_b(db, args.dataset_id, dry_run=args.dry_run)
        print_report(report, args.dry_run)
        return 0
    except MigrationError as exc:
        print(f"Migration refused: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
