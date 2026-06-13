"""
Authentication router.

Endpoints:
  POST /api/auth/register      Register a new user (open if < MAX_USERS)
  POST /api/auth/login         Authenticate and set the httpOnly cookie
  POST /api/auth/logout        Clear the auth cookie
  GET  /api/auth/me            Return the current authenticated user
  GET  /api/auth/status        Return registration open/closed status
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..schemas.user import (
    RegistrationStatusResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from ..services.auth_service import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_registration_status,
    register_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# httpOnly cookie configuration.
# Secure=True is required in production (HTTPS only).
# SameSite=lax prevents CSRF from cross-site form submissions while
# allowing normal link-based navigation.
_COOKIE_NAME = "access_token"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days in seconds


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Register a new user account and log them in immediately.

    Returns 403 if registration is closed (MAX_USERS already exists).
    Returns 409 if the email address is already registered.
    """
    user = await register_user(payload, db)
    token = create_access_token(user.id)
    _set_auth_cookie(response, token)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=UserResponse)
async def login(
    payload: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Validate credentials and set the httpOnly auth cookie.

    Returns 401 on invalid credentials. The error message is intentionally
    generic to prevent user enumeration.
    """
    user = await authenticate_user(payload.email, payload.password, db)
    token = create_access_token(user.id)
    _set_auth_cookie(response, token)
    return UserResponse.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    """Clear the auth cookie. No server-side session state to invalidate."""
    response.delete_cookie(
        key=_COOKIE_NAME,
        httponly=True,
        samesite="lax",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.get("/status", response_model=RegistrationStatusResponse)
async def registration_status(
    db: AsyncSession = Depends(get_db),
) -> RegistrationStatusResponse:
    """
    Return whether new user registration is currently permitted.

    Used by the setup wizard to decide whether to show the registration form.
    This endpoint is publicly accessible (no auth required).
    """
    status_data = await get_registration_status(db)
    return RegistrationStatusResponse(**status_data)


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the httpOnly authentication cookie on the response."""
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,       # HTTPS only in production
        max_age=_COOKIE_MAX_AGE,
        path="/",
    )
