"""Read-only API for canonical regions, products, and pairs."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.canonical import (
    PairRegistrationInputResponse,
    PairResponse,
    ProductFileResponse,
    ProductResponse,
)
from app.schemas.region import RegionResponse
from app.services.canonical_service import (
    get_pair,
    get_pair_registration_input,
    get_product,
    get_region,
    list_pairs,
    list_product_files,
    list_products,
    list_regions,
)

router = APIRouter()


@router.get("/regions", response_model=list[RegionResponse], tags=["regions"])
def list_regions_endpoint(db: Session = Depends(get_db)) -> list[RegionResponse]:
    return list_regions(db)


@router.get("/regions/{region_id}", response_model=RegionResponse, tags=["regions"])
def get_region_endpoint(
    region_id: int,
    db: Session = Depends(get_db),
) -> RegionResponse:
    region = get_region(db, region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Region not found")
    return region


@router.get("/products", response_model=list[ProductResponse], tags=["products"])
def list_products_endpoint(
    instrument: str | None = None,
    mission: str | None = None,
    region_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[ProductResponse]:
    return list_products(db, instrument=instrument, mission=mission, region_id=region_id)


@router.get("/products/{product_id}/files", response_model=list[ProductFileResponse], tags=["products"])
def list_product_files_endpoint(
    product_id: int,
    db: Session = Depends(get_db),
) -> list[ProductFileResponse]:
    if get_product(db, product_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return list_product_files(db, product_id)


@router.get("/products/{product_id}", response_model=ProductResponse, tags=["products"])
def get_product_endpoint(
    product_id: int,
    db: Session = Depends(get_db),
) -> ProductResponse:
    product = get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.get("/pairs", response_model=list[PairResponse], tags=["pairs"])
def list_pairs_endpoint(
    source_instrument: str | None = None,
    reference_instrument: str | None = None,
    overlap_status: str | None = None,
    region_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[PairResponse]:
    return list_pairs(
        db,
        source_instrument=source_instrument,
        reference_instrument=reference_instrument,
        overlap_status=overlap_status,
        region_id=region_id,
    )


@router.get("/pairs/{pair_id}/registration-input", response_model=PairRegistrationInputResponse, tags=["pairs"])
def get_pair_registration_input_endpoint(
    pair_id: int,
    db: Session = Depends(get_db),
) -> PairRegistrationInputResponse:
    pair = get_pair_registration_input(db, pair_id)
    if pair is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pair not found")
    return PairRegistrationInputResponse.model_validate({
        "pair": pair,
        "source": {"product": pair.source_product, "files": pair.source_product.files},
        "reference": {
            "product": pair.reference_product,
            "files": pair.reference_product.files,
        },
    })


@router.get("/pairs/{pair_id}", response_model=PairResponse, tags=["pairs"])
def get_pair_endpoint(
    pair_id: int,
    db: Session = Depends(get_db),
) -> PairResponse:
    pair = get_pair(db, pair_id)
    if pair is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pair not found")
    return pair
