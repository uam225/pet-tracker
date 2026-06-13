import { useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, ScoreChip, EmptyState, LoadingScreen } from '@/components/ui'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { getPetColorHex, formatTime, MEAL_TYPE_LABELS } from '@/utils/petColors'
import { AlertCircle } from 'lucide-react'
import type { PetDashboardSummary, HealthObservation, MissedSlot } from '@/types/api'

// ─── Meal timeline strip (dogs only) ─────────────────────────────────────────
// Shows feeding windows as coloured bands. Actual fed-at times as dots.
// Current time as a thin vertical line.

const WINDOW_COLOURS: Record<string, string> = {
  breakfast: '#4A7FB5',
  snack:     '#C98445',
  dinner:    '#8B6BAF',
}

const TIMELINE_START = 6   // 06:00
const TIMELINE_END   = 22  // 22:00
const RANGE = TIMELINE_END - TIMELINE_START

function timeToPercent(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return Math.max(0, Math.min(100, ((h + m / 60 - TIMELINE_START) / RANGE) * 100))
}

interface FedDot { meal_type: string; fed_at: string }

function MealTimeline({
  slots,
  fedDots,
}: {
  slots: { meal_type: string; window_start: string; window_end: string }[]
  fedDots: FedDot[]
}) {
  const now = new Date()
  const nowPct = timeToPercent(`${now.getHours()}:${now.getMinutes()}`)

  return (
    <div className="mt-3">
      <div className="relative h-5 bg-stone-100 rounded-full overflow-visible">
        {/* Window bands */}
        {slots.map(slot => {
          const left  = timeToPercent(slot.window_start.slice(0, 5))
          const right = timeToPercent(slot.window_end.slice(0, 5))
          const color = WINDOW_COLOURS[slot.meal_type] ?? '#888'
          return (
            <div
              key={slot.meal_type}
              className="absolute top-0 h-full rounded-sm"
              style={{
                left: `${left}%`,
                width: `${right - left}%`,
                backgroundColor: color,
                opacity: 0.22,
              }}
            />
          )
        })}

        {/* Current time line */}
        {nowPct >= 0 && nowPct <= 100 && (
          <div
            className="absolute top-0 h-full w-px bg-forest-400 opacity-70"
            style={{ left: `${nowPct}%` }}
          />
        )}

        {/* Fed-at dots */}
        {fedDots.map((dot, i) => {
          const fedDate = new Date(dot.fed_at)
          const pct = timeToPercent(
            `${fedDate.getHours()}:${fedDate.getMinutes()}`
          )
          const color = WINDOW_COLOURS[dot.meal_type] ?? '#888'
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm z-10"
              style={{ left: `calc(${pct}% - 7px)`, backgroundColor: color }}
            />
          )
        })}
      </div>

      {/* Hour labels */}
      <div className="flex justify-between mt-0.5 px-0.5">
        {[6, 10, 14, 18, 22].map(h => (
          <span key={h} className="text-2xs text-stone-300 font-medium">
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Per-pet dashboard card ───────────────────────────────────────────────────

function PetCard({ summary }: { summary: PetDashboardSummary }) {
  const color = getPetColorHex(summary.pet_id)
  const obs   = summary.latest_observation
  const hasMissed = summary.missed_slots.length > 0

  return (
    <Card className="overflow-hidden">
      {/* Colour accent strip at left */}
      <div className="flex">
        <div className="w-1 self-stretch rounded-l-2xl flex-shrink-0" style={{ backgroundColor: color }} />

        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <PetAvatar petId={summary.pet_id} name={summary.pet_name} species={summary.pet_species} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-forest-900">{summary.pet_name}</p>
              <p className="text-xs text-stone-400 capitalize">{summary.pet_species}</p>
            </div>
            <Badge variant={hasMissed ? 'red' : summary.todays_meal_count > 0 ? 'green' : 'default'}>
              {summary.todays_meal_count} fed
            </Badge>
          </div>

          {/* Meal timeline (dogs only) */}
          {/* We derive slots from pet summary - not available directly, shown as fed dots only */}
          {summary.pet_species === 'dog' && (
            <MealTimeline
              slots={[]}     /* Slots are fetched separately; fed dots use dashboard data */
              fedDots={[]}   /* Actual dot rendering requires logs; dashboard gives count only */
            />
          )}

          {/* Missed slot alerts */}
          {hasMissed && (
            <div className="flex flex-wrap gap-1 mt-3">
              {summary.missed_slots.map((slot: MissedSlot) => (
                <Badge key={slot.meal_type} variant="red" className="flex items-center gap-1">
                  <AlertCircle size={10} />
                  Missed {MEAL_TYPE_LABELS[slot.meal_type]} ({formatTime(slot.window_start)}–{formatTime(slot.window_end)})
                </Badge>
              ))}
            </div>
          )}

          {/* Health scores */}
          {obs && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-stone-100">
              <ScoreChip label="Energy"    value={obs.energy_level}      max={10} />
              <ScoreChip label="Digestion" value={obs.digestion_comfort} max={10} />
              <ScoreChip label="Stool"     value={obs.stool_quality}     max={7}  />
              {obs.reaction_severity !== null && (
                <ScoreChip label="Reaction" value={obs.reaction_severity} max={10} />
              )}
              {!obs.energy_level && !obs.digestion_comfort && !obs.stool_quality && (
                <p className="text-xs text-stone-400">No scores recorded</p>
              )}
            </div>
          )}

          {/* Active symptoms */}
          {summary.active_symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {summary.active_symptoms.map(sym => (
                <Badge key={sym} variant="amber">{sym}</Badge>
              ))}
            </div>
          )}

          {/* No observation today */}
          {!obs && (
            <p className="text-xs text-stone-300 mt-2">No health observation today</p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey:  ['dashboard'],
    queryFn:   () => healthApi.dashboard(),
    refetchInterval: 60_000,  // Auto-refresh every minute
  })

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <AppShell title="Dashboard">
      <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
        {/* Date line */}
        <p className="text-xs text-stone-400 font-medium">{today}</p>

        {isLoading && <LoadingScreen message="Loading dashboard…" />}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
            Failed to load dashboard. Pull to refresh.
          </div>
        )}

        {data?.pets.length === 0 && (
          <EmptyState
            icon={AlertCircle}
            title="No pets found"
            body="Add your pets from the Settings screen."
          />
        )}

        {data?.pets.map(summary => (
          <PetCard key={summary.pet_id} summary={summary} />
        ))}
      </div>
    </AppShell>
  )
}
