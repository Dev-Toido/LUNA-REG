"""Google OAuth authentication endpoints."""

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.services.google_auth import (
	GoogleAuthError,
	exchange_code_for_credentials,
	get_authorization_url,
)

router = APIRouter(prefix="/auth/google", tags=["authentication"])


@router.get("/login", response_class=RedirectResponse, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
def google_login() -> RedirectResponse:
	try:
		return RedirectResponse(get_authorization_url())
	except GoogleAuthError as exc:
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail=str(exc),
		) from exc


@router.get("/callback")
def google_callback(
	code: str | None = Query(default=None),
	error: str | None = Query(default=None),
	state: str | None = Query(default=None),
) -> dict[str, str]:
	if error:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Google OAuth authorization was denied or failed.",
		)
	try:
		exchange_code_for_credentials(code or "", state)
	except GoogleAuthError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(exc),
		) from exc
	return {"status": "authorized"}