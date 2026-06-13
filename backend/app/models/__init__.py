"""
Import all ORM models into a single namespace.

This file exists so that:
1. Alembic's autogenerate can discover all table definitions by importing
   this single module in alembic/env.py.
2. Relationship back-references resolve correctly without circular import
   errors (models reference each other via TYPE_CHECKING guards).
"""

from .food import (  # noqa: F401
    FoodCategory,
    FoodItem,
    FoodItemEditHistory,
    FoodItemIngredient,
    Ingredient,
)
from .health import (  # noqa: F401
    HealthObservation,
    HealthObservationSymptom,
    Symptom,
)
from .meal_log import MealLog, MealLogItem  # noqa: F401
from .pet import Pet, PetMealScheduleSlot  # noqa: F401
from .user import User  # noqa: F401
