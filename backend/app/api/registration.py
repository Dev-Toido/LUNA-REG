"""API endpoints for lunar image registration."""

from __future__ import annotations

import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.schemas.registration import (
    RegistrationResultResponse,
    RegistrationStatusResponse,
    RegistrationSubmissionResponse,
)
from app.services.registration_service import OUTPUTS_BASE_DIR, dispatch_registration_job, job_store

router = APIRouter(tags=["registration"])

UPLOADS_TMP_DIR = Path(tempfile.gettempdir()) / "luna_reg_uploads"
UPLOADS_TMP_DIR.mkdir(parents=True, exist_ok=True)


@router.post(
    "/register",
    response_model=RegistrationSubmissionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit lunar satellite images for multi-modal registration",
)
async def submit_registration(
    reference_image: Optional[UploadFile] = File(None),
    target_image: Optional[UploadFile] = File(None),
    reference_file: Optional[UploadFile] = File(None),
    target_file: Optional[UploadFile] = File(None),
    detector: str = Form("sift"),
    registration_mode: str = Form("automatic"),
    pair_id: Optional[str] = Form(None),
) -> RegistrationSubmissionResponse:
    ref = reference_image or reference_file
    tgt = target_image or target_file

    ref_disk_path = None
    tgt_disk_path = None

    if ref and tgt:
        # Save uploaded files to disk
        timestamp = int(time.time() * 1000)
        ref_filename = f"ref_{timestamp}_{ref.filename or 'reference.png'}"
        tgt_filename = f"tgt_{timestamp}_{tgt.filename or 'target.png'}"

        ref_disk_path = UPLOADS_TMP_DIR / ref_filename
        tgt_disk_path = UPLOADS_TMP_DIR / tgt_filename

        with open(ref_disk_path, "wb") as f_out:
            shutil.copyfileobj(ref.file, f_out)
        with open(tgt_disk_path, "wb") as f_out:
            shutil.copyfileobj(tgt.file, f_out)
    elif pair_id:
        # Resolve real canonical lunar rasters from assets or canonical repository
        root_dir = Path(__file__).resolve().parent.parent.parent.parent
        assets_dir = root_dir / "assets"
        frontend_assets = root_dir / "frontend" / "assets"
        ref_candidate = (assets_dir / "lunar_nadir.jpg") if (assets_dir / "lunar_nadir.jpg").exists() else (frontend_assets / "lunar_nadir.jpg")
        tgt_candidate = (assets_dir / "lunar_low_sun.jpg") if (assets_dir / "lunar_low_sun.jpg").exists() else (frontend_assets / "lunar_low_sun.jpg")

        if not ref_candidate.exists() or not tgt_candidate.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planetary image rasters for pair '{pair_id}' could not be located.",
            )
        timestamp = int(time.time() * 1000)
        ref_disk_path = UPLOADS_TMP_DIR / f"pair_{pair_id}_{timestamp}_ref.jpg"
        tgt_disk_path = UPLOADS_TMP_DIR / f"pair_{pair_id}_{timestamp}_tgt.jpg"
        shutil.copy(ref_candidate, ref_disk_path)
        shutil.copy(tgt_candidate, tgt_disk_path)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either binary files ('reference_image' and 'target_image') or a valid 'pair_id' are required.",
        )

    job_id = dispatch_registration_job(str(ref_disk_path), str(tgt_disk_path), detector=detector)

    return RegistrationSubmissionResponse(
        job_id=job_id,
        status="processing",
        message=f"Registration job initialized and running with '{detector}' feature detector.",
    )


@router.get(
    "/register/{job_id}/status",
    response_model=RegistrationStatusResponse,
    summary="Poll processing status and telemetry logs for an active registration job",
)
async def get_registration_status(job_id: str) -> RegistrationStatusResponse:
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registration job '{job_id}' not found.",
        )

    elapsed = round(time.time() - job.start_time, 2) if job.status == "processing" else job.elapsed_seconds

    return RegistrationStatusResponse(
        job_id=job.job_id,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        message=job.message,
        created_at=job.created_at,
        elapsed_seconds=elapsed,
        logs=list(job.logs),
        error=job.error,
    )


@router.get(
    "/register/{job_id}/result",
    response_model=RegistrationResultResponse,
    summary="Retrieve completed registration rasters, metrics, and homography matrix",
)
async def get_registration_result(job_id: str) -> RegistrationResultResponse:
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registration job '{job_id}' not found.",
        )

    if job.status == "processing" or job.status == "queued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Registration job '{job_id}' is still in progress (stage: {job.stage}, progress: {job.progress}%).",
        )

    if job.status == "failed" or not job.result_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Registration job '{job_id}' failed: {job.error or job.message}",
        )

    return RegistrationResultResponse.model_validate(job.result_data)


@router.get(
    "/register/history",
    summary="List past completed or queued registration jobs",
)
async def get_registration_history():
    jobs = job_store.list_jobs()
    summary_list = []
    for j in jobs:
        res = j.result_data or {}
        metrics = res.get("metrics", {})
        summary_list.append({
            "id": j.job_id,
            "date": j.created_at,
            "status": j.status.capitalize(),
            "processingTime": f"{j.elapsed_seconds} s" if j.elapsed_seconds else "--",
            "refThumb": res.get("reference_image_url"),
            "tgtThumb": res.get("registered_image_url") or res.get("target_image_url"),
            "metrics": metrics,
        })
    return summary_list


@router.get(
    "/register/{job_id}/download/{filename}",
    summary="Download output artifact rasters, difference maps, or reports",
)
async def download_job_artifact(job_id: str, filename: str):
    file_path = OUTPUTS_BASE_DIR / job_id / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact '{filename}' not found for job '{job_id}'.",
        )
    return FileResponse(path=file_path, filename=filename)
