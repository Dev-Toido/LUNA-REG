"""Versioned canonical write endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.canonical import PairResponse, ProductFileResponse, ProductResponse
from app.schemas.canonical_write import PairCreate, PairUpdate, ProductCreate, ProductFileCreateRequest
from app.services.canonical_write_service import (
    CanonicalReferenceError,
    CanonicalResourceNotFoundError,
    DuplicateCanonicalFileError,
    DuplicateCanonicalPairError,
    DuplicateCanonicalProductError,
    create_pair,
    create_product,
    create_product_file,
    update_pair,
)

router = APIRouter(prefix="/api/v1", tags=["canonical-write"])


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, tags=["products"])
def create_product_endpoint(data: ProductCreate, db: Session = Depends(get_db)) -> ProductResponse:
    try:
        return create_product(db, data)
    except DuplicateCanonicalProductError as exc:
        raise HTTPException(status_code=409, detail="Product product_id already exists") from exc
    except CanonicalReferenceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/products/{product_id}/files", response_model=ProductFileResponse, status_code=status.HTTP_201_CREATED, tags=["products"])
def create_product_file_endpoint(product_id: int, data: ProductFileCreateRequest, db: Session = Depends(get_db)) -> ProductFileResponse:
    try:
        return create_product_file(db, product_id, data)
    except CanonicalResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DuplicateCanonicalFileError as exc:
        raise HTTPException(status_code=409, detail="drive_file_id already exists") from exc


@router.post("/pairs", response_model=PairResponse, status_code=status.HTTP_201_CREATED, tags=["pairs"])
def create_pair_endpoint(data: PairCreate, db: Session = Depends(get_db)) -> PairResponse:
    try:
        return create_pair(db, data)
    except CanonicalReferenceError as exc:
        raise HTTPException(status_code=404 if "not found" in str(exc) else 409, detail=str(exc)) from exc
    except DuplicateCanonicalPairError as exc:
        raise HTTPException(status_code=409, detail="Pair already exists") from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Pair already exists") from exc


@router.patch("/pairs/{pair_id}", response_model=PairResponse, tags=["pairs"])
def update_pair_endpoint(pair_id: int, data: PairUpdate, db: Session = Depends(get_db)) -> PairResponse:
    try:
        return update_pair(db, pair_id, data)
    except CanonicalResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CanonicalReferenceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc