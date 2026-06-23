"""
Food library models.

Hierarchy:
  FoodItem -- (FoodItemIngredient) -- Ingredient

Versioning strategy:
  - Direct edits (typo, brand fix): update FoodItem in place and append a
    snapshot to FoodItemEditHistory. The edit is applied to all historical
    references since it was a data-entry error, not a product change.
  - Formula changes: use the 'New Version' action. The current FoodItem is
    archived (is_archived=True). A new FoodItem is created with
    previous_version_id pointing to the archived one. Historical MealLogItem
    rows retain their reference to the archived item, so the past record is
    accurate to what was actually fed.

Soft delete: setting is_archived=True on a FoodItem excludes it from new
meal log selection but does not break any existing references.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .meal_log import MealLogItem
    from .user import User


class IngredientCategory(str, enum.Enum):
    POULTRY = "Poultry"
    RED_MEAT = "Red Meat"
    FISH = "Fish"
    EGG = "Egg"
    GRAIN = "Grain"
    DAIRY = "Dairy"
    VEGETABLE = "Vegetable"
    FRUIT = "Fruit"
    SUPPLEMENT = "Supplement"
    OTHER = "Other"


class FoodCategory(Base):
    """
    Top-level food type (Kibble, Raw, Treat, Chew, Supplement).
    Seeded at deployment. Not user-editable in MVP.
    """

    __tablename__ = "food_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    food_items: Mapped[list[FoodItem]] = relationship(
        "FoodItem", back_populates="category"
    )

    def __repr__(self) -> str:
        return f"<FoodCategory id={self.id} name={self.name!r}>"


class Ingredient(Base):
    """
    A single ingredient in the shared ingredient pool.

    is_common_allergen is the primary flag for future correlation analysis.
    When set, queries can quickly surface meals containing known triggers
    alongside subsequent adverse health observations.
    """

    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String, nullable=False)  # IngredientCategory
    is_common_allergen: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    food_item_links: Mapped[list[FoodItemIngredient]] = relationship(
        "FoodItemIngredient", back_populates="ingredient"
    )

    def __repr__(self) -> str:
        return (
            f"<Ingredient id={self.id} name={self.name!r} "
            f"allergen={self.is_common_allergen}>"
        )


class FoodItem(Base):
    """
    A specific food product in the shared library.

    previous_version_id forms an immutable linked list of product versions,
    enabling reconstruction of exactly what was in a food at any point in time.
    """

    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    food_category_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("food_categories.id"), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # True when archived via soft-delete or superseded by a New Version.
    # Archived items are hidden from new meal log entry selection.
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Self-referential: populated when this item was created by a New Version action.
    # Forms a chain: new_item -> old_item -> older_item -> ...
    previous_version_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("food_items.id"), nullable=True
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    category: Mapped[Optional[FoodCategory]] = relationship(
        "FoodCategory", back_populates="food_items"
    )
    ingredients: Mapped[list[FoodItemIngredient]] = relationship(
        "FoodItemIngredient",
        back_populates="food_item",
        cascade="all, delete-orphan",
    )
    created_by_user: Mapped[Optional[User]] = relationship(
        "User", back_populates="food_items_created"
    )
    previous_version: Mapped[Optional[FoodItem]] = relationship(
        "FoodItem",
        remote_side="FoodItem.id",
        foreign_keys=[previous_version_id],
    )
    edit_history: Mapped[list[FoodItemEditHistory]] = relationship(
        "FoodItemEditHistory",
        back_populates="food_item",
        cascade="all, delete-orphan",
        order_by="FoodItemEditHistory.changed_at",
    )
    meal_log_items: Mapped[list[MealLogItem]] = relationship(
        "MealLogItem", back_populates="food_item"
    )

    def __repr__(self) -> str:
        return (
            f"<FoodItem id={self.id} name={self.name!r} "
            f"archived={self.is_archived}>"
        )


class FoodItemIngredient(Base):
    """
    Junction table linking a FoodItem to an Ingredient.

    percentage is nullable because manufacturers frequently list ingredients
    by weight-descending order without disclosing exact percentages. Populate
    it where available; it significantly improves dose-response analysis later.
    """

    __tablename__ = "food_item_ingredients"
    __table_args__ = (
        UniqueConstraint(
            "food_item_id",
            "ingredient_id",
            name="uq_food_item_ingredient",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    food_item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("food_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingredients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Manufacturer-declared percentage. NULL = undisclosed.
    percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Free text for notes like "listed as 'natural flavours'" or "dehydrated".
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    food_item: Mapped[FoodItem] = relationship(
        "FoodItem", back_populates="ingredients"
    )
    ingredient: Mapped[Ingredient] = relationship(
        "Ingredient", back_populates="food_item_links"
    )

    def __repr__(self) -> str:
        return (
            f"<FoodItemIngredient "
            f"food_item_id={self.food_item_id} "
            f"ingredient_id={self.ingredient_id} "
            f"pct={self.percentage}>"
        )


class FoodItemEditHistory(Base):
    """
    Append-only audit log of all direct edits to FoodItem records.

    snapshot_before and snapshot_after store the complete serialised state
    of the food item and its full ingredient list at the moment of the edit.
    This allows reconstruction of any historical state of the food library
    without requiring event sourcing at the application level.

    This table is NEVER updated or deleted from.
    """

    __tablename__ = "food_item_edit_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    food_item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("food_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    changed_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    # Full JSON snapshots of the item + ingredients before and after the edit.
    snapshot_before: Mapped[dict] = mapped_column(JSON, nullable=False)
    snapshot_after: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Optional reason supplied by the user at edit time.
    change_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    food_item: Mapped[FoodItem] = relationship(
        "FoodItem", back_populates="edit_history"
    )
    changed_by_user: Mapped[User] = relationship(
        "User", back_populates="food_item_edits"
    )

    def __repr__(self) -> str:
        return (
            f"<FoodItemEditHistory id={self.id} "
            f"food_item_id={self.food_item_id} "
            f"at={self.changed_at}>"
        )
