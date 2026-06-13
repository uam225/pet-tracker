"""
Food library router.

Endpoints:
  GET    /api/food/categories                       List food categories (seeded)
  GET    /api/food/ingredients                      List all ingredients
  POST   /api/food/ingredients                      Create ingredient
  PATCH  /api/food/ingredients/{id}                 Update ingredient
  GET    /api/food/items                            List food items
  POST   /api/food/items                            Create food item
  GET    /api/food/items/{id}                       Get food item (incl. archived)
  PATCH  /api/food/items/{id}                       Update food item (records edit history)
  DELETE /api/food/items/{id}                       Archive a food item
  POST   /api/food/items/{id}/new-version           Create new formula version
  GET    /api/food/items/{id}/history               Get edit history for an item
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.food import (
    FoodCategory,
    FoodItem,
    FoodItemEditHistory,
    FoodItemIngredient,
    Ingredient,
)
from ..models.user import User
from ..schemas.food import (
    FoodCategoryResponse,
    FoodItemCreate,
    FoodItemEditHistoryResponse,
    FoodItemIngredientCreate,
    FoodItemNewVersionRequest,
    FoodItemResponse,
    FoodItemUpdate,
    IngredientCreate,
    IngredientResponse,
    IngredientUpdate,
)
from ..services.auth_service import get_current_user
from datetime import datetime, timezone

router = APIRouter(prefix="/api/food", tags=["food-library"])


def _serialise_food_item(item: FoodItem) -> dict:
    """
    Produce a JSON-serialisable snapshot of a FoodItem and its ingredients.
    Used for the edit history audit log.
    """
    return {
        "id": item.id,
        "name": item.name,
        "brand": item.brand,
        "food_category_id": item.food_category_id,
        "description": item.description,
        "is_archived": item.is_archived,
        "ingredients": [
            {
                "ingredient_id": fi.ingredient_id,
                "percentage": fi.percentage,
                "notes": fi.notes,
            }
            for fi in item.ingredients
        ],
    }


async def _load_food_item(item_id: int, db: AsyncSession) -> FoodItem:
    """Load a food item with its ingredients and ingredient details, or raise 404."""
    result = await db.execute(
        select(FoodItem)
        .where(FoodItem.id == item_id)
        .options(
            selectinload(FoodItem.ingredients).selectinload(
                FoodItemIngredient.ingredient
            )
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Food item {item_id} not found.",
        )
    return item


async def _apply_ingredient_list(
    food_item_id: int,
    ingredient_list: list[FoodItemIngredientCreate],
    db: AsyncSession,
) -> None:
    """
    Replace the full ingredient list for a food item.
    Validates that all ingredient IDs exist before writing.
    """
    # Validate all ingredient IDs in one query
    ids = [i.ingredient_id for i in ingredient_list]
    if ids:
        found_result = await db.execute(
            select(Ingredient.id).where(Ingredient.id.in_(ids))
        )
        found_ids = {row[0] for row in found_result.all()}
        missing = set(ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ingredient ID(s) not found: {sorted(missing)}",
            )

    # Delete all existing links for this item
    existing_result = await db.execute(
        select(FoodItemIngredient).where(
            FoodItemIngredient.food_item_id == food_item_id
        )
    )
    for link in existing_result.scalars().all():
        await db.delete(link)
    await db.flush()

    # Insert the new list
    for item_ingredient in ingredient_list:
        db.add(
            FoodItemIngredient(
                food_item_id=food_item_id,
                ingredient_id=item_ingredient.ingredient_id,
                percentage=item_ingredient.percentage,
                notes=item_ingredient.notes,
            )
        )
    await db.flush()


# --- Food category endpoints ---

@router.get("/categories", response_model=list[FoodCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[FoodCategoryResponse]:
    """Return all food categories, ordered for display."""
    result = await db.execute(
        select(FoodCategory).order_by(FoodCategory.display_order)
    )
    return [FoodCategoryResponse.model_validate(c) for c in result.scalars().all()]


# --- Ingredient endpoints ---

@router.get("/ingredients", response_model=list[IngredientResponse])
async def list_ingredients(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[IngredientResponse]:
    """Return all ingredients, ordered alphabetically."""
    result = await db.execute(select(Ingredient).order_by(Ingredient.name))
    return [IngredientResponse.model_validate(i) for i in result.scalars().all()]


@router.post(
    "/ingredients",
    response_model=IngredientResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ingredient(
    payload: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IngredientResponse:
    """Create a new ingredient in the shared pool."""
    # Check for duplicate name
    existing = await db.execute(
        select(Ingredient).where(Ingredient.name == payload.name.strip())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ingredient '{payload.name}' already exists.",
        )

    ingredient = Ingredient(
        name=payload.name.strip(),
        category=payload.category,
        is_common_allergen=payload.is_common_allergen,
    )
    db.add(ingredient)
    await db.flush()
    return IngredientResponse.model_validate(ingredient)


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientResponse)
async def update_ingredient(
    ingredient_id: int,
    payload: IngredientUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IngredientResponse:
    """Update an ingredient's metadata."""
    result = await db.execute(
        select(Ingredient).where(Ingredient.id == ingredient_id)
    )
    ingredient = result.scalar_one_or_none()
    if ingredient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingredient {ingredient_id} not found.",
        )

    if payload.name is not None:
        ingredient.name = payload.name.strip()
    if payload.category is not None:
        ingredient.category = payload.category
    if payload.is_common_allergen is not None:
        ingredient.is_common_allergen = payload.is_common_allergen

    await db.flush()
    return IngredientResponse.model_validate(ingredient)


# --- Food item endpoints ---

@router.get("/items", response_model=list[FoodItemResponse])
async def list_food_items(
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[FoodItemResponse]:
    """
    Return food items from the library.
    Active items only by default; pass include_archived=true for the full list.
    """
    query = select(FoodItem).options(
        selectinload(FoodItem.ingredients).selectinload(FoodItemIngredient.ingredient)
    )
    if not include_archived:
        query = query.where(FoodItem.is_archived.is_(False))

    result = await db.execute(query.order_by(FoodItem.name))
    return [FoodItemResponse.model_validate(i) for i in result.scalars().all()]


@router.post("/items", response_model=FoodItemResponse, status_code=status.HTTP_201_CREATED)
async def create_food_item(
    payload: FoodItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FoodItemResponse:
    """Create a new food item with an optional ingredient list."""
    item = FoodItem(
        name=payload.name.strip(),
        brand=payload.brand.strip() if payload.brand else None,
        food_category_id=payload.food_category_id,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(item)
    await db.flush()

    if payload.ingredients:
        await _apply_ingredient_list(item.id, payload.ingredients, db)

    return FoodItemResponse.model_validate(await _load_food_item(item.id, db))


@router.get("/items/{item_id}", response_model=FoodItemResponse)
async def get_food_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FoodItemResponse:
    """Return a food item including archived items (for historical reference)."""
    return FoodItemResponse.model_validate(await _load_food_item(item_id, db))


@router.patch("/items/{item_id}", response_model=FoodItemResponse)
async def update_food_item(
    item_id: int,
    payload: FoodItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FoodItemResponse:
    """
    Update a food item in place and record the change in the audit log.

    Use this for data-entry corrections (typos, wrong brand, etc.).
    For manufacturer formula changes, use the /new-version endpoint instead.
    """
    item = await _load_food_item(item_id, db)

    if item.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived items cannot be edited. Create a new version instead.",
        )

    # Capture state before changes for the audit log
    snapshot_before = _serialise_food_item(item)

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.brand is not None:
        item.brand = payload.brand.strip()
    if payload.food_category_id is not None:
        item.food_category_id = payload.food_category_id
    if payload.description is not None:
        item.description = payload.description

    if payload.ingredients is not None:
        await _apply_ingredient_list(item_id, payload.ingredients, db)
        # Reload to get updated ingredient state for the snapshot
        item = await _load_food_item(item_id, db)

    snapshot_after = _serialise_food_item(item)

    # Only write an audit record if something actually changed
    if snapshot_before != snapshot_after:
        db.add(
            FoodItemEditHistory(
                food_item_id=item_id,
                changed_by=current_user.id,
                snapshot_before=snapshot_before,
                snapshot_after=snapshot_after,
                change_reason=payload.change_reason,
            )
        )

    await db.flush()
    return FoodItemResponse.model_validate(await _load_food_item(item_id, db))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_food_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    """
    Archive (soft-delete) a food item.

    Archived items are hidden from new meal log selection but remain
    accessible in historical records. They are not permanently removed.
    """
    item = await _load_food_item(item_id, db)
    if item.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is already archived.",
        )
    item.is_archived = True
    await db.flush()


@router.post("/items/{item_id}/new-version", response_model=FoodItemResponse, status_code=status.HTTP_201_CREATED)
async def new_version(
    item_id: int,
    payload: FoodItemNewVersionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FoodItemResponse:
    """
    Create a new formula version of an existing food item.

    The current item is archived. A new item is created with
    previous_version_id pointing back to the archived one.
    Historical meal log entries retain references to the archived item.
    """
    old_item = await _load_food_item(item_id, db)

    if old_item.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot version an already-archived item.",
        )

    # Archive the current item
    old_item.is_archived = True
    await db.flush()

    # Create the new version
    new_item = FoodItem(
        name=payload.name.strip(),
        brand=payload.brand.strip() if payload.brand else None,
        food_category_id=payload.food_category_id,
        description=payload.description,
        previous_version_id=item_id,
        created_by=current_user.id,
    )
    db.add(new_item)
    await db.flush()

    if payload.ingredients:
        await _apply_ingredient_list(new_item.id, payload.ingredients, db)

    return FoodItemResponse.model_validate(await _load_food_item(new_item.id, db))


@router.get("/items/{item_id}/history", response_model=list[FoodItemEditHistoryResponse])
async def get_edit_history(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[FoodItemEditHistoryResponse]:
    """Return the full audit log for a food item, oldest first."""
    result = await db.execute(
        select(FoodItemEditHistory)
        .where(FoodItemEditHistory.food_item_id == item_id)
        .order_by(FoodItemEditHistory.changed_at)
    )
    return [FoodItemEditHistoryResponse.model_validate(h) for h in result.scalars().all()]
