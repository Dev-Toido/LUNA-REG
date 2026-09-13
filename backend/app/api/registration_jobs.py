"""Backend-to-Core registration job endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.core_job import CoreJobCreate, CoreJobResponse
from app.services.registration_job_service import (
    CoreSubmissionError,
    PairNotFoundError,
    RegistrationInputsMissingError,
    create_registration_job,
    get_registration_job,
    job_to_response_data,
)

router = APIRouter(tags=["registration-jobs"])


@router.post("/pairs/{pair_id}/registration-jobs", response_model=CoreJobResponse, status_code=status.HTTP_201_CREATED)
def submit_registration_job(
    pair_id: int,
    job_data: CoreJobCreate | None = None,
    db: Session = Depends(get_db),
) -> CoreJobResponse:
    try:
        job = create_registration_job(
            db,
            pair_id,
            requested_options=(job_data.options if job_data else None),
        )
    except PairNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pair not found",
        ) from exc
    except RegistrationInputsMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except CoreSubmissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return CoreJobResponse.model_validate(job_to_response_data(job))


@router.get("/registration-jobs/{job_id}", response_model=CoreJobResponse)
def get_registration_job_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
) -> CoreJobResponse:
    job = get_registration_job(db, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration job not found",
        )
    return CoreJobResponse.model_validate(job_to_response_data(job))
