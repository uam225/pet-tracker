import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { foodApi } from '@/api'
import { ApiRequestError } from '@/api/client'
import { AppShell } from '@/components/layout/AppShell'
import {
  Card, Badge, Button, Input, Textarea,
  Modal, EmptyState, Fab, SectionHeader,
} from '@/components/ui'
import {
  BookOpen, Plus, Search, AlertTriangle, ChevronRight, Archive, X,
} from 'lucide-react'
import type {
  FoodCategory, FoodItem, FoodItemCreate, FoodItemIngredientCreate,
  Ingredient, IngredientCategory, IngredientCreate,
} from '@/types/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type LibrarySegment = 'food' | 'ingredients'

// ─── Constants ────────────────────────────────────────────────────────────────

const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  'Poultry', 'Red Meat', 'Fish', 'Egg', 'Organ', 'Bone',
  'Vegetable', 'Fruit', 'Grain', 'Legume', 'Seeds', 'Herbs',
  'Oils', 'Dairy', 'Supplement', 'Additive', 'Other',
]

// ─── Allergen indicator ───────────────────────────────────────────────────────

function AllergenDot({ item }: { item: FoodItem }) {
  const count = item.ingredients.filter(i => i.ingredient.is_common_allergen).length
  if (count === 0) return null
  return (
    <span title={`${count} known allergen${count > 1 ? 's' : ''}`}>
      <AlertTriangle size={12} className="text-copper-DEFAULT" />
    </span>
  )
}

// ─── Food item row ────────────────────────────────────────────────────────────

function FoodItemRow({ item, onEdit, categories }: {
  item: FoodItem
  onEdit: (item: FoodItem) => void
  categories: FoodCategory[]
}) {
  const cat = categories.find(c => c.id === item.food_category_id)

  return (
    <button
      onClick={() => onEdit(item)}
      className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-stone-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-forest-900 truncate">{item.name}</span>
          {item.is_archived && <Badge variant="default">Archived</Badge>}
          <AllergenDot item={item} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.brand && <span className="text-xs text-stone-400 truncate">{item.brand}</span>}
          {cat && <Badge variant="default">{cat.name}</Badge>}
          <span className="text-xs text-stone-300">
            {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <ChevronRight size={14} className="text-stone-300 flex-shrink-0" />
    </button>
  )
}

// ─── Ingredient picker (within FoodItemModal) ─────────────────────────────────

function IngredientPicker({ allIngredients, selected, onChange, onCreateRequest }: {
  allIngredients: Ingredient[]
  selected: FoodItemIngredientCreate[]
  onChange: (items: FoodItemIngredientCreate[]) => void
  /** Called when user clicks "Create" for a new ingredient name. */
  onCreateRequest: (prefillName: string) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() =>
    allIngredients.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      !selected.some(s => s.ingredient_id === i.id)
    ), [allIngredients, search, selected])

  const addIngredient = (ing: Ingredient) =>
    onChange([...selected, { ingredient_id: ing.id, percentage: undefined, notes: undefined }])

  const removeIngredient = (id: number) =>
    onChange(selected.filter(s => s.ingredient_id !== id))

  const updatePct = (id: number, pct: string) =>
    onChange(selected.map(s =>
      s.ingredient_id === id ? { ...s, percentage: pct ? parseFloat(pct) : undefined } : s
    ))

  return (
    <div className="flex flex-col gap-2">
      {/* Selected ingredients */}
      {selected.map(sel => {
        const ing = allIngredients.find(i => i.id === sel.ingredient_id)
        if (!ing) return null
        return (
          <div key={sel.ingredient_id} className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-forest-900">{ing.name}</span>
              {ing.is_common_allergen && (
                <AlertTriangle size={10} className="inline ml-1 text-copper-DEFAULT" />
              )}
            </div>
            <input
              type="number"
              placeholder="%"
              value={sel.percentage ?? ''}
              onChange={e => updatePct(sel.ingredient_id, e.target.value)}
              min="0" max="100" step="0.1"
              className="w-14 text-xs px-2 py-1 rounded-lg border border-stone-200 bg-white text-center"
            />
            <button onClick={() => removeIngredient(sel.ingredient_id)} className="text-red-400">
              <X size={14} />
            </button>
          </div>
        )
      })}

      {/* Search to add */}
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          placeholder="Add ingredient…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-7 pr-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-forest-400"
        />
      </div>
      {search && (
        <div className="max-h-40 overflow-y-auto flex flex-col border border-stone-200 rounded-xl divide-y divide-stone-100">
          {filtered.map(ing => (
            <button key={ing.id} onClick={() => { addIngredient(ing); setSearch('') }}
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-50">
              <span className="text-sm text-forest-900 flex-1">{ing.name}</span>
              <Badge variant="default">{ing.category}</Badge>
              {ing.is_common_allergen && <AlertTriangle size={10} className="text-copper-DEFAULT" />}
            </button>
          ))}

          {/* Offer inline creation whenever the typed name doesn't exactly
              match an existing ingredient. Showing this alongside partial
              matches lets you create e.g. "Salmon" even though "Salmon Oil"
              already exists. Trimmed, case-insensitive comparison. */}
          {search.trim() !== '' &&
            !allIngredients.some(
              i => i.name.toLowerCase().trim() === search.toLowerCase().trim()
            ) && (
            <button
              onClick={() => { onCreateRequest(search.trim()); setSearch('') }}
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-forest-50"
            >
              <Plus size={12} className="text-forest-500 flex-shrink-0" />
              <span className="text-sm text-forest-600">
                Create "<span className="font-medium">{search.trim()}</span>"
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Create ingredient modal ──────────────────────────────────────────────────

function CreateIngredientModal({ prefillName, onClose }: {
  prefillName: string
  onClose: (created?: Ingredient) => void
}) {
  const qc = useQueryClient()
  const [name, setName]           = useState(prefillName)
  const [category, setCategory]   = useState<IngredientCategory>('Other')
  const [isAllergen, setAllergen] = useState(false)
  const [error, setError]         = useState('')

  const mutation = useMutation({
    mutationFn: () => foodApi.createIngredient({
      name:               name.trim(),
      category,
      is_common_allergen: isAllergen,
    } as IngredientCreate),
    onSuccess: (created: Ingredient) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      onClose(created)
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiRequestError ? e.detail : 'Failed to create ingredient.'),
  })

  return (
    <Modal isOpen onClose={() => onClose()} title="New ingredient">
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          placeholder="e.g. Chicken"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-forest-800">Category</label>
          <div className="flex flex-wrap gap-2">
            {INGREDIENT_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={[
                  'px-3 py-1.5 rounded-xl text-sm font-medium transition-colors',
                  category === cat
                    ? 'bg-forest-500 text-white'
                    : 'bg-stone-100 text-stone-600',
                ].join(' ')}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isAllergen}
            onChange={e => setAllergen(e.target.checked)}
            className="w-4 h-4 rounded accent-forest-500"
          />
          <div>
            <p className="text-sm font-medium text-forest-800">Common allergen</p>
            <p className="text-xs text-stone-400">
              Flag this as a known trigger when building food items.
            </p>
          </div>
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!name.trim()}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Add ingredient
        </Button>
      </div>
    </Modal>
  )
}

// ─── Create / edit food item modal ────────────────────────────────────────────

function FoodItemModal({ item, categories, allIngredients, onClose }: {
  item: FoodItem | null
  categories: FoodCategory[]
  allIngredients: Ingredient[]
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [name, setName]   = useState(item?.name ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [catId, setCatId] = useState<number | undefined>(item?.food_category_id ?? undefined)
  const [desc, setDesc]   = useState(item?.description ?? '')
  const [ingredients, setIngredients] = useState<FoodItemIngredientCreate[]>(
    item?.ingredients.map(i => ({
      ingredient_id: i.ingredient_id,
      percentage:    i.percentage ?? undefined,
    })) ?? []
  )
  const [error, setError]             = useState('')
  // createIngRequest: name to pre-fill in the CreateIngredientModal, or null = closed.
  const [createIngRequest, setCreateIngRequest] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => foodApi.createItem({
      name: name.trim(), brand: brand || undefined,
      food_category_id: catId, description: desc || undefined, ingredients,
    } as FoodItemCreate),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['food-items'] }); onClose() },
    onError:   (e: unknown) => setError(e instanceof ApiRequestError ? e.detail : 'Failed to save.'),
  })

  const updateMutation = useMutation({
    mutationFn: () => foodApi.updateItem(item!.id, {
      name: name.trim(), brand: brand || undefined,
      food_category_id: catId, description: desc || undefined, ingredients,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['food-items'] }); onClose() },
    onError:   (e: unknown) => setError(e instanceof ApiRequestError ? e.detail : 'Failed to save.'),
  })

  const archiveMutation = useMutation({
    mutationFn: () => foodApi.archiveItem(item!.id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['food-items'] }); onClose() },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  // After a new ingredient is created from within the picker, auto-add it to the list.
  const handleIngredientCreated = (created?: Ingredient) => {
    setCreateIngRequest(null)
    if (created) {
      setIngredients(prev => [
        ...prev,
        { ingredient_id: created.id, percentage: undefined, notes: undefined },
      ])
    }
  }

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={item ? 'Edit food item' : 'New food item'}
        footer={
          item && !item.is_archived ? (
            <button
              onClick={() => archiveMutation.mutate()}
              className="flex items-center gap-1.5 text-sm text-stone-400"
            >
              <Archive size={14} /> Archive item
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name" value={name} onChange={e => setName(e.target.value)}
            required placeholder="e.g. Acana Grasslands Kibble"
          />
          <Input
            label="Brand (optional)" value={brand} onChange={e => setBrand(e.target.value)}
            placeholder="e.g. Acana"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-forest-800">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCatId(catId === cat.id ? undefined : cat.id)}
                  className={[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-colors',
                    catId === cat.id
                      ? 'bg-forest-500 text-white'
                      : 'bg-stone-100 text-stone-600',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Description (optional)" value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Any notes about this product…"
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-forest-800">Ingredients</label>
            <IngredientPicker
              allIngredients={allIngredients}
              selected={ingredients}
              onChange={setIngredients}
              onCreateRequest={name => setCreateIngRequest(name)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <Button
            size="lg" className="w-full" loading={isPending} disabled={!name.trim()}
            onClick={() => item ? updateMutation.mutate() : createMutation.mutate()}
          >
            {item ? 'Save changes' : 'Add to library'}
          </Button>
        </div>
      </Modal>

      {/* Ingredient creation overlay — stacks on top of FoodItemModal */}
      {createIngRequest !== null && (
        <CreateIngredientModal
          prefillName={createIngRequest}
          onClose={handleIngredientCreated}
        />
      )}
    </>
  )
}

// ─── Ingredients list row ─────────────────────────────────────────────────────

function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-forest-900 truncate">{ingredient.name}</span>
          {ingredient.is_common_allergen && (
            <AlertTriangle
              size={12}
              className="text-copper-DEFAULT flex-shrink-0"
            />
          )}
        </div>
        <span className="text-xs text-stone-400">{ingredient.category}</span>
      </div>
    </div>
  )
}

// ─── Library page ─────────────────────────────────────────────────────────────

export function LibraryPage() {
  const [segment, setSegment]           = useState<LibrarySegment>('food')
  const [search, setSearch]             = useState('')
  const [activeCat, setActiveCat]       = useState<number | null>(null)
  const [editingItem, setEditingItem]   = useState<FoodItem | null | 'new'>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [creatingIngredient, setCreatingIngredient] = useState(false)

  const { data: categories  = [] } = useQuery({ queryKey: ['food-categories'],  queryFn: foodApi.categories })
  const { data: ingredients = [] } = useQuery({ queryKey: ['ingredients'],       queryFn: foodApi.ingredients })
  const { data: allItems    = [] } = useQuery({
    queryKey: ['food-items', showArchived],
    queryFn:  () => foodApi.items(showArchived),
  })

  // Filter food items by active category and search term
  const filtered = useMemo(() =>
    allItems.filter(item =>
      (!activeCat || item.food_category_id === activeCat) &&
      (item.name.toLowerCase().includes(search.toLowerCase()) ||
       item.brand?.toLowerCase().includes(search.toLowerCase()))
    ), [allItems, activeCat, search])

  // Filter ingredients by search term
  const filteredIngredients = useMemo(() =>
    ingredients.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase())
    ), [ingredients, search])

  return (
    <AppShell title="Library">
      <div className="flex flex-col gap-2 pb-4">

        {/* Segment control */}
        <div className="px-4 pt-2">
          <div className="flex bg-stone-200 p-0.5 rounded-2xl">
            {(['food', 'ingredients'] as LibrarySegment[]).map(seg => (
              <button
                key={seg}
                onClick={() => { setSegment(seg); setSearch('') }}
                className={[
                  'flex-1 py-2 rounded-xl text-sm font-medium transition-colors',
                  segment === seg
                    ? 'bg-white text-forest-800 shadow-sm'
                    : 'text-stone-500',
                ].join(' ')}
              >
                {seg === 'food' ? 'Food Items' : 'Ingredients'}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="px-4">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              placeholder={segment === 'food' ? 'Search food items…' : 'Search ingredients…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent"
            />
          </div>
        </div>

        {/* ── Food segment ─────────────────────────────────────────────────── */}
        {segment === 'food' && (
          <>
            {/* Category filter chips */}
            <div className="flex gap-2 px-4 overflow-x-auto py-1 no-scrollbar">
              <button
                onClick={() => setActiveCat(null)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0',
                  !activeCat ? 'bg-forest-500 text-white' : 'bg-stone-200 text-stone-500',
                ].join(' ')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0',
                    activeCat === cat.id ? 'bg-forest-500 text-white' : 'bg-stone-200 text-stone-500',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Items list */}
            {filtered.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No items found"
                body="Add food products here, then select them when logging meals."
              />
            ) : (
              <Card className="mx-4 divide-y divide-stone-100">
                {filtered.map(item => (
                  <FoodItemRow
                    key={item.id}
                    item={item}
                    onEdit={setEditingItem}
                    categories={categories}
                  />
                ))}
              </Card>
            )}

            {/* Toggle archived */}
            <button
              onClick={() => setShowArchived(v => !v)}
              className="text-xs text-stone-400 text-center py-2"
            >
              {showArchived ? 'Hide archived items' : 'Show archived items'}
            </button>
          </>
        )}

        {/* ── Ingredients segment ──────────────────────────────────────────── */}
        {segment === 'ingredients' && (
          <>
            <SectionHeader>
              {filteredIngredients.length} ingredient{filteredIngredients.length !== 1 ? 's' : ''}
            </SectionHeader>

            {filteredIngredients.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No ingredients yet"
                body="Add ingredients here first, then reference them when building food items."
              />
            ) : (
              <Card className="mx-4 divide-y divide-stone-100">
                {filteredIngredients.map(ing => (
                  <IngredientRow key={ing.id} ingredient={ing} />
                ))}
              </Card>
            )}
          </>
        )}
      </div>

      {/* FAB: add food item OR add ingredient depending on active segment */}
      <Fab onClick={() => segment === 'food' ? setEditingItem('new') : setCreatingIngredient(true)}>
        <Plus size={26} />
      </Fab>

      {/* Food item create/edit modal */}
      {editingItem !== null && (
        <FoodItemModal
          item={editingItem === 'new' ? null : editingItem}
          categories={categories}
          allIngredients={ingredients}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Standalone ingredient creation (from Ingredients segment FAB) */}
      {creatingIngredient && (
        <CreateIngredientModal
          prefillName=""
          onClose={() => setCreatingIngredient(false)}
        />
      )}
    </AppShell>
  )
}
