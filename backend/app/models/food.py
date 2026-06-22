"""Pydantic schemas for the food library: categories, ingredients, food items."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from .common import ResponseBase


# --- Food category schemas (read-only in MVP) ---

class FoodCategoryResponse(ResponseBase):

    id: int
    name: str
    display_order: int


# --- Ingredient schemas ---

IngredientCategoryLiteral = Literal[
    "Poultry", "Red Meat", "Fish", "Egg", "Grain", "Dairy",
    "Vegetable", "Fruit", "Supplement", "Other"
]


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: IngredientCategoryLiteral
    is_common_allergen: bool = False


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[IngredientCategoryLiteral] = None
    is_common_allergen: Optional[bool] = None


class IngredientResponse(ResponseBase):

    id: int
    name: str
    category: str
    is_common_allergen: bool
    created_at: datetime
    updated_at: datetime


# --- Food item ingredient link schemas ---

class FoodItemIngredientCreate(BaseModel):
    ingredient_id: int
    # percentage is nullable: many manufacturers do not disclose exact values.
    percentage: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    notes: Optional[str] = Field(default=None, max_length=500)


class FoodItemIngredientResponse(ResponseBase):

    id: int
    ingredient_id: int
    ingredient: IngredientResponse
    percentage: Optional[float]
    notes: Optional[str]


# --- Food item schemas ---

class FoodItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=200)
    food_category_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    ingredients: list[FoodItemIngredientCreate] = []


class FoodItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=200)
    food_category_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    # Providing ingredients replaces the entire ingredient list.
    # Omitting ingredients leaves the existing list unchanged.
    ingredients: Optional[list[FoodItemIngredientCreate]] = None
    # Optional reason recorded in the edit history entry.
    change_reason: Optional[str] = Field(default=None, max_length=500)


class FoodItemResponse(ResponseBase):

    id: int
    name: str
    brand: Optional[str]
    food_category_id: Optional[int]
    description: Optional[str]
    is_archived: bool
    previous_version_id: Optional[int]
    ingredients: list[FoodItemIngredientResponse]
    created_at: datetime
    updated_at: datetime


class FoodItemNewVersionRequest(BaseModel):
    """
    Issued when a manufacturer changes a formula.

    The current item is archived. A new item is created with the supplied
    fields, linked back to the archived item via previous_version_id.
    """
    name: str = Field(min_length=1, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=200)
    food_category_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    ingredients: list[FoodItemIngredientCreate] = []
    change_reason: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional note explaining the formula change.",
    )


class FoodItemEditHistoryResponse(ResponseBase):

    id: int
    food_item_id: int
    changed_by: int
    snapshot_before: dict
    snapshot_after: dict
    change_reason: Optional[str]
    changed_at: datetime
