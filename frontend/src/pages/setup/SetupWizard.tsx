import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi, petsApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { ApiRequestError } from '@/api/client'
import { Button, Input, LoadingScreen } from '@/components/ui'
import { ChevronRight } from 'lucide-react'
import type { Pet, PetCreate, ScheduleSlotUpdate } from '@/types/api'

type Step = 'account' | 'second-account' | 'pets' | 'schedules' | 'done'

// Default schedule windows. Pre-populated in both pet creation AND the edit UI.
const DEFAULT_SCHEDULE_SLOTS = [
  { meal_type: 'breakfast' as const, window_start: '07:00:00', window_end: '08:30:00', reason_required_on_deviation: true  },
  { meal_type: 'snack'     as const, window_start: '13:00:00', window_end: '15:00:00', reason_required_on_deviation: false },
  { meal_type: 'dinner'    as const, window_start: '17:00:00', window_end: '18:30:00', reason_required_on_deviation: true  },
]

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepPips({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={['h-1.5 rounded-full transition-all',
            i <= current ? 'w-6 bg-forest-500' : 'w-1.5 bg-stone-200'
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ─── Account step ─────────────────────────────────────────────────────────────

function AccountStep({ onDone }: { onDone: () => void }) {
  const { setUser } = useAuth()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await authApi.register(name, email, password)
      setUser(user)
      onDone()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input id="name"     label="Your name"  value={name}     onChange={e => setName(e.target.value)}     required placeholder="e.g. Umair" />
      <Input id="email"    label="Email"       type="email"  value={email}    onChange={e => setEmail(e.target.value)}    required placeholder="you@example.com" />
      <Input id="password" label="Password"    type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters" minLength={8} />
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
        Create account <ChevronRight size={16} />
      </Button>
    </form>
  )
}

// ─── Second account step ──────────────────────────────────────────────────────

function SecondAccountStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.register(name, email, password)
      onDone()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-stone-500">
        Add an account for the second person in your household.
        You can skip this and they can register later from Settings.
      </p>
      <Input id="name2"     label="Their name"          value={name}     onChange={e => setName(e.target.value)}     required />
      <Input id="email2"    label="Their email"          type="email"   value={email}    onChange={e => setEmail(e.target.value)}    required />
      <Input id="password2" label="Temporary password"   type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
        placeholder="They can change this later" />
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
        Add account <ChevronRight size={16} />
      </Button>
      <Button type="button" variant="ghost" size="lg" className="w-full" onClick={onSkip}>
        Skip for now
      </Button>
    </form>
  )
}

// ─── Add pets step ────────────────────────────────────────────────────────────

interface PetDraft {
  name: string
  species: 'dog' | 'cat'
  breed: string
  weight_kg: string
}

function PetsStep({ onDone }: { onDone: (dogs: Pet[]) => void }) {
  const [pets, setPets]       = useState<PetDraft[]>([{ name: '', species: 'dog', breed: '', weight_kg: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const addPet    = () => setPets(p => [...p, { name: '', species: 'dog', breed: '', weight_kg: '' }])
  const removePet = (i: number) => setPets(p => p.filter((_, idx) => idx !== i))
  const updatePet = (i: number, field: keyof PetDraft, value: string) =>
    setPets(p => p.map((pet, idx) => idx === i ? { ...pet, [field]: value } : pet))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pets.some(p => !p.name.trim())) { setError('All pets need a name.'); return }
    setLoading(true)
    setError('')
    try {
      const created = await Promise.all(
        pets.map(p => petsApi.create({
          name:       p.name.trim(),
          species:    p.species,
          breed:      p.breed || undefined,
          weight_kg:  p.weight_kg ? parseFloat(p.weight_kg) : undefined,
          // Dogs are created with default schedule slots so slot IDs exist for
          // the next step where the user adjusts the windows.
          schedule_slots: p.species === 'dog' ? DEFAULT_SCHEDULE_SLOTS : [],
        } as PetCreate))
      )
      onDone(created.filter(p => p.species === 'dog'))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail : 'Failed to create pets.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {pets.map((pet, i) => (
        <div key={i} className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-forest-800">Pet {i + 1}</span>
            {pets.length > 1 && (
              <button type="button" onClick={() => removePet(i)} className="text-xs text-red-500">Remove</button>
            )}
          </div>
          <Input label="Name" value={pet.name} onChange={e => updatePet(i, 'name', e.target.value)} required placeholder="e.g. Luna" />
          <div className="flex gap-2">
            {(['dog', 'cat'] as const).map(sp => (
              <button key={sp} type="button" onClick={() => updatePet(i, 'species', sp)}
                className={['flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize',
                  pet.species === sp ? 'bg-forest-500 text-white' : 'bg-white border border-stone-200 text-stone-500'
                ].join(' ')}>
                {sp === 'dog' ? '🐕 Dog' : '🐈 Cat'}
              </button>
            ))}
          </div>
          <Input label="Breed (optional)"       value={pet.breed}     onChange={e => updatePet(i, 'breed', e.target.value)}     placeholder="e.g. Border Collie" />
          <Input label="Weight kg (optional)"   type="number" step="0.1" min="0" value={pet.weight_kg}  onChange={e => updatePet(i, 'weight_kg', e.target.value)}  placeholder="e.g. 22.5" />
        </div>
      ))}
      <button type="button" onClick={addPet} className="text-sm text-forest-500 font-medium py-2">+ Add another pet</button>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Continue <ChevronRight size={16} />
      </Button>
    </form>
  )
}

// ─── Schedule step ────────────────────────────────────────────────────────────
// Dogs are already created with default slots. This step lets the user adjust
// the windows and calls PATCH on each existing slot.

interface SlotDraft {
  id:           number
  meal_type:    string
  window_start: string
  window_end:   string
  reason_required_on_deviation: boolean
}

const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', snack: 'Snack', dinner: 'Dinner' }

function SchedulesStep({ dogs, onDone }: { dogs: Pet[]; onDone: () => void }) {
  const [slotsByDog, setSlotsByDog] = useState<Record<number, SlotDraft[]>>(
    Object.fromEntries(
      dogs.map(dog => [
        dog.id,
        dog.schedule_slots.map(s => ({
          id:           s.id,
          meal_type:    s.meal_type,
          window_start: s.window_start.slice(0, 5),
          window_end:   s.window_end.slice(0, 5),
          reason_required_on_deviation: s.reason_required_on_deviation,
        })),
      ])
    )
  )
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const update = (petId: number, slotId: number, field: keyof SlotDraft, value: string | boolean) =>
    setSlotsByDog(prev => ({
      ...prev,
      [petId]: prev[petId].map(s => s.id === slotId ? { ...s, [field]: value } : s),
    }))

  const saveAll = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await Promise.all(
        dogs.flatMap(dog =>
          slotsByDog[dog.id].map(slot => {
            const update_data: ScheduleSlotUpdate = {
              window_start: slot.window_start + ':00',
              window_end:   slot.window_end   + ':00',
              reason_required_on_deviation: slot.reason_required_on_deviation,
            }
            return petsApi.updateSlot(dog.id, slot.id, update_data)
          })
        )
      )
      onDone()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail : 'Failed to save schedules.')
      setLoading(false)
    }
  }

  if (dogs.length === 0) {
    return (
      <div className="text-center py-6 flex flex-col gap-4">
        <p className="text-stone-500 text-sm">No dogs to configure. Your cat's meals are all ad hoc.</p>
        <Button size="lg" className="w-full" onClick={onDone}>Finish setup</Button>
      </div>
    )
  }

  return (
    <form onSubmit={saveAll} className="flex flex-col gap-6">
      <p className="text-sm text-stone-500">
        Adjust the daily feeding windows for each dog. Times are in your local timezone.
      </p>
      {dogs.map(dog => (
        <div key={dog.id}>
          <p className="font-semibold text-forest-800 mb-3">{dog.name}</p>
          {(slotsByDog[dog.id] ?? []).map(slot => (
            <div key={slot.id} className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-forest-700">{MEAL_LABELS[slot.meal_type] ?? slot.meal_type}</span>
                <label className="flex items-center gap-2 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={slot.reason_required_on_deviation}
                    onChange={e => update(dog.id, slot.id, 'reason_required_on_deviation', e.target.checked)}
                    className="rounded"
                  />
                  Reason required if late
                </label>
              </div>
              <div className="flex gap-3 items-end">
                <Input label="From" type="time" value={slot.window_start}
                  onChange={e => update(dog.id, slot.id, 'window_start', e.target.value)} className="flex-1" />
                <Input label="To"   type="time" value={slot.window_end}
                  onChange={e => update(dog.id, slot.id, 'window_end', e.target.value)} className="flex-1" />
              </div>
            </div>
          ))}
        </div>
      ))}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" loading={loading} className="w-full">Finish setup</Button>
    </form>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function SetupWizard() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  // Registration status determines where an already-authenticated visitor
  // should resume: 'second-account' if the second account hasn't been
  // created yet, otherwise 'pets'. Unauthenticated visitors always start
  // at 'account' (this is the only reachable path to create the first
  // account on a fresh deployment).
  const { data: regStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn:  authApi.status,
    enabled:  !authLoading,
  })

  const [step, setStep] = useState<Step | null>(null)
  const [dogs, setDogs] = useState<Pet[]>([])

  useEffect(() => {
    if (step !== null) return       // Already determined; don't override.
    if (authLoading || statusLoading) return

    if (!user) {
      // No session. Only allow account creation if registration is still
      // open. If both accounts already exist, an unauthenticated visitor
      // here (stale bookmark, PWA start_url, cleared history) must be sent
      // to the login screen rather than shown a sign-up form that will
      // always fail with "maximum accounts reached".
      if (regStatus && !regStatus.is_open) {
        navigate('/login', { replace: true })
        return
      }
      setStep('account')
    } else if (regStatus?.is_open) {
      setStep('second-account')
    } else {
      setStep('pets')
    }
  }, [authLoading, statusLoading, user, regStatus, step, navigate])

  // Wait until the starting step is known before rendering the wizard shell,
  // to avoid a flash of the wrong step.
  if (step === null) return <LoadingScreen />

  const STEPS: Step[] = ['account', 'second-account', 'pets', 'schedules']
  const stepIndex = STEPS.indexOf(step)

  const TITLES: Record<Step, string> = {
    'account':        'Create your account',
    'second-account': 'Add a second account',
    'pets':           'Add your pets',
    'schedules':      'Set feeding windows',
    'done':           'All set!',
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🐾</div>
          <h1 className="text-xl font-semibold text-forest-900">Welcome to Pet Tracker</h1>
          <p className="text-sm text-stone-400 mt-1">Let's get everything set up.</p>
        </div>

        <StepPips current={stepIndex} total={STEPS.length} />

        <div className="bg-white rounded-3xl shadow-card p-6">
          <h2 className="text-lg font-semibold text-forest-900 mb-5">{TITLES[step]}</h2>

          {step === 'account' && (
            <AccountStep onDone={() => setStep('second-account')} />
          )}

          {step === 'second-account' && (
            <SecondAccountStep
              onDone={() => setStep('pets')}
              onSkip={() => setStep('pets')}
            />
          )}

          {step === 'pets' && (
            <PetsStep
              onDone={createdDogs => {
                setDogs(createdDogs)
                setStep('schedules')
              }}
            />
          )}

          {step === 'schedules' && (
            <SchedulesStep
              dogs={dogs}
              onDone={() => navigate('/dashboard', { replace: true })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
