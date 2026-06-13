"""
Meal log models.

Business rules encoded here:

1. One log entry per pet per feeding event.
2. scheduled_window_start and scheduled_window_end are copied from the
   current schedule slot at the moment of logging. This preserves historical
   deviation accuracy even when schedules are later changed.
3. deviation_minutes is computed and stored at log time (not recalculated).
4. Correction window: a meal log entry can be freely edited by its creator
   within CORRECTION_WINDOW_SECONDS of creation. After that, corrections must
   be submitted as a new MealLog with corrects_log_id referencing the original.
   The original is never modified; both records persist.
5. Soft delete only: deleted_at is set; the row is never removed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..config import settings
from ..database import Base

if TYPE_CHECKING:
    from .food import FoodItem
    from .pet import Pet
    from .user import User


class MealLog(Base):
    __tablename__ = "meal_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pet_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pets.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    logged_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    # 'breakfast' | 'snack' | 'dinner' | 'ad_hoc'
    meal_type: Mapped[str] = mapped_column(String, nullable=False)

    # Actual feeding time (UTC). Indexed for time-range queries.
    fed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # Schedule window captured at log time.
    # NULL for ad_hoc (cat) entries where no schedule exists.
    scheduled_window_start: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scheduled_window_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Deviation in minutes from the schedule window.
    # 0 = within window.  Negative = fed early.  Positive = fed late.
    # NULL for cat ad_hoc entries.
    deviation_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Mandatory for breakfast/dinner when deviation_minutes != 0.
    # Enforced at the service layer (not database layer) for SQLite compatibility.
    deviation_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Self-referential FK: populated when this entry was created as a
    # post-correction-window correction of a prior entry.
    corrects_log_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("meal_logs.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Soft delete only.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pet: Mapped[Pet] = relationship("Pet", back_populates="meal_logs")
    logged_by_user: Mapped[User] = relationship(
        "User",
        back_populates="meal_logs",
        foreign_keys=[logged_by],
    )
    items: Mapped[list[MealLogItem]] = relationship(
        "MealLogItem",
        back_populates="meal_log",
        cascade="all, delete-orphan",
    )
    corrects_entry: Mapped[Optional[MealLog]] = relationship(
        "MealLog",
        remote_side="MealLog.id",
        foreign_keys=[corrects_log_id],
    )

    @property
    def is_within_correction_window(self) -> bool:
        """
        True if this entry can still be edited in-place by its creator.

        After CORRECTION_WINDOW_SECONDS, changes must be submitted as a new
        superseding entry (corrects_log_id) to preserve the original record.
        """
        if self.created_at is None:
            return False
        now = datetime.now(timezone.utc)
        # Ensure created_at is timezone-aware for comparison
        created = self.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        elapsed = (now - created).total_seconds()
        return elapsed < settings.CORRECTION_WINDOW_SECONDS

    def __repr__(self) -> str:
        return (
            f"<MealLog id={self.id} pet_id={self.pet_id} "
            f"meal_type={self.meal_type!r} fed_at={self.fed_at}>"
        )


class MealLogItem(Base):
    """
    A single food item within a meal log entry, with its portion size.

    Deliberately references food_items.id without cascade-delete, so that
    archiving or versioning a food item never breaks historical meal records.
    """

    __tablename__ = "meal_log_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meal_log_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("meal_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    food_item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("food_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Float allows fractional portions (e.g. 87.5g)
    portion_grams: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    meal_log: Mapped[MealLog] = relationship("MealLog", back_populates="items")
    food_item: Mapped[FoodItem] = relationship(
        "FoodItem", back_populates="meal_log_items"
    )

    def __repr__(self) -> str:
        return (
            f"<MealLogItem meal_log_id={self.meal_log_id} "
            f"food_item_id={self.food_item_id} "
            f"portion={self.portion_grams}g>"
        )
