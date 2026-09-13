"""Read-only queries for the canonical product model."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Pair, Product, ProductFile, Region


def list_regions(db: Session) -> list[Region]:
    return list(db.scalars(select(Region).order_by(Region.id)).all())


def get_region(db: Session, region_id: int) -> Region | None:
    return db.get(Region, region_id)


def list_products(
    db: Session,
    instrument: str | None = None,
    mission: str | None = None,
    region_id: int | None = None,
) -> list[Product]:
    statement = select(Product).order_by(Product.id)
    if instrument is not None:
        statement = statement.where(Product.instrument == instrument)
    if mission is not None:
        statement = statement.where(Product.mission == mission)
    if region_id is not None:
        statement = statement.where(Product.region_id == region_id)
    return list(db.scalars(statement).all())


def get_product(db: Session, product_id: int) -> Product | None:
    return db.get(Product, product_id)


def list_product_files(db: Session, product_id: int) -> list[ProductFile]:
    statement = (
        select(ProductFile)
        .where(ProductFile.product_id == product_id)
        .order_by(ProductFile.id)
    )
    return list(db.scalars(statement).all())


def list_pairs(
    db: Session,
    source_instrument: str | None = None,
    reference_instrument: str | None = None,
    overlap_status: str | None = None,
    region_id: int | None = None,
) -> list[Pair]:
    statement = select(Pair).order_by(Pair.id)
    if source_instrument is not None:
        statement = statement.where(Pair.source_instrument == source_instrument)
    if reference_instrument is not None:
        statement = statement.where(Pair.reference_instrument == reference_instrument)
    if overlap_status is not None:
        statement = statement.where(Pair.overlap_status == overlap_status)
    if region_id is not None:
        statement = statement.where(Pair.region_id == region_id)
    return list(db.scalars(statement).all())


def get_pair(db: Session, pair_id: int) -> Pair | None:
    return db.get(Pair, pair_id)


def get_pair_registration_input(db: Session, pair_id: int) -> Pair | None:
    statement = (
        select(Pair)
        .options(
            selectinload(Pair.source_product).selectinload(Product.files),
            selectinload(Pair.reference_product).selectinload(Product.files),
        )
        .where(Pair.id == pair_id)
    )
    return db.scalar(statement)
