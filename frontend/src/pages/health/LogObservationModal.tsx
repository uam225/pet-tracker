import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { petsApi, healthApi } from '@/api'
import { ApiRequestError } from '@/api/client'
import { Modal, Button, Textarea } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { todayISO } from '@/utils/petColors'
import { STOOL_QUALITY_LABELS } from '@/utils/petColors'
import type { HealthObservationCreate, ObservationSymptomCreate, Pet, Symptom } from '@/types/api'

type Step = 'pet' | 'scores' | 'symptoms' | 'notes'

interface LogObservationModalProps {
  isOpen:  boolean
  onClose: () => void
  /** Pre-select a pet when opening from a pet's health card */
  preselectedPetId?: number
}

// ─── Score button row ─────────────────────────────────────────────────────────

function ScoreRow({ label, description, min, max, value, onChange }: {
  label:       string
  description: string
  min:         number
  max:         number
  value:       number | null
  onChange:    (v: number | null) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-forest-800">{label}</p>
        <p className="text-xs text-stone-400">{description}</p>
      </div>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: max - min + 1 }, (_, i) => {
          const v = min + i
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(active ? null : v)}
              className={[
                'w-9 h-9 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-forest-500 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
              ].join(' ')}
            >
              {v}
            </button>
          )
        })}
      </div>
      {max === 7 && value !== null && (
        <p className="text-xs text-stone-400">{STOOL_QUALITY_LABELS[value]}</p>
      )}
    </div>
  )
}

// ─── Symptom chip grid ────────────────────────────────────────────────────────

function SymptomGrid({ symptoms, selected, onToggle }: {
  symptoms: Symptom[]
  selected: Set<number>
  onToggle: (id: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {symptoms.map(sym => {
        const isSelected = selected.has(sym.id)
        return (
          <button
            key={sym.id}
            type="button"
            onClick={() => onToggle(sym.id)}
            className={[
              'px-3 py-1.5 rounded-xl text-sm font-medium transition-colors',
              isSelected
                ? 'bg-copper-DEFAULT text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
            ].join(' ')}
          >
            {sym.name}
          </button>
        )
      })}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function LogObservationModal({ isOpen, onClose, preselectedPetId }: LogObservationModalProps) {
  const qc = useQueryClient()

  const [step, setStep]           = useState<Step>(preselectedPetId ? 'scores' : 'pet')
  const [petId, setPetId]         = useState<number | null>(preselectedPetId ?? null)
  const [obsDate, setObsDate]     = useState(todayISO())
  const [energy, setEnergy]       = useState<number | null>(null)
  const [digestion, setDigestion] = useState<number | null>(null)
  const [stool, setStool]         = useState<number | null>(null)
  const [reaction, setReaction]   = useState<number | null>(null)
  const [selectedSymptoms, setSelectedSymptoms] = useState<Set<number>>(new Set())
  const [notes, setNotes]         = useState('')
  const [error, setError]         = useState('')

  const { data: pets = [] }     = useQuery({ queryKey: ['pets'], queryFn: petsApi.list })
  const selectedPet: Pet | undefined = pets.find(p => p.id === petId)

  const { data: symptoms = [] } = useQuery({
    queryKey: ['symptoms', selectedPet?.species],
    queryFn:  () => healthApi.symptoms(selectedPet?.species as 'dog' | 'cat' | undefined),
    enabled:  !!selectedPet,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const syms: ObservationSymptomCreate[] = Array.from(selectedSymptoms).map(id => ({ symptom_id: id }))
      const payload: HealthObservationCreate = {
        pet_id:           petId!,
        observation_date: obsDate,
        energy_level:     energy ?? undefined,
        digestion_comfort: digestion ?? undefined,
        stool_quality:    stool ?? undefined,
        reaction_severity: reaction ?? undefined,
        symptoms:         syms,
        notes:            notes || undefined,
      }
      return healthApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiRequestError ? err.detail : 'Failed to save observation.')
    },
  })

  const handleClose = () => {
    setStep(preselectedPetId ? 'scores' : 'pet')
    setPetId(preselectedPetId ?? null)
    setObsDate(todayISO())
    setEnergy(null); setDigestion(null); setStool(null); setReaction(null)
    setSelectedSymptoms(new Set()); setNotes(''); setError('')
    onClose()
  }

  const toggleSymptom = (id: number) => {
    setSelectedSymptoms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const hasAnyScore = energy !== null || digestion !== null || stool !== null || reaction !== null

  const BACK: Partial<Record<Step, Step>> = {
    scores: 'pet', symptoms: 'scores', notes: 'symptoms',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'pet' ? 'Log observation' : selectedPet?.name ?? 'Log observation'}
      footer={BACK[step] && !preselectedPetId ? (
        <button onClick={() => setStep(BACK[step]!)} className="text-sm text-stone-400 py-1">← Back</button>
      ) : undefined}
    >
      {/* Pet selection */}
      {step === 'pet' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-500">Which pet is this observation for?</p>
          {pets.filter(p => !p.deleted_at).map(pet => (
            <button
              key={pet.id}
              onClick={() => { setPetId(pet.id); setStep('scores') }}
              className="flex items-center gap-3 p-3 rounded-2xl border border-stone-200 hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <PetAvatar petId={pet.id} name={pet.name} species={pet.species} size="md" />
              <span className="font-medium text-forest-900">{pet.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Scores */}
      {step === 'scores' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-forest-800">Observation date</label>
            <input
              type="date"
              value={obsDate}
              max={todayISO()}
              onChange={e => setObsDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
          <ScoreRow label="Energy level" description="1 = lethargic, 10 = very energetic" min={1} max={10} value={energy} onChange={setEnergy} />
          <ScoreRow label="Digestion comfort" description="1 = severe distress, 10 = no issues" min={1} max={10} value={digestion} onChange={setDigestion} />
          <ScoreRow label="Stool quality" description="Purina Fecal Score. 3 = ideal." min={1} max={7} value={stool} onChange={setStool} />
          <ScoreRow label="Reaction severity" description="0 = confirmed clear, 10 = severe. Leave blank if not assessed." min={0} max={10} value={reaction} onChange={setReaction} />
          <Button size="lg" className="w-full" onClick={() => setStep('symptoms')}>
            {hasAnyScore ? 'Continue' : 'Skip scores →'}
          </Button>
        </div>
      )}

      {/* Symptoms */}
      {step === 'symptoms' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-stone-500">Select any symptoms observed today. Leave blank if none.</p>
          {symptoms.length === 0
            ? <p className="text-sm text-stone-400">No symptoms loaded.</p>
            : <SymptomGrid symptoms={symptoms} selected={selectedSymptoms} onToggle={toggleSymptom} />
          }
          <Button size="lg" className="w-full" onClick={() => setStep('notes')}>
            {selectedSymptoms.size > 0 ? `Continue (${selectedSymptoms.size} selected)` : 'No symptoms → Continue'}
          </Button>
        </div>
      )}

      {/* Notes + submit */}
      {step === 'notes' && (
        <div className="flex flex-col gap-4">
          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional observations…"
            rows={4}
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}
          <Button size="lg" className="w-full" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save observation
          </Button>
        </div>
      )}
    </Modal>
  )
}
