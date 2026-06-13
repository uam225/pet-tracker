import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { petsApi, foodApi, mealLogsApi } from '@/api'
import { ApiRequestError } from '@/api/client'
import { Modal, Button, Input, Textarea, Badge } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { MEAL_TYPE_LABELS, nowISO, formatTime } from '@/utils/petColors'
import { Check, Plus, Minus, Search, AlertTriangle } from 'lucide-react'
import type { FoodItem, MealLogItemCreate, MealType, Pet } from '@/types/api'

type Step = 'pet' | 'type' | 'time' | 'items' | 'review'

interface CartItem {
  food_item:     FoodItem
  portion_grams: number
}

interface LogMealModalProps {
  isOpen:  boolean
  onClose: () => void
}

export function LogMealModal({ isOpen, onClose }: LogMealModalProps) {
  const qc = useQueryClient()

  // Step state
  const [step, setStep]             = useState<Step>('pet')
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
  const [mealType, setMealType]     = useState<MealType>('breakfast')
  const [fedAt, setFedAt]           = useState(nowISO().slice(0, 16))  // datetime-local format
  const [cart, setCart]             = useState<CartItem[]>([])
  const [devReason, setDevReason]   = useState('')
  const [notes, setNotes]           = useState('')
  const [searchQuery, setSearch]    = useState('')
  const [error, setError]           = useState('')

  // Data
  const { data: pets = [] }  = useQuery({ queryKey: ['pets'], queryFn: petsApi.list })
  const { data: foods = [] } = useQuery({ queryKey: ['food-items'], queryFn: () => foodApi.items() })

  // Mutation
  const mutation = useMutation({
    mutationFn: () => {
      const items: MealLogItemCreate[] = cart.map(c => ({
        food_item_id: c.food_item.id,
        portion_grams: c.portion_grams,
      }))
      return mealLogsApi.create({
        pet_id:           selectedPet!.id,
        meal_type:        mealType,
        fed_at:           new Date(fedAt).toISOString(),
        items,
        deviation_reason: devReason || undefined,
        notes:            notes || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-logs'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiRequestError ? err.detail : 'Failed to save meal log.')
    },
  })

  const handleClose = () => {
    setStep('pet'); setSelectedPet(null); setMealType('breakfast')
    setFedAt(nowISO().slice(0, 16)); setCart([]); setDevReason('')
    setNotes(''); setSearch(''); setError('')
    onClose()
  }

  // Meal types available for the selected pet
  const availableMealTypes = useMemo((): MealType[] => {
    if (!selectedPet) return []
    if (selectedPet.species === 'cat') return ['ad_hoc']
    return selectedPet.schedule_slots.map(s => s.meal_type as MealType).concat('ad_hoc')
  }, [selectedPet])

  // Active (non-archived) food items matching the search query
  const filteredFoods = useMemo(() =>
    foods.filter(f => !f.is_archived &&
      (f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       f.brand?.toLowerCase().includes(searchQuery.toLowerCase()))
    ), [foods, searchQuery])

  // Deviation preview: if the selected pet is a dog, compute deviation against its schedule
  const deviationInfo = useMemo(() => {
    if (!selectedPet || selectedPet.species !== 'dog' || mealType === 'ad_hoc') return null
    const slot = selectedPet.schedule_slots.find(s => s.meal_type === mealType)
    if (!slot) return null

    const fed = new Date(fedAt)
    const fedH = fed.getHours(), fedM = fed.getMinutes()
    const fedMins = fedH * 60 + fedM

    const [wsH, wsM] = slot.window_start.split(':').map(Number)
    const [weH, weM] = slot.window_end.split(':').map(Number)
    const wStart = wsH * 60 + wsM
    const wEnd   = weH * 60 + weM

    if (fedMins >= wStart && fedMins <= wEnd) {
      return { minutes: 0, reasonRequired: false, wStart: slot.window_start, wEnd: slot.window_end }
    }
    const dev = fedMins < wStart ? wStart - fedMins : fedMins - wEnd
    const sign = fedMins < wStart ? -1 : 1
    return {
      minutes:        dev * sign,
      reasonRequired: slot.reason_required_on_deviation,
      wStart:         slot.window_start,
      wEnd:           slot.window_end,
    }
  }, [selectedPet, mealType, fedAt])

  const canSubmit = cart.length > 0 &&
    (!deviationInfo?.reasonRequired || deviationInfo.minutes === 0 || devReason.trim().length > 0)

  // ─── Step renderers ──────────────────────────────────────────────────────────

  const renderPetStep = () => (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-stone-500">Which pet are you feeding?</p>
      {pets.filter(p => !p.deleted_at).map(pet => (
        <button
          key={pet.id}
          onClick={() => { setSelectedPet(pet); setMealType(pet.species === 'cat' ? 'ad_hoc' : 'breakfast'); setStep('type') }}
          className="flex items-center gap-3 p-3 rounded-2xl border border-stone-200 hover:border-forest-300 hover:bg-forest-50 transition-colors text-left"
        >
          <PetAvatar petId={pet.id} name={pet.name} species={pet.species} size="md" />
          <div>
            <p className="font-medium text-forest-900">{pet.name}</p>
            <p className="text-xs text-stone-400 capitalize">{pet.species}</p>
          </div>
        </button>
      ))}
    </div>
  )

  const renderTypeStep = () => (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-stone-500">What type of meal?</p>
      <div className="grid grid-cols-2 gap-2">
        {availableMealTypes.map(mt => (
          <button
            key={mt}
            onClick={() => { setMealType(mt); setStep('time') }}
            className={['p-3 rounded-2xl border text-sm font-medium transition-colors text-left',
              mealType === mt ? 'border-forest-500 bg-forest-50 text-forest-700' : 'border-stone-200 text-stone-600'
            ].join(' ')}
          >
            {MEAL_TYPE_LABELS[mt]}
            {selectedPet?.schedule_slots.find(s => s.meal_type === mt) && (
              <p className="text-2xs text-stone-400 mt-0.5 font-normal">
                {formatTime(selectedPet.schedule_slots.find(s => s.meal_type === mt)!.window_start)}–
                {formatTime(selectedPet.schedule_slots.find(s => s.meal_type === mt)!.window_end)}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )

  const renderTimeStep = () => (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-500">When was the meal given?</p>
      <Input
        label="Feeding time"
        type="datetime-local"
        value={fedAt}
        onChange={e => setFedAt(e.target.value)}
      />
      {deviationInfo && deviationInfo.minutes !== 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            {Math.abs(deviationInfo.minutes)}m {deviationInfo.minutes < 0 ? 'before' : 'after'} the{' '}
            {formatTime(deviationInfo.wStart)}–{formatTime(deviationInfo.wEnd)} window.
            {deviationInfo.reasonRequired && ' A reason is required.'}
          </span>
        </div>
      )}
      <Button size="lg" className="w-full" onClick={() => setStep('items')}>
        Continue
      </Button>
    </div>
  )

  const addToCart = (item: FoodItem) => {
    setCart(prev =>
      prev.find(c => c.food_item.id === item.id)
        ? prev
        : [...prev, { food_item: item, portion_grams: 100 }]
    )
  }

  const updatePortion = (itemId: number, grams: number) =>
    setCart(prev => prev.map(c => c.food_item.id === itemId ? { ...c, portion_grams: Math.max(1, grams) } : c))

  const removeFromCart = (itemId: number) =>
    setCart(prev => prev.filter(c => c.food_item.id !== itemId))

  const renderItemsStep = () => (
    <div className="flex flex-col gap-3">
      {/* Cart */}
      {cart.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Added</p>
          {cart.map(({ food_item, portion_grams }) => (
            <div key={food_item.id} className="flex items-center gap-3 bg-forest-50 rounded-xl px-3 py-2">
              <Check size={14} className="text-forest-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-forest-900 truncate">{food_item.name}</p>
                {food_item.brand && <p className="text-2xs text-stone-400 truncate">{food_item.brand}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updatePortion(food_item.id, portion_grams - 5)} className="w-6 h-6 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-500">
                  <Minus size={10} />
                </button>
                <span className="text-xs font-medium w-12 text-center">{portion_grams}g</span>
                <button onClick={() => updatePortion(food_item.id, portion_grams + 5)} className="w-6 h-6 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-500">
                  <Plus size={10} />
                </button>
                <button onClick={() => removeFromCart(food_item.id)} className="ml-1 text-red-400 text-xs">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          placeholder="Search food items…"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-forest-400"
        />
      </div>

      {/* Food list */}
      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
        {filteredFoods.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-4">No items found. Add food to the Library tab first.</p>
        )}
        {filteredFoods.map(item => {
          const inCart = cart.some(c => c.food_item.id === item.id)
          return (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              disabled={inCart}
              className={['flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                inCart ? 'bg-forest-50 opacity-50' : 'hover:bg-stone-50'
              ].join(' ')}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-forest-900 truncate">{item.name}</p>
                {item.brand && <p className="text-xs text-stone-400 truncate">{item.brand}</p>}
              </div>
              {inCart ? <Check size={14} className="text-forest-500" /> : <Plus size={14} className="text-stone-300" />}
            </button>
          )
        })}
      </div>

      <Button
        size="lg"
        className="w-full mt-2"
        disabled={cart.length === 0}
        onClick={() => setStep('review')}
      >
        Review ({cart.length} item{cart.length !== 1 ? 's' : ''})
      </Button>
    </div>
  )

  const renderReviewStep = () => (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-500">Pet</span>
          <span className="font-medium text-forest-900">{selectedPet?.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-500">Meal</span>
          <span className="font-medium text-forest-900">{MEAL_TYPE_LABELS[mealType]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-500">Time</span>
          <span className="font-medium text-forest-900">
            {new Date(fedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {deviationInfo && deviationInfo.minutes !== 0 && (
          <div className="flex justify-between">
            <span className="text-stone-500">Deviation</span>
            <Badge variant={deviationInfo.minutes !== 0 ? 'amber' : 'green'}>
              {Math.abs(deviationInfo.minutes)}m {deviationInfo.minutes < 0 ? 'early' : 'late'}
            </Badge>
          </div>
        )}
      </div>

      {/* Items */}
      {cart.map(({ food_item, portion_grams }) => (
        <div key={food_item.id} className="flex justify-between items-center text-sm">
          <span className="text-forest-900">{food_item.name}</span>
          <span className="text-stone-400 font-medium">{portion_grams}g</span>
        </div>
      ))}

      {/* Deviation reason */}
      {deviationInfo?.reasonRequired && deviationInfo.minutes !== 0 && (
        <Textarea
          label="Reason for deviation (required)"
          value={devReason}
          onChange={e => setDevReason(e.target.value)}
          placeholder="e.g. Appointment ran late, fed on return."
          className="mt-2"
        />
      )}

      {/* Optional notes */}
      <Textarea
        label="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any observations about this meal…"
      />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Save meal log
      </Button>
    </div>
  )

  const STEP_TITLES: Record<Step, string> = {
    pet:    'Log a meal',
    type:   `${selectedPet?.name ?? ''} — Meal type`,
    time:   `${MEAL_TYPE_LABELS[mealType]}`,
    items:  'Food items',
    review: 'Review',
  }

  const STEP_BACK: Partial<Record<Step, Step>> = {
    type:   'pet',
    time:   'type',
    items:  'time',
    review: 'items',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={STEP_TITLES[step]}
      footer={
        STEP_BACK[step] ? (
          <button
            onClick={() => setStep(STEP_BACK[step]!)}
            className="text-sm text-stone-400 py-1"
          >
            ← Back
          </button>
        ) : undefined
      }
    >
      {step === 'pet'    && renderPetStep()}
      {step === 'type'   && renderTypeStep()}
      {step === 'time'   && renderTimeStep()}
      {step === 'items'  && renderItemsStep()}
      {step === 'review' && renderReviewStep()}
    </Modal>
  )
}
