import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { mealLogsApi, petsApi } from '@/api'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, EmptyState, Fab, SectionHeader } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { LogMealModal } from './LogMealModal'
import { MEAL_TYPE_LABELS, formatDeviation, formatDateTime } from '@/utils/petColors'
import { Utensils, Plus } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import type { MealLog } from '@/types/api'

// ─── Meal log item card ───────────────────────────────────────────────────────

function MealLogCard({ log, petName, petId, petSpecies }: {
  log: MealLog
  petName: string
  petId: number
  petSpecies: string
}) {
  const hasDeviation = log.deviation_minutes !== null && log.deviation_minutes !== 0

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <PetAvatar petId={petId} name={petName} species={petSpecies as 'dog' | 'cat'} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-forest-900">{petName}</span>
            <Badge variant="default">{MEAL_TYPE_LABELS[log.meal_type]}</Badge>
            {hasDeviation && (
              <Badge variant={log.deviation_minutes! > 0 ? 'amber' : 'blue'}>
                {formatDeviation(log.deviation_minutes!)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-0.5">{formatDateTime(log.fed_at)}</p>

          {/* Food items */}
          {log.items.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {log.items.map(item => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span className="text-forest-700 truncate">{item.food_item.name}</span>
                  <span className="text-stone-400 text-xs flex-shrink-0 ml-2">{item.portion_grams}g</span>
                </div>
              ))}
            </div>
          )}

          {/* Allergen indicators */}
          {log.items.some(item => item.food_item.ingredients.some(i => i.ingredient.is_common_allergen)) && (
            <div className="mt-1.5">
              <Badge variant="amber" className="text-2xs">Contains allergens</Badge>
            </div>
          )}

          {/* Deviation reason */}
          {log.deviation_reason && (
            <p className="text-xs text-stone-400 mt-1.5 italic">"{log.deviation_reason}"</p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Date section header ──────────────────────────────────────────────────────

function dateLabel(isoDate: string): string {
  const d = parseISO(isoDate)
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'd MMMM')
}

// ─── Feed page ────────────────────────────────────────────────────────────────

export function FeedPage() {
  const [modalOpen, setModalOpen] = useState(false)

  const { data: pets   = [] } = useQuery({ queryKey: ['pets'],      queryFn: petsApi.list })
  const { data: logs   = [], isLoading } = useQuery({
    queryKey: ['meal-logs'],
    queryFn:  () => mealLogsApi.list({ limit: 100 }),
  })

  const petMap = Object.fromEntries(pets.map(p => [p.id, p]))

  // Group logs by date
  const grouped = logs.reduce<Record<string, MealLog[]>>((acc, log) => {
    const date = log.fed_at.slice(0, 10)
    ;(acc[date] ??= []).push(log)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort().reverse()

  return (
    <AppShell title="Feed">
      <div className="flex flex-col gap-1 pb-4">
        {isLoading && <p className="text-sm text-stone-400 text-center py-8">Loading…</p>}

        {!isLoading && logs.length === 0 && (
          <EmptyState
            icon={Utensils}
            title="No meals logged yet"
            body="Tap the + button to log your first meal."
          />
        )}

        {sortedDates.map(date => (
          <div key={date}>
            <SectionHeader>{dateLabel(date)}</SectionHeader>
            <div className="px-4 flex flex-col gap-3 pb-2">
              {grouped[date].map(log => {
                const pet = petMap[log.pet_id]
                return pet ? (
                  <MealLogCard
                    key={log.id}
                    log={log}
                    petName={pet.name}
                    petId={pet.id}
                    petSpecies={pet.species}
                  />
                ) : null
              })}
            </div>
          </div>
        ))}
      </div>

      <Fab onClick={() => setModalOpen(true)}>
        <Plus size={26} />
      </Fab>

      <LogMealModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </AppShell>
  )
}
