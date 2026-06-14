"""
Authentication service.

Responsibilities:
- Password hashing and verification (bcrypt via passlib)
- JWT access token creation and decoding
- User registration (enforcing the 2-user hard limit)
- Current user retrieval from a JWT httpOnly cookie

JWT tokens are stored in httpOnly cookies. This prevents JavaScript from
accessing the token, providing protection against XSS attacks. The trade-off
is that CSRF protection becomes relevant; FastAPI's CORS configuration
(origin restriction to the production domain) mitigates this for our use case.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserCreate

# bcrypt is the default scheme. auto handles future algorithm migrations.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the supplied plain-text password."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Return True if plain_password matches the stored bcrypt hash.

    Returns False rather than raising if the stored hash is malformed or the
    backend rejects it. A corrupt hash should fail authentication, not crash
    the request with a 500 (which would also leak information about the state
    of the stored credential).
    """
    try:
        return _pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    """
    Create a signed JWT access token containing the user ID as the subject.

    The token expiry is configured via ACCESS_TOKEN_EXPIRE_MINUTES. The
    issued-at claim (iat) is included so token age can be inspected if needed.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_token(token: str) -> int:
    """
    Decode a JWT and return the user ID.

    Raises HTTPException 401 on any decoding or validation failure.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session invalid or expired. Please log in again.",
    )
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id_str: Optional[str] = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        return int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception


async def get_current_user(
    access_token: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency: extract and validate the current user from the
    httpOnly access_token cookie.

    Raises 401 if the cookie is absent, the token is invalid or expired,
    or the referenced user no longer exists in the database.
    """
    if access_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    user_id = _decode_token(access_token)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )

    return user


async def register_user(
    payload: UserCreate,
    db: AsyncSession,
) -> User:
    """
    Create a new user account if registration is still open.

    Registration is open only when fewer than MAX_USERS accounts exist.
    After that, the endpoint returns 403. This application is designed for
    exactly two named users; no self-service registration beyond that is
    permitted.
    """
    # Check user count first
    count_result = await db.execute(select(func.count(User.id)))
    current_count = count_result.scalar_one()

    if current_count >= settings.MAX_USERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Registration is closed. "
                f"This application supports a maximum of {settings.MAX_USERS} users."
            ),
        )

    # Check for duplicate email
    existing = await db.execute(
        select(User).where(User.email == payload.email.lower())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email address already exists.",
        )

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower().strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()  # Flush to get the generated ID before the response
    return user


async def authenticate_user(
    email: str,
    password: str,
    db: AsyncSession,
) -> User:
    """
    Validate credentials and return the User if correct.

    Always performs the full bcrypt verification (even when the user is not
    found) to prevent timing-based user enumeration attacks.
    """
    result = await db.execute(
        select(User).where(User.email == email.lower().strip())
    )
    user = result.scalar_one_or_none()

    # Use a dummy hash when user not found to prevent timing attacks.
    # This must be a *valid* bcrypt hash so verify_password runs the full
    # hashing routine and returns False, rather than raising ValueError on a
    # malformed string (which would turn a normal failed login into a 500 and
    # leak, via the differing response, whether the email exists).
    dummy_hash = "$2b$12$zKlIsoufyEtsd.uxiTj.IuQmcdXkaefnm63AL56BgXUCcSJVy6Jpe"
    password_to_check = user.password_hash if user else dummy_hash
    password_valid = verify_password(password, password_to_check)

    if not user or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email address or password.",
        )

    return user


async def get_registration_status(db: AsyncSession) -> dict:
    """Return current registration status for the setup wizard."""
    count_result = await db.execute(select(func.count(User.id)))
    current_count = count_result.scalar_one()
    return {
        "is_open": current_count < settings.MAX_USERS,
        "current_count": current_count,
        "max_users": settings.MAX_USERS,
    }
