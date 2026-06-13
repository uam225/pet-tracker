"""Pydantic schemas for meal log endpoints."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .food import FoodItemResponse


class MealLogItemCreate(BaseModel):
    food_item_id: int
    portion_grams: float = Field(gt=0, le=10_000)
    notes: Optional[str] = Field(default=None, max_length=500)


class MealLogCreate(BaseModel):
    pet_id: int
    meal_type: Literal["breakfast", "snack", "dinner", "ad_hoc"]
    # fed_at must be sent as a UTC ISO-8601 datetime string by the client.
    fed_at: datetime
    items: list[MealLogItemCreate] = Field(min_length=1)
    # deviation_reason is validated at the service layer (after schedule lookup).
    # The client supplies it here when it knows deviation will be triggered.
    deviation_reason: Optional[str] = Field(default=None, max_length=1000)
    notes: Optional[str] = Field(default=None, max_length=1000)


class MealLogUpdate(BaseModel):
    """
    In-place update: only permitted within the correction window.
    All fields optional; only supplied fields are changed.
    """
    fed_at: Optional[datetime] = None
    items: Optional[list[MealLogItemCreate]] = Field(default=None, min_length=1)
    deviation_reason: Optional[str] = Field(default=None, max_length=1000)
    notes: Optional[str] = Field(default=None, max_length=1000)


class MealLogCorrection(BaseModel):
    """
    Post-correction-window correction.
    Creates a new MealLog entry that supersedes the original.
    """
    pet_id: int
    meal_type: Literal["breakfast", "snack", "dinner", "ad_hoc"]
    fed_at: datetime
    items: list[MealLogItemCreate] = Field(min_length=1)
    deviation_reason: Optional[str] = Field(default=None, max_length=1000)
    notes: Optional[str] = Field(default=None, max_length=1000)
    # The ID of the entry being corrected. Validated server-side.
    corrects_log_id: int


class MealLogItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    food_item_id: int
    food_item: FoodItemResponse
    portion_grams: float
    notes: Optional[str]


class MealLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pet_id: int
    logged_by: int
    meal_type: str
    fed_at: datetime
    scheduled_window_start: Optional[datetime]
    scheduled_window_end: Optional[datetime]
    deviation_minutes: Optional[int]
    deviation_reason: Optional[str]
    notes: Optional[str]
    corrects_log_id: Optional[int]
    items: list[MealLogItemResponse]
    created_at: datetime
    deleted_at: Optional[datetime]
    # Computed at serialisation time from the model property.
    is_within_correction_window: bool
