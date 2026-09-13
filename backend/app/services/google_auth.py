"""Google OAuth 2.0 helpers for local development."""

import json
import logging
import re
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
BACKEND_ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS_PATH = BACKEND_ROOT / "credentials.json"
TOKEN_PATH = BACKEND_ROOT / "token.json"
REDIRECT_URI = "http://127.0.0.1:8000/auth/google/callback"
logger = logging.getLogger(__name__)
_pending_code_verifiers: dict[str, str] = {}


class GoogleAuthError(Exception):
	"""Base error for Google OAuth configuration and authorization failures."""


class CredentialsFileMissingError(GoogleAuthError):
	"""Raised when the local Google OAuth client file is missing."""


class AuthorizationRequiredError(GoogleAuthError):
	"""Raised when no authorized Google credentials are available."""


def _safe_exception_message(exc: Exception) -> str:
	message = str(exc).replace("\n", " ").strip()
	message = re.sub(
		r"(?i)(client_secret|access_token|refresh_token|authorization_code|code_verifier)=([^&\s]+)",
		r"\1=[REDACTED]",
		message,
	)
	return message or "No additional details provided."


def _log_oauth_failure(operation: str, exc: Exception) -> None:
	logger.warning(
		"Google OAuth %s failed: exception=%s message=%s",
		operation,
		type(exc).__name__,
		_safe_exception_message(exc),
	)


def _load_web_client_config() -> dict[str, object]:
	if not CREDENTIALS_PATH.is_file():
		raise CredentialsFileMissingError(
			"Google OAuth configuration is missing. Add backend/credentials.json."
		)

	try:
		with CREDENTIALS_PATH.open(encoding="utf-8") as credentials_file:
			client_config = json.load(credentials_file)
		if not isinstance(client_config, dict) or "web" not in client_config:
			raise GoogleAuthError(
				"Google OAuth credentials.json must contain a Web application client."
			)
		return client_config
	except Exception as exc:
		if isinstance(exc, GoogleAuthError):
			raise
		_log_oauth_failure("configuration loading", exc)
		raise GoogleAuthError(
			f"Google OAuth configuration could not be loaded: {_safe_exception_message(exc)}"
		) from exc


def _create_flow(code_verifier: str | None = None) -> Flow:
	client_config = _load_web_client_config()
	logger.info(
		"Google OAuth client_type=web redirect_uri=%s",
		REDIRECT_URI,
	)
	return Flow.from_client_config(
		client_config,
		scopes=[GOOGLE_DRIVE_SCOPE],
		redirect_uri=REDIRECT_URI,
		code_verifier=code_verifier,
	)


def get_authorization_url() -> str:
	try:
		flow = _create_flow()
		authorization_url, state = flow.authorization_url(
			access_type="offline",
			include_granted_scopes="true",
			prompt="consent",
		)
		if flow.code_verifier is None:
			raise GoogleAuthError("Google OAuth PKCE code verifier was not generated.")
		_pending_code_verifiers[state] = flow.code_verifier
		return authorization_url
	except GoogleAuthError as exc:
		_log_oauth_failure("authorization URL generation", exc)
		raise
	except Exception as exc:
		_log_oauth_failure("authorization URL generation", exc)
		raise GoogleAuthError(
			f"Google authorization URL could not be generated: {_safe_exception_message(exc)}"
		) from exc


def exchange_code_for_credentials(authorization_code: str, state: str | None) -> Credentials:
	if not authorization_code:
		raise GoogleAuthError("Google OAuth callback did not include an authorization code.")
	if not state:
		raise GoogleAuthError("Google OAuth callback did not include state.")

	code_verifier = _pending_code_verifiers.pop(state, None)
	if code_verifier is None:
		raise GoogleAuthError("Google OAuth callback state is invalid or expired.")

	try:
		flow = _create_flow(code_verifier=code_verifier)
		flow.fetch_token(
			code=authorization_code,
			code_verifier=code_verifier,
		)
	except Exception as exc:
		_log_oauth_failure("authorization code exchange", exc)
		raise GoogleAuthError(
			"Google OAuth authorization code exchange failed: "
			f"{_safe_exception_message(exc)}"
		) from exc

	try:
		credentials = flow.credentials
		TOKEN_PATH.write_text(credentials.to_json(), encoding="utf-8")
		return credentials
	except Exception as exc:
		raise GoogleAuthError(
			"Google credentials could not be stored locally."
		) from exc


def get_authorized_credentials() -> Credentials:
	if not TOKEN_PATH.is_file():
		raise AuthorizationRequiredError(
			"Google authorization is required. Visit /auth/google/login first."
		)

	try:
		credentials = Credentials.from_authorized_user_file(
			str(TOKEN_PATH), [GOOGLE_DRIVE_SCOPE]
		)
		if credentials.expired and credentials.refresh_token:
			credentials.refresh(Request())
			TOKEN_PATH.write_text(credentials.to_json(), encoding="utf-8")
		if not credentials.valid:
			raise AuthorizationRequiredError(
				"Stored Google credentials are not valid. Visit /auth/google/login again."
			)
		return credentials
	except AuthorizationRequiredError:
		raise
	except Exception as exc:
		raise AuthorizationRequiredError(
			"Stored Google credentials could not be loaded. Visit /auth/google/login again."
		) from exc