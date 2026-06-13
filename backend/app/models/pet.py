"""
Pet profile and meal schedule slot models.

Schedule design:
  - Dogs have three PetMealScheduleSlot rows: breakfast, snack, dinner.
  - All slots are window-based: a meal is on-time if fed_at falls within
    [window_start, window_end].
  - The cat has no schedule rows. All cat meals are ad_hoc.

Deviation is computed and stored on the MealLog at the time of logging
(not recalculated dynamically), so that future schedule changes do not
retroactively alter the historical record.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, time
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .health import HealthObservation
    from .meal_log import MealLog


class Species(str, enum.Enum):
    DOG = "dog"
    CAT = "cat"


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    SNACK = "snack"
    DINNER = "dinner"
    AD_HOC = "ad_hoc"


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    species: Mapped[str] = mapped_column(String, nullable=False)  # Species enum value
    breed: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Current weight in kg. Updated periodically; used for portion reference.
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    # Soft delete: NULL = active record, populated = logically deleted.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    schedule_slots: Mapped[list[PetMealScheduleSlot]] = relationship(
        "PetMealScheduleSlot",
        back_populates="pet",
        cascade="all, delete-orphan",
        order_by="PetMealScheduleSlot.meal_type",
    )
    meal_logs: Mapped[list[MealLog]] = relationship(
        "MealLog", back_populates="pet"
    )
    health_observations: Mapped[list[HealthObservation]] = relationship(
        "HealthObservation", back_populates="pet"
    )

    @property
    def is_active(self) -> bool:
        return self.deleted_at is None

    def __repr__(self) -> str:
        return f"<Pet id={self.id} name={self.name!r} species={self.species!r}>"


class PetMealScheduleSlot(Base):
    __tablename__ = "pet_meal_schedule_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # MealType enum value: 'breakfast' | 'snack' | 'dinner'
    meal_type: Mapped[str] = mapped_column(String, nullable=False)
    # The window within which a meal is considered on-time.
    # Times are stored and compared in UTC; the frontend is responsible for
    # converting the user's local time to UTC before sending.
    window_start: Mapped[time] = mapped_column(Time, nullable=False)
    window_end: Mapped[time] = mapped_column(Time, nullable=False)
    # True for breakfast and dinner. When True, feeding outside the window
    # requires a deviation reason before the meal log can be saved.
    reason_required_on_deviation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    pet: Mapped[Pet] = relationship("Pet", back_populates="schedule_slots")

    def __repr__(self) -> str:
        return (
            f"<PetMealScheduleSlot pet_id={self.pet_id} "
            f"meal_type={self.meal_type!r} "
            f"window={self.window_start}-{self.window_end}>"
        )
