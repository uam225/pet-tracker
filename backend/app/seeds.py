"""
Reference data seeding.

Seeds the food category list and symptom catalogue on application startup.
All operations are idempotent: existing rows are left untouched.

Data seeded here is static for MVP and never user-editable via the API.
Adding new entries in future only requires updating this file and redeploying.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models.food import FoodCategory
from .models.health import Symptom


_FOOD_CATEGORIES = [
    {"id": 1, "name": "Kibble",      "display_order": 1},
    {"id": 2, "name": "Raw",         "display_order": 2},
    {"id": 3, "name": "Wet food",    "display_order": 3},
    {"id": 4, "name": "Treat",       "display_order": 4},
    {"id": 5, "name": "Chew",        "display_order": 5},
    {"id": 6, "name": "Supplement",  "display_order": 6},
]

# Symptom catalogue.
# applies_to_species: 'dog' = dogs only,  'all' = all species.
# The first four symptoms are dog-specific (skin/paw/ear reactions that
# present differently or are absent in cats).
_SYMPTOMS = [
    {
        "id":  1,
        "name": "Paw gnawing / licking",
        "description": "Repeated chewing or licking of paws, particularly between digits.",
        "applies_to_species": "dog",
        "display_order": 1,
    },
    {
        "id":  2,
        "name": "Body scratching",
        "description": "Generalised scratching of body, flanks, or base of tail.",
        "applies_to_species": "dog",
        "display_order": 2,
    },
    {
        "id":  3,
        "name": "Facial rubbing",
        "description": "Rubbing muzzle or face on carpet, furniture, or with paws.",
        "applies_to_species": "dog",
        "display_order": 3,
    },
    {
        "id":  4,
        "name": "Ear scratching",
        "description": "Repeated scratching at ears or head-shaking.",
        "applies_to_species": "dog",
        "display_order": 4,
    },
    {
        "id":  5,
        "name": "Refusal to eat",
        "description": "Declining a meal that would normally be accepted.",
        "applies_to_species": "all",
        "display_order": 5,
    },
    {
        "id":  6,
        "name": "Vomiting",
        "description": "Active expulsion of stomach contents. Note frequency and timing.",
        "applies_to_species": "all",
        "display_order": 6,
    },
    {
        "id":  7,
        "name": "Loose stools",
        "description": "Stool softer than normal; record stool quality score.",
        "applies_to_species": "all",
        "display_order": 7,
    },
    {
        "id":  8,
        "name": "Lethargy (acute episode)",
        "description": "Noticeably reduced energy or activity compared to baseline.",
        "applies_to_species": "all",
        "display_order": 8,
    },
    {
        "id":  9,
        "name": "Coat dullness",
        "description": "Loss of coat shine or increased shedding compared to baseline.",
        "applies_to_species": "all",
        "display_order": 9,
    },
    {
        "id": 10,
        "name": "Flatulence / bloating",
        "description": "Excessive wind or visibly distended abdomen.",
        "applies_to_species": "all",
        "display_order": 10,
    },
    {
        "id": 11,
        "name": "Borborygmi",
        "description": "Audible gut gurgling; often precedes loose stools or vomiting.",
        "applies_to_species": "all",
        "display_order": 11,
    },
]


async def seed_reference_data(db: AsyncSession) -> None:
    """
    Insert food categories and symptoms if they do not already exist.

    Called from the application lifespan on every startup. The ID-based
    existence check ensures this is a true no-op on subsequent startups.
    """
    # --- Food categories ---
    for cat_data in _FOOD_CATEGORIES:
        existing = await db.get(FoodCategory, cat_data["id"])
        if existing is None:
            db.add(FoodCategory(**cat_data))

    # --- Symptoms ---
    for sym_data in _SYMPTOMS:
        existing = await db.get(Symptom, sym_data["id"])
        if existing is None:
            db.add(Symptom(**sym_data))

    await db.commit()
