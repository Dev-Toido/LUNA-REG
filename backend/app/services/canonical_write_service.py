"""Validation and persistence for canonical write APIs."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Pair, Product, ProductFile, Region
from app.schemas.canonical_write import PairCreate, PairUpdate, ProductCreate, ProductFileCreateRequest


class DuplicateCanonicalProductError(Exception):
    pass


class DuplicateCanonicalFileError(Exception):
    pass


class DuplicateCanonicalPairError(Exception):
    pass


class CanonicalReferenceError(Exception):
    pass


class CanonicalResourceNotFoundError(Exception):
    pass


def create_product(db: Session, data: ProductCreate) -> Product:
    if db.scalar(select(Product).where(Product.product_id == data.product_id)) is not None:
        raise DuplicateCanonicalProductError
    if data.region_id is not None and db.get(Region, data.region_id) is None:
        raise CanonicalReferenceError("Region not found")
    product = Product(**data.model_dump())
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCanonicalProductError from exc
    db.refresh(product)
    return product


def create_product_file(
    db: Session,
    product_id: int,
    data: ProductFileCreateRequest,
) -> ProductFile:
    if db.get(Product, product_id) is None:
        raise CanonicalResourceNotFoundError("Product not found")
    if db.scalar(select(ProductFile).where(ProductFile.drive_file_id == data.drive_file_id)) is not None:
        raise DuplicateCanonicalFileError
    product_file = ProductFile(product_id=product_id, **data.model_dump())
    db.add(product_file)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCanonicalFileError from exc
    db.refresh(product_file)
    return product_file


def create_pair(db: Session, data: PairCreate) -> Pair:
    if data.source_product_id == data.reference_product_id:
        raise CanonicalReferenceError("Source and reference products must be different")
    if db.get(Product, data.source_product_id) is None:
        raise CanonicalReferenceError("Source product not found")
    if db.get(Product, data.reference_product_id) is None:
        raise CanonicalReferenceError("Reference product not found")
    if data.region_id is not None and db.get(Region, data.region_id) is None:
        raise CanonicalReferenceError("Region not found")
    duplicate = db.scalar(
        select(Pair).where(
            Pair.source_product_id == data.source_product_id,
            Pair.reference_product_id == data.reference_product_id,
        )
    )
    if duplicate is not None:
        raise DuplicateCanonicalPairError
    pair = Pair(**data.model_dump())
    db.add(pair)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    db.refresh(pair)
    return pair


def update_pair(db: Session, pair_id: int, data: PairUpdate) -> Pair:
    pair = db.get(Pair, pair_id)
    if pair is None:
        raise CanonicalResourceNotFoundError("Pair not found")
    values = data.model_dump(exclude_unset=True)
    if "region_id" in values and values["region_id"] is not None and db.get(Region, values["region_id"]) is None:
        raise CanonicalReferenceError("Region not found")
    for name, value in values.items():
        setattr(pair, name, value)
    db.commit()
    db.refresh(pair)
    return pair