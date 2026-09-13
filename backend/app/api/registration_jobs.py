"""Backend-to-Core registration job endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core_client.client import get_core_client
from app.schemas.core_job import CoreJobCreate, RegistrationJobCreate, RegistrationJobResponse
from app.services.registration_job_service import (
    CoreSubmissionError,
    PairNotFoundError,
    RegistrationProductMissingError,
    RegistrationInputsMissingError,
    create_registration_job,
    get_registration_job,
    job_to_response_data,
)

router = APIRouter(tags=["registration-jobs"])


@router.post("/pairs/{pair_id}/registration-jobs", response_model=RegistrationJobResponse, status_code=status.HTTP_201_CREATED)
def submit_registration_job(
    pair_id: int,
    job_data: RegistrationJobCreate | None = None,
    db: Session = Depends(get_db),
    core_client=Depends(get_core_client),
    ) -> RegistrationJobResponse:
    try:
        job = create_registration_job(
            db,
            pair_id,
            requested_options=(job_data.options if job_data else None),
            core_client=core_client,
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
    except RegistrationProductMissingError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc
    except CoreSubmissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return RegistrationJobResponse.model_validate(job_to_response_data(job))


@router.get("/registration-jobs/{job_id}", response_model=RegistrationJobResponse)
def get_registration_job_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
) -> RegistrationJobResponse:
    job = get_registration_job(db, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration job not found",
        )
    return RegistrationJobResponse.model_validate(job_to_response_data(job))
