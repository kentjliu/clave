"""
Cognito authentication for the Clave CLI.

Uses USER_PASSWORD_AUTH (plaintext password over TLS — acceptable for a
first-party CLI). Tokens are persisted in ~/.clave/config.json.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from . import config

COGNITO_REGION = "us-east-1"
# Public client (no secret) — same one the web UI uses.
COGNITO_CLIENT_ID = "2h9ni2p29gt53r4kkvt816j2hr"
# Refresh when within this many minutes of expiry.
_REFRESH_BUFFER_MINUTES = 5


def login(email: str, password: str) -> dict:
    """Authenticate with Cognito, persist tokens, set user_id to Cognito sub."""
    client = _idp()
    try:
        resp = client.initiate_auth(
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
            ClientId=COGNITO_CLIENT_ID,
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("NotAuthorizedException", "UserNotFoundException"):
            raise ValueError("Incorrect email or password.") from e
        if code == "UserNotConfirmedException":
            raise ValueError("Account not confirmed. Check your email for a verification link.") from e
        raise

    result = resp["AuthenticationResult"]

    # Resolve the Cognito sub — this becomes the permanent user_id.
    user_resp = client.get_user(AccessToken=result["AccessToken"])
    attrs = {a["Name"]: a["Value"] for a in user_resp["UserAttributes"]}
    sub = attrs["sub"]

    expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=result["ExpiresIn"])
    ).isoformat()

    config.save({
        "user_id": sub,
        "email": email,
        "access_token": result["AccessToken"],
        "refresh_token": result["RefreshToken"],
        "id_token": result.get("IdToken", ""),
        "token_expiry": expiry,
    })
    return config.load()


def logout():
    """Revoke the refresh token and clear stored credentials."""
    cfg = config.load()
    refresh_token = cfg.get("refresh_token")
    if refresh_token:
        try:
            _idp().revoke_token(Token=refresh_token, ClientId=COGNITO_CLIENT_ID)
        except ClientError:
            pass  # best-effort

    config.save({
        "access_token": None,
        "refresh_token": None,
        "id_token": None,
        "token_expiry": None,
        "email": None,
    })


def get_access_token() -> Optional[str]:
    """Return a valid access token, auto-refreshing if near expiry."""
    cfg = config.load()
    access_token = cfg.get("access_token")
    if not access_token:
        return None

    expiry_str = cfg.get("token_expiry")
    if expiry_str:
        expiry = datetime.fromisoformat(expiry_str)
        if datetime.now(timezone.utc) >= expiry - timedelta(minutes=_REFRESH_BUFFER_MINUTES):
            refresh_token = cfg.get("refresh_token")
            if not refresh_token:
                return None
            try:
                return _refresh(refresh_token)
            except ClientError:
                return None

    return access_token


def is_logged_in() -> bool:
    return bool(config.load().get("access_token"))


def whoami() -> Optional[str]:
    return config.load().get("email")


# ── Internal ──────────────────────────────────────────────────────────────────

def _idp():
    return boto3.client("cognito-idp", region_name=COGNITO_REGION)


def _refresh(refresh_token: str) -> str:
    resp = _idp().initiate_auth(
        AuthFlow="REFRESH_TOKEN_AUTH",
        AuthParameters={"REFRESH_TOKEN": refresh_token},
        ClientId=COGNITO_CLIENT_ID,
    )
    result = resp["AuthenticationResult"]
    expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=result["ExpiresIn"])
    ).isoformat()
    config.save({
        "access_token": result["AccessToken"],
        "id_token": result.get("IdToken", ""),
        "token_expiry": expiry,
    })
    return result["AccessToken"]
