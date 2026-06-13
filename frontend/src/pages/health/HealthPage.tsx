import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { healthApi, petsApi } from '@/api'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, ScoreChip, EmptyState, Fab, SectionHeader } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { LogObservationModal } from './LogObservationModal'
import { formatDate, todayISO } from '@/utils/petColors'
import { Heart, Plus } from 'lucide-react'
import type { HealthObservation, Pet } from '@/types/api'

// ─── Observation card ─────────────────────────────────────────────────────────

function ObservationCard({ obs, pet }: { obs: HealthObservation; pet: Pet }) {
  const isToday = obs.observation_date === todayISO()

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <PetAvatar petId={pet.id} name={pet.name} species={pet.species} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-forest-900">{pet.name}</span>
            {isToday
              ? <Badge variant="green">Today</Badge>
              : <span className="text-xs text-stone-400">{formatDate(obs.observation_date)}</span>
            }
          </div>

          {/* Score chips */}
          <div className="flex gap-4 mt-3">
            <ScoreChip label="Energy"    value={obs.energy_level}      max={10} />
            <ScoreChip label="Digestion" value={obs.digestion_comfort} max={10} />
            <ScoreChip label="Stool"     value={obs.stool_quality}     max={7}  />
            {obs.reaction_severity !== null && (
              <ScoreChip label="Reaction" value={obs.reaction_severity} max={10} />
            )}
          </div>

          {/* Symptoms */}
          {obs.symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {obs.symptoms.map(s => (
                <Badge key={s.symptom.id} variant="amber">{s.symptom.name}</Badge>
              ))}
            </div>
          )}

          {/* Notes */}
          {obs.notes && (
            <p className="text-xs text-stone-400 mt-2 italic">"{obs.notes}"</p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Per-pet health summary ────────────────────────────────────────────────────

function PetHealthSummary({ pet, onLog }: { pet: Pet; onLog: (petId: number) => void }) {
  const { data: recent = [] } = useQuery({
    queryKey: ['health', pet.id, 'recent'],
    queryFn:  () => healthApi.list({ pet_id: pet.id, limit: 3 }),
  })

  const todayObs = recent.find(o => o.observation_date === todayISO())

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <PetAvatar petId={pet.id} name={pet.name} species={pet.species} size="md" />
        <div className="flex-1">
          <p className="font-semibold text-forest-900">{pet.name}</p>
          <p className="text-xs text-stone-400">
            {todayObs ? 'Observed today' : 'No observation today'}
          </p>
        </div>
        <button
          onClick={() => onLog(pet.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-forest-50 text-forest-600 text-sm font-medium"
        >
          <Plus size={14} /> Log
        </button>
      </div>

      {todayObs && (
        <div className="flex gap-4 pt-2 border-t border-stone-100">
          <ScoreChip label="Energy"    value={todayObs.energy_level}      max={10} />
          <ScoreChip label="Digestion" value={todayObs.digestion_comfort} max={10} />
          <ScoreChip label="Stool"     value={todayObs.stool_quality}     max={7}  />
        </div>
      )}
    </Card>
  )
}

// ─── Health page ──────────────────────────────────────────────────────────────

export function HealthPage() {
  const [modalOpen, setModalOpen]     = useState(false)
  const [preselectedPet, setPreselected] = useState<number | undefined>()

  const { data: pets = [] } = useQuery({ queryKey: ['pets'], queryFn: petsApi.list })
  const { data: allObs = [], isLoading } = useQuery({
    queryKey: ['health'],
    queryFn:  () => healthApi.list({ limit: 50 }),
  })

  const petMap = Object.fromEntries(pets.map(p => [p.id, p]))
  const activePets = pets.filter(p => !p.deleted_at)

  const openModal = (petId?: number) => {
    setPreselected(petId)
    setModalOpen(true)
  }

  // Group observations by date
  const grouped = allObs.reduce<Record<string, HealthObservation[]>>((acc, obs) => {
    ;(acc[obs.observation_date] ??= []).push(obs)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort().reverse()

  return (
    <AppShell title="Health">
      <div className="flex flex-col gap-1 pb-4">

        {/* Per-pet summary cards */}
        {activePets.length > 0 && (
          <div className="px-4 pt-2 flex flex-col gap-3">
            {activePets.map(pet => (
              <PetHealthSummary key={pet.id} pet={pet} onLog={openModal} />
            ))}
          </div>
        )}

        {/* History */}
        <SectionHeader>History</SectionHeader>

        {isLoading && <p className="text-sm text-stone-400 text-center py-4">Loading…</p>}

        {!isLoading && allObs.length === 0 && (
          <EmptyState
            icon={Heart}
            title="No observations yet"
            body="Tap + to log your first health observation."
          />
        )}

        {sortedDates.map(date => {
          const label = date === todayISO() ? 'Today' : formatDate(date)
          return (
            <div key={date}>
              <SectionHeader>{label}</SectionHeader>
              <div className="px-4 flex flex-col gap-3 pb-2">
                {grouped[date].map(obs => {
                  const pet = petMap[obs.pet_id]
                  return pet ? <ObservationCard key={obs.id} obs={obs} pet={pet} /> : null
                })}
              </div>
            </div>
          )
        })}
      </div>

      <Fab onClick={() => openModal()}>
        <Plus size={26} />
      </Fab>

      <LogObservationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        preselectedPetId={preselectedPet}
      />
    </AppShell>
  )
}
