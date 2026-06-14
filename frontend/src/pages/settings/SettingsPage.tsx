import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { petsApi, authApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { ApiRequestError } from '@/api/client'
import { Modal, Card, Button, Input } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { ChevronLeft, ChevronRight, LogOut, User, Edit2, Trash2 } from 'lucide-react'
import { formatTime, MEAL_TYPE_LABELS } from '@/utils/petColors'
import type { Pet, ScheduleSlot } from '@/types/api'

// ─── Edit pet modal ───────────────────────────────────────────────────────────

function EditPetModal({ pet, onClose }: { pet: Pet; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName]       = useState(pet.name)
  const [breed, setBreed]     = useState(pet.breed ?? '')
  const [weight, setWeight]   = useState(pet.weight_kg?.toString() ?? '')
  const [dob, setDob]         = useState(pet.date_of_birth ?? '')
  const [error, setError]     = useState('')

  const mutation = useMutation({
    mutationFn: () => petsApi.update(pet.id, {
      name: name.trim(),
      breed: breed || undefined,
      weight_kg: weight ? parseFloat(weight) : undefined,
      date_of_birth: dob || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pets'] }); onClose() },
    onError: (e: unknown) => setError(e instanceof ApiRequestError ? e.detail : 'Failed to update.'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Edit ${pet.name}`}>
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} required />
        <Input label="Breed" value={breed} onChange={e => setBreed(e.target.value)} placeholder="Optional" />
        <Input label="Weight (kg)" type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Optional" />
        <Input label="Date of birth" type="date" value={dob} onChange={e => setDob(e.target.value)} />
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <Button size="lg" className="w-full" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Save changes
        </Button>
      </div>
    </Modal>
  )
}

// ─── Edit schedule modal ──────────────────────────────────────────────────────

function EditScheduleModal({ pet, onClose }: { pet: Pet; onClose: () => void }) {
  const qc = useQueryClient()
  const [slots, setSlots] = useState<ScheduleSlot[]>(pet.schedule_slots)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const update = (slotId: number, field: 'window_start' | 'window_end', value: string) =>
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, [field]: value } : s))

  const saveAll = async () => {
    setSaving(true)
    setError('')
    try {
      await Promise.all(
        slots.map(s => petsApi.updateSlot(pet.id, s.id, {
          window_start: s.window_start,
          window_end:   s.window_end,
          reason_required_on_deviation: s.reason_required_on_deviation,
        }))
      )
      qc.invalidateQueries({ queryKey: ['pets'] })
      onClose()
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.detail : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${pet.name}'s schedule`}>
      <div className="flex flex-col gap-4">
        {slots.map(slot => (
          <div key={slot.id} className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-forest-800">{MEAL_TYPE_LABELS[slot.meal_type]}</p>
              <label className="flex items-center gap-2 text-xs text-stone-500">
                <input
                  type="checkbox"
                  checked={slot.reason_required_on_deviation}
                  onChange={e =>
                    setSlots(prev => prev.map(s =>
                      s.id === slot.id ? { ...s, reason_required_on_deviation: e.target.checked } : s
                    ))
                  }
                  className="rounded"
                />
                Require reason if late
              </label>
            </div>
            <div className="flex gap-3">
              <Input
                label="From"
                type="time"
                value={slot.window_start.slice(0, 5)}
                onChange={e => update(slot.id, 'window_start', e.target.value + ':00')}
                className="flex-1"
              />
              <Input
                label="To"
                type="time"
                value={slot.window_end.slice(0, 5)}
                onChange={e => update(slot.id, 'window_end', e.target.value + ':00')}
                className="flex-1"
              />
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <Button size="lg" className="w-full" loading={saving} onClick={saveAll}>
          Save schedule
        </Button>
      </div>
    </Modal>
  )
}

// ─── Remove pet confirmation modal ────────────────────────────────────────────

function RemovePetModal({ pet, onClose }: { pet: Pet; onClose: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => petsApi.delete(pet.id),
    onSuccess: () => {
      // Refresh both the settings list and any dashboard/feed views.
      qc.invalidateQueries({ queryKey: ['pets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiRequestError ? e.detail : 'Failed to remove pet.'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Remove ${pet.name}?`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-500">
          {pet.name} will be removed from your active pets and will no longer appear
          when logging meals or health observations. Existing historical records are
          preserved and not deleted.
        </p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Remove {pet.name}
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Settings page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const navigate  = useNavigate()
  const { user, logout } = useAuth()
  const qc = useQueryClient()
  const [editPet, setEditPet]         = useState<Pet | null>(null)
  const [editSchedule, setEditSchedule] = useState<Pet | null>(null)
  const [removePet, setRemovePet]     = useState<Pet | null>(null)

  const { data: pets = [] } = useQuery({ queryKey: ['pets'], queryFn: petsApi.list })
  const activePets = pets.filter(p => !p.deleted_at)

  const handleLogout = async () => {
    await logout()
    qc.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-stone-100/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-stone-200 text-stone-500"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-forest-900">Settings</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pb-12 flex flex-col gap-6">

        {/* Pets section */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2 px-1">Pets</p>
          <Card className="divide-y divide-stone-100">
            {activePets.map(pet => (
              <div key={pet.id} className="p-4 flex items-center gap-3">
                <PetAvatar petId={pet.id} name={pet.name} species={pet.species} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-forest-900">{pet.name}</p>
                  <p className="text-xs text-stone-400 capitalize">{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p>
                  {pet.weight_kg && <p className="text-xs text-stone-400">{pet.weight_kg} kg</p>}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => setEditPet(pet)} className="flex items-center gap-1 text-xs text-forest-600 font-medium">
                    <Edit2 size={11} /> Edit
                  </button>
                  {pet.species === 'dog' && pet.schedule_slots.length > 0 && (
                    <button onClick={() => setEditSchedule(pet)} className="flex items-center gap-1 text-xs text-stone-400">
                      Schedule <ChevronRight size={11} />
                    </button>
                  )}
                  <button onClick={() => setRemovePet(pet)} className="flex items-center gap-1 text-xs text-red-500">
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </section>

        {/* Account section */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2 px-1">Account</p>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-forest-100 flex items-center justify-center">
                <User size={18} className="text-forest-500" />
              </div>
              <div>
                <p className="font-medium text-forest-900">{user?.name}</p>
                <p className="text-xs text-stone-400">{user?.email}</p>
              </div>
            </div>
          </Card>
        </section>

        {/* Sign out */}
        <Button variant="danger" size="lg" className="w-full" onClick={handleLogout}>
          <LogOut size={16} /> Sign out
        </Button>
      </div>

      {/* Modals */}
      {editPet && <EditPetModal pet={editPet} onClose={() => setEditPet(null)} />}
      {editSchedule && <EditScheduleModal pet={editSchedule} onClose={() => setEditSchedule(null)} />}
      {removePet && <RemovePetModal pet={removePet} onClose={() => setRemovePet(null)} />}
    </div>
  )
}
