"""
LUNA-REG — Independent Scientific Processing Module API Router.
Provides FastAPI endpoints for registering lunar satellite images and retrieving visual artifacts.
"""

import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Ensure repo root is accessible for core engine
repo_root = Path(__file__).resolve().parent.parent.parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from core.processing_engine import ProcessingEngine

router = APIRouter(tags=["registration"])

REGISTRATIONS_DIR = repo_root / "data" / "registrations"
REGISTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
STAGED_DIR = repo_root / "data" / "staged_inputs"


class RegistrationSettingsModel(BaseModel):
    ratio_threshold: float = 0.75
    ransac_threshold: float = 5.0
    max_features: int = 2000
    contrast_enhancement: bool = True
    rescale_factor: float = 1.0


class ProcessRequestModel(BaseModel):
    stage_id: Optional[str] = None
    reference_path: Optional[str] = None
    moving_path: Optional[str] = None
    settings: Optional[RegistrationSettingsModel] = None


@router.post("/registration/process")
async def process_registration(
    req: Optional[ProcessRequestModel] = None,
    reference_image: Optional[UploadFile] = File(None),
    moving_image: Optional[UploadFile] = File(None),
    stage_id: Optional[str] = Form(None),
    reference_path: Optional[str] = Form(None),
    moving_path: Optional[str] = Form(None),
    ratio_threshold: Optional[float] = Form(0.75),
    ransac_threshold: Optional[float] = Form(5.0),
    max_features: Optional[int] = Form(2000),
    contrast_enhancement: Optional[bool] = Form(True),
    rescale_factor: Optional[float] = Form(1.0),
):
    """
    Execute SIFT-based lunar image registration pipeline.
    Accepts direct file uploads or references to staged/existing files.
    Returns the standardized registration Output Contract.
    """
    import uuid
    from datetime import datetime

    job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    job_dir = REGISTRATIONS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    inputs_dir = job_dir / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    resolved_ref = None
    resolved_mov = None

    # Handle direct multipart file uploads
    if reference_image and reference_image.filename:
        ref_dest = inputs_dir / Path(reference_image.filename).name
        content = await reference_image.read()
        with open(ref_dest, "wb") as f:
            f.write(content)
        resolved_ref = ref_dest

    if moving_image and moving_image.filename:
        mov_dest = inputs_dir / Path(moving_image.filename).name
        content = await moving_image.read()
        with open(mov_dest, "wb") as f:
            f.write(content)
        resolved_mov = mov_dest

    # Check stage_id from form or JSON
    active_stage_id = stage_id or (req.stage_id if req else None)
    if active_stage_id:
        s_dir = STAGED_DIR / active_stage_id
        if s_dir.is_dir():
            staged = [p for p in s_dir.iterdir() if p.is_file() and p.name != "staging_meta.json"]
            for p in staged:
                if "ref" in p.name.lower():
                    resolved_ref = p
                elif "mov" in p.name.lower() or "source" in p.name.lower():
                    resolved_mov = p
            if not resolved_ref and len(staged) >= 1:
                resolved_ref = staged[0]
            if not resolved_mov and len(staged) >= 2:
                resolved_mov = staged[1]

    # Check file paths from form or JSON
    raw_ref = reference_path or (req.reference_path if req else None)
    if raw_ref:
        cand = Path(raw_ref)
        p = cand if cand.is_absolute() else repo_root / cand
        if p.is_file():
            resolved_ref = p

    raw_mov = moving_path or (req.moving_path if req else None)
    if raw_mov:
        cand = Path(raw_mov)
        p = cand if cand.is_absolute() else repo_root / cand
        if p.is_file():
            resolved_mov = p

    if not resolved_ref or not resolved_mov:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required inputs: both reference and moving/source images are required.",
        )

    # Build settings
    settings_dict = {
        "ratio_threshold": ratio_threshold or 0.75,
        "ransac_threshold": ransac_threshold or 5.0,
        "max_features": max_features or 2000,
        "contrast_enhancement": contrast_enhancement if contrast_enhancement is not None else True,
        "rescale_factor": rescale_factor or 1.0,
    }
    if req and req.settings:
        settings_dict.update(req.settings.model_dump())

    engine = ProcessingEngine(artifacts_dir=REGISTRATIONS_DIR)
    result = engine.run_registration(resolved_ref, resolved_mov, settings=settings_dict, job_id=job_id)

    if result.get("status") == "SUCCESS":
        return result
    else:
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=result)


@router.get("/registration/artifacts/{job_id}/{filename}")
async def get_registration_artifact(job_id: str, filename: str):
    """Serve a generated registration visual artifact image."""
    target = REGISTRATIONS_DIR / job_id / filename
    try:
        resolved = target.resolve()
        if not str(resolved).startswith(str(REGISTRATIONS_DIR.resolve())):
            raise HTTPException(status_code=403, detail="Access denied")
        if not resolved.is_file():
            raise HTTPException(status_code=404, detail=f"Artifact {filename} not found for job {job_id}")
        return FileResponse(str(resolved), media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
