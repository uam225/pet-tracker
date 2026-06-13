"""
Database configuration.

SQLite pragmas applied at every connection:
  - journal_mode=WAL:   Allows concurrent reads during a write. Eliminates
                        the locking contention that standard SQLite journal mode
                        would cause when both users log meals simultaneously.
  - foreign_keys=ON:    SQLite does not enforce FK constraints by default.
                        This pragma enables them, protecting relational integrity.
  - synchronous=NORMAL: Safe with WAL mode. Significantly faster than FULL
                        synchronous while still durable against OS crashes.

These must be applied per-connection because SQLite stores them as session-level
settings, not persistent database properties.
"""

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from .config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    # Log all SQL statements in development for debugging.
    # Disabled in production to reduce noise.
    echo=settings.ENVIRONMENT == "development",
    # SQLite requires this for use across threads in async context.
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    """Apply SQLite pragmas on every new connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    # Increase cache size to 64MB for better read performance on the e2-micro.
    cursor.execute("PRAGMA cache_size=-65536")
    cursor.close()


# expire_on_commit=False: prevents SQLAlchemy from expiring all attributes after
# a commit, which would trigger unnecessary lazy-loads in async context.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """
    FastAPI dependency: yields a database session per request.

    Commits on successful response, rolls back on any exception,
    and always closes the session when the request is complete.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
