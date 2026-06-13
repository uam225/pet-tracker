"""
User model.

Only two accounts are permitted. Registration enforcement is handled at
the service layer (not the database layer) so that meaningful error
messages can be returned to the client.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .food import FoodItem, FoodItemEditHistory
    from .health import HealthObservation
    from .meal_log import MealLog


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships (back-references for audit queries)
    meal_logs: Mapped[list[MealLog]] = relationship(
        "MealLog", back_populates="logged_by_user", foreign_keys="MealLog.logged_by"
    )
    health_observations: Mapped[list[HealthObservation]] = relationship(
        "HealthObservation",
        back_populates="logged_by_user",
        foreign_keys="HealthObservation.logged_by",
    )
    food_items_created: Mapped[list[FoodItem]] = relationship(
        "FoodItem", back_populates="created_by_user"
    )
    food_item_edits: Mapped[list[FoodItemEditHistory]] = relationship(
        "FoodItemEditHistory", back_populates="changed_by_user"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
